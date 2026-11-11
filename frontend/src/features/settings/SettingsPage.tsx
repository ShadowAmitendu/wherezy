import React, { useState, useEffect, useCallback } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Grid,
  Chip,
  Alert,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ThemePalettePicker } from "../../components/shared/ThemePalettePicker";
import { BulkAddDialog } from "../items/BulkAddDialog";
import { useAppTheme } from "../../theme/themeConstants";
import { useAuth } from "../../auth/useAuth";
import { api } from "../../api/client";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export const SettingsPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { mode, setMode, preset, setPreset } = useAppTheme();
  const { pinSet, refreshAuth } = useAuth();

  // Settings State
  const [expiryDays, setExpiryDays] = useState(30);
  const [baseUrl, setBaseUrl] = useState("");
  const [labelPreset, setLabelPreset] = useState("medium");
  const [backupKeep, setBackupKeep] = useState(7);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiKeySource, setAiKeySource] = useState<"env" | "settings" | "none">("none");
  const [aiKeyHint, setAiKeyHint] = useState<string | null>(null);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
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
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  const loadSettingsAndStats = useCallback(async () => {
    try {
      const [s, stats, b] = await Promise.all([
        api.getSettings(),
        api.getStorage(),
        api.getBackups(),
      ]);
      setExpiryDays(s.expiry_warn_days || 30);
      setBaseUrl(s.base_url || "");
      setLabelPreset(s.label_preset || "medium");
      setBackupKeep(s.backup_keep || 7);
      setAiConfigured(Boolean(s.ai_configured));
      setAiKeySource(s.ai_key_source || "none");
      setAiKeyHint(s.gemini_api_key_hint || null);
      setStorageStats(stats);
      setBackups(b);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api.getSettings(), api.getStorage(), api.getBackups()])
      .then(([s, stats, b]) => {
        if (!active) return;
        setExpiryDays(s.expiry_warn_days || 30);
        setBaseUrl(s.base_url || "");
        setLabelPreset(s.label_preset || "medium");
        setBackupKeep(s.backup_keep || 7);
        setAiConfigured(Boolean(s.ai_configured));
        setAiKeySource(s.ai_key_source || "none");
        setAiKeyHint(s.gemini_api_key_hint || null);
        setStorageStats(stats);
        setBackups(b);
      })
      .catch((err) => {
        if (active) console.error(err);
      });
    return () => {
      active = false;
    };
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

  const handleSaveAiKey = async () => {
    const cleaned = geminiApiKeyInput.trim();
    if (!cleaned) return;
    setAiSaving(true);
    setAiError(null);
    try {
      const updated = await api.updateSettings({ gemini_api_key: cleaned });
      setAiConfigured(Boolean(updated.ai_configured));
      setAiKeySource(updated.ai_key_source || "none");
      setAiKeyHint(updated.gemini_api_key_hint || null);
      setGeminiApiKeyInput("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setAiError(err?.error?.message || "Failed to save Gemini API key");
    } finally {
      setAiSaving(false);
    }
  };

  const handleClearAiKey = async () => {
    setAiSaving(true);
    setAiError(null);
    try {
      const updated = await api.updateSettings({ clear_gemini_api_key: true });
      setAiConfigured(Boolean(updated.ai_configured));
      setAiKeySource(updated.ai_key_source || "none");
      setAiKeyHint(updated.gemini_api_key_hint || null);
      setGeminiApiKeyInput("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setAiError(err?.error?.message || "Failed to remove Gemini API key");
    } finally {
      setAiSaving(false);
    }
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

  const downloadFromEndpoint = async (
    url: string,
    fallbackName: string,
    method: "GET" | "POST" = "GET"
  ) => {
    try {
      const response = await fetch(url, { method, credentials: "same-origin" });
      if (!response.ok) {
        let msg = `Download failed (HTTP ${response.status})`;
        try {
          const data = await response.json();
          if (data?.error?.message) msg = data.error.message;
        } catch {
          // Non-JSON error body
        }
        setRestoreMessage(msg);
        return;
      }

      const disp = response.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || fallbackName;
      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objUrl);

      if (method === "POST") {
        await loadSettingsAndStats();
      }
    } catch {
      setRestoreMessage("Network error while downloading file.");
    }
  };

  const handleDownloadBackup = () => {
    void downloadFromEndpoint("/api/admin/backup", "wherezy_backup.zip", "POST");
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
    <Box sx={{ width: "100%" }}>
      <PageHeader
        title="Settings & Administration"
        subtitle="Security, backups, and data export"
        icon={<SettingsOutlinedIcon />}
      />

      <AlertDialog
        open={Boolean(saveSuccess)}
        onClose={() => setSaveSuccess(false)}
        title="Settings Saved"
        message={saveSuccess ? "Settings updated successfully!" : null}
        severity="success"
      />

      <AlertDialog
        open={Boolean(restoreMessage)}
        onClose={() => setRestoreMessage(null)}
        title="Backup / Restore"
        message={restoreMessage}
        severity="info"
      />

      {/* Security: Household PIN */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 1,
              mb: 1,
            }}
          >
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
              ? "A household PIN is currently active. Devices must enter this PIN to access Wherezy. Failed attempts are rate-limited to 5 per minute."
              : "No PIN is configured. Anyone on your local home Wi-Fi can view and edit items without logging in."}
          </Typography>
        </CardContent>
      </Card>

      {/* Network & QR Base URL */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
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

          <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 1, sm: 1.5 }, mb: 1 }}>
            <TextField
              label="Base URL"
              placeholder="e.g. http://192.168.1.100:8000"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              fullWidth
            />
            <Button
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              onClick={handleAutoDetectBaseUrl}
              sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Use Current Origin
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Preferences & Expiry */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
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
          <Button
            variant="contained"
            size={isMobile ? "small" : "medium"}
            onClick={handleSaveGeneral}
            sx={{ mt: { xs: 1.5, sm: 2 } }}
          >
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* AI Category Assistant */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 1,
              mb: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AutoAwesomeIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                AI Category Assistant (Gemini)
              </Typography>
            </Box>
            <Chip
              size="small"
              color={aiConfigured ? "success" : "default"}
              variant={aiConfigured ? "filled" : "outlined"}
              label={
                aiKeySource === "env"
                  ? "Active (Server Env)"
                  : aiKeySource === "settings"
                  ? `Configured (${aiKeyHint || "Saved"})`
                  : "Not Configured"
              }
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enable voice-, photo-, and prompt-driven AI tools across Categories, Items, Quick Capture Inbox, Bulk Extract, and Storage Locations using Gemini. Keys saved here are encrypted at rest on your server and never sent back to browsers.
          </Typography>

          {aiError && (
            <Alert severity="error" onClose={() => setAiError(null)} sx={{ mb: 2 }}>
              {aiError}
            </Alert>
          )}

          {aiKeySource === "env" && (
            <Alert severity="info" sx={{ mb: 2 }}>
              A <code>GEMINI_API_KEY</code> environment variable is active on the server and takes priority over saved settings.
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 1, sm: 1.5 } }}>
            <TextField
              type="password"
              label={aiKeySource === "settings" ? "Replace Gemini API Key" : "Gemini API Key"}
              placeholder="AIza..."
              value={geminiApiKeyInput}
              onChange={(e) => setGeminiApiKeyInput(e.target.value)}
              fullWidth
              disabled={aiSaving}
              autoComplete="off"
            />
            <Button
              variant="contained"
              size={isMobile ? "small" : "medium"}
              onClick={() => void handleSaveAiKey()}
              disabled={aiSaving || !geminiApiKeyInput.trim()}
              sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              Save Key
            </Button>
            {aiKeySource === "settings" && (
              <Button
                variant="outlined"
                color="error"
                size={isMobile ? "small" : "medium"}
                onClick={() => void handleClearAiKey()}
                disabled={aiSaving}
                sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Remove Key
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <PaletteOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Appearance & Theme
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Choose your preferred color palette and display mode.
          </Typography>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Color Palette
          </Typography>
          <Box sx={{ mb: 3 }}>
            <ThemePalettePicker variant="detailed" preset={preset} onSelect={setPreset} />
          </Box>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Display Mode
          </Typography>
          <FormControl size={isMobile ? "small" : "medium"} sx={{ minWidth: { xs: "100%", sm: 220 } }}>
            <InputLabel>Theme Mode</InputLabel>
            <Select
              value={mode}
              label="Theme Mode"
              onChange={(e) => setMode(e.target.value as any)}
            >
              <MenuItem value="dark">Dark Theme (Recommended)</MenuItem>
              <MenuItem value="light">Light Theme</MenuItem>
              <MenuItem value="system">Follow System</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Backup, Restore & Storage */}
      <Card sx={{ mb: { xs: 2, sm: 3 } }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <StorageOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Backups & Storage
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Wherezy stores your complete database and photo files locally in the <code>data/</code> folder.
          </Typography>

          {storageStats && (
            <Box
              sx={{
                display: "flex",
                gap: { xs: 2, sm: 3 },
                mb: { xs: 1.5, sm: 2.5 },
                flexWrap: "wrap",
                p: { xs: 1.25, sm: 1.5 },
                bgcolor: "action.hover",
                borderRadius: 2,
              }}
            >
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

          <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, flexWrap: "wrap", mb: 2 }}>
            <Button
              variant="contained"
              size={isMobile ? "small" : "medium"}
              startIcon={<CloudDownloadOutlinedIcon />}
              onClick={handleDownloadBackup}
            >
              Download Backup (.zip)
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
              size={isMobile ? "small" : "medium"}
              startIcon={<CloudUploadOutlinedIcon />}
              onClick={() => restoreInputRef.current?.click()}
            >
              Restore Backup (.zip)
            </Button>
          </Box>

          {backups.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Recent Backups on Disk ({backups.length})
              </Typography>
              <List disablePadding>
                {backups.slice(0, 5).map((b) => (
                  <ListItem key={b.file_name} divider sx={{ px: { xs: 0.5, sm: 1 }, py: 0.5 }}>
                    <ListItemText
                      sx={{ minWidth: 0 }}
                      primary={b.file_name}
                      secondary={`${new Date(b.created_at).toLocaleString()} • ${formatBytes(b.size_bytes)}`}
                      slotProps={{
                        primary: {
                          sx: {
                            fontFamily: "var(--font-mono)",
                            fontSize: { xs: "0.75rem", sm: "0.875rem" },
                            overflowWrap: "anywhere",
                          },
                        },
                        secondary: {
                          sx: {
                            fontSize: { xs: "0.7rem", sm: "0.8rem" },
                          },
                        },
                      }}
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
              Data Export & Import
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Export all items with custom fields into standard spreadsheet formats, or bulk import items from CSV.
          </Typography>
          <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              onClick={() => void downloadFromEndpoint("/api/admin/export?format=csv", "wherezy_export.csv")}
            >
              Export as CSV
            </Button>
            <Button
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              onClick={() => void downloadFromEndpoint("/api/admin/export?format=json", "wherezy_export.json")}
            >
              Export as JSON
            </Button>
            <Button
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              onClick={() => void downloadFromEndpoint("/api/admin/export/book.xlsx", "wherezy_book.xlsx")}
            >
              Export Excel (.xlsx)
            </Button>
            <Button
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => setCsvImportOpen(true)}
            >
              Import Items (CSV)
            </Button>
          </Box>
        </CardContent>
      </Card>

      <BulkAddDialog
        open={csvImportOpen}
        initialTab="csv"
        onClose={() => setCsvImportOpen(false)}
        onAdded={(_count, message) => {
          setImportMessage(message || "Items imported successfully");
        }}
      />

      <AlertDialog
        open={Boolean(importMessage)}
        onClose={() => setImportMessage(null)}
        title="Bulk Import Complete"
        message={importMessage}
        severity="success"
      />

      {/* PIN Dialog */}
      <Dialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{pinSet ? "Change or Remove PIN" : "Set Household PIN"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "20px !important" }}>
          <Typography variant="body2" color="text.secondary">
            {pinSet
              ? "To change your PIN, enter the current PIN and the new PIN. To remove the PIN completely, leave the new PIN blank."
              : "Enter a 4-8 digit numeric PIN. You can change or remove this at any time."}
          </Typography>

          <AlertDialog
            open={Boolean(pinError)}
            onClose={() => setPinError(null)}
            title="PIN Error"
            message={pinError}
            severity="error"
          />

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
