import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Grid,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { useAppTheme } from "../../theme";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../api/client";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export const SettingsPage: React.FC = () => {
  const { mode, setMode } = useAppTheme();
  const { pinSet, refreshAuth } = useAuth();

  // Settings State
  const [expiryDays, setExpiryDays] = useState(30);
  const [baseUrl, setBaseUrl] = useState("");
  const [labelPreset, setLabelPreset] = useState("medium");
  const [backupKeep, setBackupKeep] = useState(7);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Storage & Backups
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [backups, setBackups] = useState<any[]>([]);

  // PIN Dialogs
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // Restore State
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  const loadSettingsAndStats = async () => {
    try {
      const s = await api.getSettings();
      setExpiryDays(s.expiry_warn_days || 30);
      setBaseUrl(s.base_url || "");
      setLabelPreset(s.label_preset || "medium");
      setBackupKeep(s.backup_keep || 7);

      const stats = await api.getStorage();
      setStorageStats(stats);

      const b = await api.getBackups();
      setBackups(b);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSettingsAndStats();
  }, []);

  const handleSaveGeneral = async () => {
    try {
      await api.updateSettings({
        expiry_warn_days: expiryDays,
        base_url: baseUrl.trim() || null,
        label_preset: labelPreset,
        backup_keep: backupKeep,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutoDetectBaseUrl = () => {
    setBaseUrl(window.location.origin);
  };

  const handleSavePin = async () => {
    if (newPin && newPin !== confirmPin) {
      setPinError("New PINs do not match");
      return;
    }

    try {
      await api.changePin(currentPin || undefined, newPin || undefined);
      setPinDialogOpen(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setPinError(null);
      await refreshAuth();
    } catch (err: any) {
      setPinError(err.error?.message || "Failed to update PIN");
    }
  };

  const handleDownloadBackup = () => {
    window.location.href = "/api/admin/backup";
  };

  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setRestoreConfirmOpen(true);
    }
    if (e.target) e.target.value = "";
  };

  const handleConfirmRestore = async () => {
    if (!restoreFile) return;
    setIsRestoring(true);
    try {
      const res = await api.restoreBackup(restoreFile);
      setRestoreMessage(res.message);
      setRestoreConfirmOpen(false);
      await loadSettingsAndStats();
    } catch (err: any) {
      setRestoreMessage(err.error?.message || "Restore failed");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 840, mx: "auto" }}>
      <PageHeader
        title="Settings & Administration"
        subtitle="Household security, network addresses, backup/restore, and export options"
      />

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings updated successfully!
        </Alert>
      )}

      {restoreMessage && (
        <Alert severity="info" onClose={() => setRestoreMessage(null)} sx={{ mb: 3 }}>
          {restoreMessage}
        </Alert>
      )}

      {/* Security: Household PIN */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <LockOutlinedIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Household Security (PIN)
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setPinError(null);
                setCurrentPin("");
                setNewPin("");
                setConfirmPin("");
                setPinDialogOpen(true);
              }}
            >
              {pinSet ? "Change / Remove PIN" : "Set Household PIN"}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {pinSet
              ? "A household PIN is currently active. Devices must enter this PIN to access HomeInventory. Failed attempts are rate-limited to 5 per minute."
              : "No PIN is configured. Anyone on your local home Wi-Fi can view and edit items without logging in."}
          </Typography>
        </CardContent>
      </Card>

      {/* Network & QR Base URL */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <DnsOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Server Address for QR Codes
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This URL is encoded into QR codes so mobile cameras open the app directly. We recommend setting a static IP or DHCP reservation on your home router.
          </Typography>

          <Box sx={{ display: "flex", gap: 1.5, mb: 1 }}>
            <TextField
              label="Base URL"
              placeholder="e.g. http://192.168.1.100:8000"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              fullWidth
            />
            <Button variant="outlined" onClick={handleAutoDetectBaseUrl} sx={{ whiteSpace: "nowrap" }}>
              Use Current Origin
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Preferences & Expiry */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Inventory Preferences
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                type="number"
                label="Expiry Warning Window (Days)"
                value={expiryDays}
                onChange={(e) => setExpiryDays(Math.max(1, parseInt(e.target.value) || 30))}
                helperText="Items expiring within this many days are highlighted amber."
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Default Label Preset</InputLabel>
                <Select
                  value={labelPreset}
                  label="Default Label Preset"
                  onChange={(e) => setLabelPreset(e.target.value)}
                >
                  <MenuItem value="small">Small (40 x 20 mm)</MenuItem>
                  <MenuItem value="medium">Medium (60 x 40 mm)</MenuItem>
                  <MenuItem value="a4_grid">A4 Grid (3x8 Labels)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Button variant="contained" onClick={handleSaveGeneral} sx={{ mt: 2 }}>
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <PaletteOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Appearance & Theme
            </Typography>
          </Box>
          <FormControl sx={{ minWidth: 200, mt: 1 }}>
            <InputLabel>Theme Mode</InputLabel>
            <Select
              value={mode}
              label="Theme Mode"
              onChange={(e) => setMode(e.target.value as any)}
            >
              <MenuItem value="system">Follow System</MenuItem>
              <MenuItem value="light">Light Theme</MenuItem>
              <MenuItem value="dark">Dark Theme</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Backup, Restore & Storage */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <StorageOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Backups & Storage
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            HomeInventory stores your complete database and photo files locally in the <code>data/</code> folder.
          </Typography>

          {storageStats && (
            <Box sx={{ display: "flex", gap: 3, mb: 2.5, flexWrap: "wrap", p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Database Size</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatBytes(storageStats.db_bytes)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Photos Size</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatBytes(storageStats.photos_bytes)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Backups Size</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formatBytes(storageStats.backups_bytes)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Total Storage</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }} color="primary">{formatBytes(storageStats.total_bytes)}</Typography>
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<CloudDownloadOutlinedIcon />}
              onClick={handleDownloadBackup}
            >
              Download Backup Now (.zip)
            </Button>

            <input
              type="file"
              accept=".zip"
              ref={restoreInputRef}
              style={{ display: "none" }}
              onChange={handleSelectRestoreFile}
            />
            <Button
              variant="outlined"
              color="warning"
              startIcon={<CloudUploadOutlinedIcon />}
              onClick={() => restoreInputRef.current?.click()}
            >
              Restore from Backup (.zip)
            </Button>
          </Box>

          {backups.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Recent Backups on Disk ({backups.length})
              </Typography>
              <List disablePadding>
                {backups.slice(0, 5).map((b) => (
                  <ListItem key={b.file_name} divider sx={{ px: 1, py: 0.5 }}>
                    <ListItemText
                      primary={b.file_name}
                      secondary={`${new Date(b.created_at).toLocaleString()} • ${formatBytes(b.size_bytes)}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Export & Reports */}
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <FileDownloadOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Data Export
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Export all items with custom fields into standard spreadsheet formats.
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              onClick={() => (window.location.href = "/api/admin/export?format=csv")}
            >
              Export as CSV (Spreadsheet)
            </Button>
            <Button
              variant="outlined"
              onClick={() => (window.location.href = "/api/admin/export?format=json")}
            >
              Export as JSON
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* PIN Dialog */}
      <Dialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{pinSet ? "Change or Remove PIN" : "Set Household PIN"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {pinSet
              ? "To change your PIN, enter the current PIN and the new PIN. To remove the PIN completely, leave the new PIN blank."
              : "Enter a 4-8 digit numeric PIN. You can change or remove this at any time."}
          </Typography>

          {pinError && <Alert severity="error">{pinError}</Alert>}

          {pinSet && (
            <TextField
              type="password"
              label="Current PIN"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              fullWidth
              autoFocus
            />
          )}

          <TextField
            type="password"
            label={pinSet ? "New PIN (leave blank to remove)" : "New Household PIN"}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            fullWidth
            autoFocus={!pinSet}
          />

          {newPin && (
            <TextField
              type="password"
              label="Confirm New PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              fullWidth
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPinDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePin}>
            {pinSet && !newPin ? "Remove PIN" : "Save PIN"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        open={restoreConfirmOpen}
        title="Confirm Database & Photos Restore"
        message={`Are you sure you want to restore from "${restoreFile?.name}"? A safety backup of your current database and photos will automatically be saved before restoring.`}
        confirmLabel="Restore"
        confirmColor="warning"
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setRestoreConfirmOpen(false);
          setRestoreFile(null);
        }}
        isLoading={isRestoring}
      />
    </Box>
  );
};
