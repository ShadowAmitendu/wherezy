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
  Menu,
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
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
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
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { PageHeader } from "../../components/shared/PageHeader";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ThemePalettePicker } from "../../components/shared/ThemePalettePicker";
import { notifyDataChanged, useUndo } from "../../components/shared/UndoContext";
import { BulkAddDialog } from "../items/BulkAddDialog";
import { useAppTheme } from "../../theme/themeConstants";
import { useAuth } from "../../auth/useAuth";
import { AuthGuard } from "../../auth/AuthGuard";
import { hasPermission } from "../../auth/permissions";
import {
  api,
  handleHttpUnauthorized,
  type AiProviderType,
  type ImportFormat,
  type SettingsResponse,
} from "../../api/client";
import { DATA_FORMAT_OPTIONS } from "../../utils/exportImportFormats";

const LOCAL_LLM_PRESETS: Array<{ label: string; baseUrl: string; modelHint: string }> = [
  { label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", modelHint: "qwen2.5:7b" },
  { label: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", modelHint: "qwen2.5-7b-instruct" },
  { label: "llama.cpp", baseUrl: "http://127.0.0.1:8080/v1", modelHint: "local-model" },
  { label: "OpenAI-Compatible", baseUrl: "https://api.openai.com/v1", modelHint: "gpt-4o-mini" },
];

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
  const { pinSet, currentProfile, refreshAuth } = useAuth();
  const canManageSettings = hasPermission(currentProfile, "admin:settings");
  const canManageBackups = hasPermission(currentProfile, "admin:backup");
  const exportOptions = DATA_FORMAT_OPTIONS.filter((opt) =>
    hasPermission(currentProfile, opt.format === "xlsx" ? "admin:book" : "admin:export")
  );
  const { showUndo } = useUndo();

  // Settings State
  const [expiryDays, setExpiryDays] = useState(30);
  const [baseUrl, setBaseUrl] = useState("");
  const [labelPreset, setLabelPreset] = useState("medium");
  const [backupKeep, setBackupKeep] = useState(7);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProviderType>("gemini");
  const [aiStatusLabel, setAiStatusLabel] = useState<string | null>(null);
  const [aiKeySource, setAiKeySource] = useState<"env" | "settings" | "none">("none");
  const [aiKeyHint, setAiKeyHint] = useState<string | null>(null);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [geminiModelInput, setGeminiModelInput] = useState("gemini-3.8-flash");
  const [localBaseUrlInput, setLocalBaseUrlInput] = useState("http://127.0.0.1:11434/v1");
  const [localModelInput, setLocalModelInput] = useState("");
  const [localSttModelInput, setLocalSttModelInput] = useState("");
  const [localApiKeyInput, setLocalApiKeyInput] = useState("");
  const [localHasApiKey, setLocalHasApiKey] = useState(false);
  const [localApiKeyHint, setLocalApiKeyHint] = useState<string | null>(null);
  const [localModelsList, setLocalModelsList] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const applyAiSettingsState = useCallback((s: SettingsResponse) => {
    setAiConfigured(Boolean(s.ai_configured));
    setAiProvider(s.ai_provider || "gemini");
    setAiStatusLabel(s.ai_status_label || null);
    setAiKeySource(s.ai_key_source || "none");
    setAiKeyHint(s.gemini_api_key_hint || null);
    setGeminiModelInput(s.gemini_model || "gemini-3.8-flash");
    setLocalBaseUrlInput(s.local_llm_base_url || "http://127.0.0.1:11434/v1");
    setLocalModelInput(s.local_llm_model || "");
    setLocalSttModelInput(s.local_llm_stt_model || "");
    setLocalHasApiKey(Boolean(s.local_llm_has_api_key));
    setLocalApiKeyHint(s.local_llm_api_key_hint || null);
  }, []);
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
  const [importFormat, setImportFormat] = useState<ImportFormat>("csv");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);
  const [importMenuAnchor, setImportMenuAnchor] = useState<HTMLElement | null>(null);

  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  const fetchSettingsData = useCallback(async () => {
    const [s, stats, b] = await Promise.all([
      api.getSettings(),
      canManageSettings ? api.getStorage() : Promise.resolve(null),
      canManageBackups ? api.getBackups() : Promise.resolve([]),
    ]);
    return { s, stats, b };
  }, [canManageBackups, canManageSettings]);

  const applySettingsData = useCallback(
    ({ s, stats, b }: { s: SettingsResponse; stats: any | null; b: any[] }) => {
      setExpiryDays(s.expiry_warn_days || 30);
      setBaseUrl(s.base_url || "");
      setLabelPreset(s.label_preset || "medium");
      setBackupKeep(s.backup_keep || 7);
      applyAiSettingsState(s);
      setStorageStats(stats);
      setBackups(b);
    },
    [applyAiSettingsState]
  );

  const loadSettingsAndStats = useCallback(async () => {
    try {
      const data = await fetchSettingsData();
      applySettingsData(data);
    } catch (err) {
      console.error(err);
    }
  }, [applySettingsData, fetchSettingsData]);

  useEffect(() => {
    let active = true;
    fetchSettingsData()
      .then((data) => {
        if (active) applySettingsData(data);
      })
      .catch((err) => {
        if (active) console.error(err);
      });
    return () => {
      active = false;
    };
  }, [applySettingsData, fetchSettingsData]);

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

  const handleSaveAiSettings = async () => {
    setAiSaving(true);
    setAiError(null);
    setAiTestResult(null);
    try {
      const payload: Parameters<typeof api.updateSettings>[0] = {
        ai_provider: aiProvider,
      };
      if (aiProvider === "local") {
        payload.local_llm_base_url = localBaseUrlInput.trim() || null;
        payload.local_llm_model = localModelInput.trim() || null;
        payload.local_llm_stt_model = localSttModelInput.trim() || null;
        if (localApiKeyInput.trim()) {
          payload.local_llm_api_key = localApiKeyInput.trim();
        }
      } else {
        payload.gemini_model = geminiModelInput.trim() || "gemini-3.8-flash";
        if (geminiApiKeyInput.trim()) {
          payload.gemini_api_key = geminiApiKeyInput.trim();
        }
      }
      const updated = await api.updateSettings(payload);
      applyAiSettingsState(updated);
      setGeminiApiKeyInput("");
      setLocalApiKeyInput("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setAiError(err?.error?.message || "Failed to save AI settings");
    } finally {
      setAiSaving(false);
    }
  };

  const handleClearAiKey = async (target: "gemini" | "local") => {
    setAiSaving(true);
    setAiError(null);
    setAiTestResult(null);
    try {
      const updated = await api.updateSettings(
        target === "local" ? { clear_local_llm_api_key: true } : { clear_gemini_api_key: true }
      );
      applyAiSettingsState(updated);
      if (target === "local") {
        setLocalApiKeyInput("");
      } else {
        setGeminiApiKeyInput("");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setAiError(err?.error?.message || "Failed to remove API key");
    } finally {
      setAiSaving(false);
    }
  };

  const handleFetchLocalModels = async () => {
    const trimmedUrl = localBaseUrlInput.trim();
    if (!trimmedUrl) {
      setAiError("Enter a Local LLM Server Base URL before fetching models.");
      return;
    }
    setFetchingModels(true);
    setAiError(null);
    try {
      const res = await api.fetchLocalAiModels({
        base_url: trimmedUrl,
        api_key: localApiKeyInput.trim() || undefined,
      });
      setLocalModelsList(res.models);
      if (res.models.length === 0) {
        setAiError(`Connected to ${res.base_url}, but no models were listed. Pull or load a model on the server first.`);
      } else if (!localModelInput.trim()) {
        setLocalModelInput(res.models[0]);
      }
    } catch (err: any) {
      setLocalModelsList([]);
      setAiError(err?.error?.message || "Could not fetch models from the local server.");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestAiConnection = async () => {
    setTestingAi(true);
    setAiError(null);
    setAiTestResult(null);
    try {
      const res = await api.testAiConnection(
        aiProvider === "local"
          ? {
              provider: "local",
              local_llm_base_url: localBaseUrlInput.trim() || undefined,
              local_llm_model: localModelInput.trim() || undefined,
              local_llm_api_key: localApiKeyInput.trim() || undefined,
            }
          : {
              provider: "gemini",
              gemini_api_key: geminiApiKeyInput.trim() || undefined,
              gemini_model: geminiModelInput.trim() || undefined,
            }
      );
      setAiTestResult({ ok: res.ok, message: res.message });
    } catch (err: any) {
      setAiTestResult({
        ok: false,
        message: err?.error?.message || "AI connection test failed.",
      });
    } finally {
      setTestingAi(false);
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
        handleHttpUnauthorized(url, response.status);
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

      {/* Network & QR Base URL, Preferences, and AI Provider */}
      <AuthGuard permission="admin:settings">
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

      {/* AI Assistant Provider (Local LLM or Cloud API Key) */}
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
                AI Assistant Provider
              </Typography>
            </Box>
            <Chip
              size="small"
              color={aiConfigured ? "success" : "default"}
              variant={aiConfigured ? "filled" : "outlined"}
              label={
                aiStatusLabel ||
                (aiKeySource === "env"
                  ? "Active (Server Env)"
                  : aiConfigured
                  ? `Configured (${aiKeyHint || "Saved"})`
                  : "Not Configured")
              }
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose between a private Local LLM (Ollama, LM Studio, llama.cpp, vLLM, or any OpenAI-compatible server) or a Google Gemini API key to power AI features across Categories, Items, Quick Capture Inbox, Bulk Extract, and Locations. Saved API keys are encrypted at rest on your server.
          </Typography>

          <ToggleButtonGroup
            value={aiProvider}
            exclusive
            size={isMobile ? "small" : "medium"}
            onChange={(_e, next) => {
              if (!next) return;
              setAiProvider(next as AiProviderType);
              setAiError(null);
              setAiTestResult(null);
            }}
            sx={{ mb: 2, display: "flex", flexWrap: "wrap" }}
          >
            <ToggleButton value="local" sx={{ flex: { xs: "1 1 auto", sm: "0 1 auto" }, px: 2 }}>
              <ComputerOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} />
              Local LLM (Ollama / LM Studio / Custom)
            </ToggleButton>
            <ToggleButton value="gemini" sx={{ flex: { xs: "1 1 auto", sm: "0 1 auto" }, px: 2 }}>
              <CloudOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} />
              Cloud API Key (Gemini)
            </ToggleButton>
          </ToggleButtonGroup>

          {aiError && (
            <Alert severity="error" onClose={() => setAiError(null)} sx={{ mb: 2 }}>
              {aiError}
            </Alert>
          )}

          {aiTestResult && (
            <Alert
              severity={aiTestResult.ok ? "success" : "error"}
              onClose={() => setAiTestResult(null)}
              sx={{ mb: 2 }}
            >
              {aiTestResult.message}
            </Alert>
          )}

          {aiProvider === "local" ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75, fontWeight: 600 }}>
                  Quick Presets
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {LOCAL_LLM_PRESETS.map((preset) => (
                    <Chip
                      key={preset.label}
                      label={preset.label}
                      size="small"
                      clickable
                      variant={localBaseUrlInput.trim() === preset.baseUrl ? "filled" : "outlined"}
                      color={localBaseUrlInput.trim() === preset.baseUrl ? "primary" : "default"}
                      onClick={() => {
                        setLocalBaseUrlInput(preset.baseUrl);
                        if (!localModelInput.trim()) {
                          setLocalModelInput(preset.modelHint);
                        }
                        setLocalModelsList([]);
                        setAiError(null);
                        setAiTestResult(null);
                      }}
                    />
                  ))}
                </Box>
              </Box>

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 1, sm: 1.5 }, alignItems: { sm: "flex-start" } }}>
                <TextField
                  label="Server Base URL"
                  placeholder="http://127.0.0.1:11434/v1"
                  value={localBaseUrlInput}
                  onChange={(e) => setLocalBaseUrlInput(e.target.value)}
                  fullWidth
                  disabled={aiSaving || testingAi}
                  helperText="OpenAI-compatible endpoint (e.g. Ollama /v1, LM Studio /v1, or cloud compatible API)."
                />
                <Button
                  variant="outlined"
                  size={isMobile ? "small" : "medium"}
                  onClick={() => void handleFetchLocalModels()}
                  disabled={fetchingModels || aiSaving || !localBaseUrlInput.trim()}
                  startIcon={fetchingModels ? <CircularProgress size={16} /> : <RefreshIcon />}
                  sx={{ whiteSpace: "nowrap", flexShrink: 0, height: { sm: 56 } }}
                >
                  {fetchingModels ? "Fetching..." : "Fetch Models"}
                </Button>
              </Box>

              {localModelsList.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75, fontWeight: 600 }}>
                    Available Models ({localModelsList.length}) — click to select
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    {localModelsList.map((m) => (
                      <Chip
                        key={m}
                        label={m}
                        size="small"
                        clickable
                        variant={localModelInput.trim() === m ? "filled" : "outlined"}
                        color={localModelInput.trim() === m ? "primary" : "default"}
                        onClick={() => setLocalModelInput(m)}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Model Name"
                    placeholder="e.g. qwen2.5:7b, llama3.2, gpt-4o-mini"
                    value={localModelInput}
                    onChange={(e) => setLocalModelInput(e.target.value)}
                    fullWidth
                    disabled={aiSaving || testingAi}
                    helperText="Vision-capable models (e.g. qwen2.5-vl, llama3.2-vision, llava) enable photo scan."
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Voice Transcription Model (Optional STT)"
                    placeholder="e.g. whisper-1"
                    value={localSttModelInput}
                    onChange={(e) => setLocalSttModelInput(e.target.value)}
                    fullWidth
                    disabled={aiSaving || testingAi}
                    helperText="Optional /audio/transcriptions Whisper model when the main model has no audio input."
                  />
                </Grid>
              </Grid>

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 1, sm: 1.5 }, alignItems: { sm: "flex-start" } }}>
                <TextField
                  type="password"
                  label={
                    localHasApiKey
                      ? `Replace Optional API Key (${localApiKeyHint || "Saved"})`
                      : "Optional API Key / Bearer Token"
                  }
                  placeholder="Leave blank for keyless Ollama / LM Studio"
                  value={localApiKeyInput}
                  onChange={(e) => setLocalApiKeyInput(e.target.value)}
                  fullWidth
                  disabled={aiSaving || testingAi}
                  autoComplete="off"
                />
                {localHasApiKey && (
                  <Button
                    variant="outlined"
                    color="error"
                    size={isMobile ? "small" : "medium"}
                    onClick={() => void handleClearAiKey("local")}
                    disabled={aiSaving || testingAi}
                    sx={{ whiteSpace: "nowrap", flexShrink: 0, height: { sm: 56 } }}
                  >
                    Remove Key
                  </Button>
                )}
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {aiKeySource === "env" && (
                <Alert severity="info">
                  A <code>GEMINI_API_KEY</code> environment variable is active on the server and takes priority over saved settings.
                </Alert>
              )}

              <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: { xs: 1, sm: 1.5 }, alignItems: { sm: "flex-start" } }}>
                <TextField
                  type="password"
                  label={
                    aiKeySource === "settings"
                      ? `Replace Gemini API Key (${aiKeyHint || "Saved"})`
                      : "Gemini API Key"
                  }
                  placeholder="AIza..."
                  value={geminiApiKeyInput}
                  onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                  fullWidth
                  disabled={aiSaving || testingAi}
                  autoComplete="off"
                />
                {aiKeySource === "settings" && (
                  <Button
                    variant="outlined"
                    color="error"
                    size={isMobile ? "small" : "medium"}
                    onClick={() => void handleClearAiKey("gemini")}
                    disabled={aiSaving || testingAi}
                    sx={{ whiteSpace: "nowrap", flexShrink: 0, height: { sm: 56 } }}
                  >
                    Remove Key
                  </Button>
                )}
              </Box>

              <TextField
                label="Gemini Model"
                placeholder="gemini-3.8-flash"
                value={geminiModelInput}
                onChange={(e) => setGeminiModelInput(e.target.value)}
                fullWidth
                disabled={aiSaving || testingAi}
                helperText="Default: gemini-3.8-flash"
              />
            </Stack>
          )}

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 2.5 }}>
            <Button
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              onClick={() => void handleTestAiConnection()}
              disabled={testingAi || aiSaving}
              startIcon={testingAi ? <CircularProgress size={16} /> : <BoltOutlinedIcon />}
            >
              {testingAi ? "Testing..." : "Test Connection"}
            </Button>
            <Button
              variant="contained"
              size={isMobile ? "small" : "medium"}
              onClick={() => void handleSaveAiSettings()}
              disabled={aiSaving || testingAi}
            >
              {aiSaving ? "Saving..." : "Save AI Settings"}
            </Button>
          </Box>
        </CardContent>
      </Card>
      </AuthGuard>

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
      <AuthGuard anyPermissions={["admin:settings", "admin:backup"]}>
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

          <AuthGuard permission="admin:backup">
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
          </AuthGuard>
        </CardContent>
      </Card>
      </AuthGuard>

      {/* Export & Reports */}
      <AuthGuard anyPermissions={["admin:export", "admin:book", "admin:import"]}>
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <FileDownloadOutlinedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Data Export & Import
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Export your inventory in CSV, JSON, or Excel (.xlsx), or bulk import items using the same formats.
          </Typography>
          <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, flexWrap: "wrap" }}>
            <AuthGuard anyPermissions={["admin:export", "admin:book"]}>
              <Button
                variant="outlined"
                size={isMobile ? "small" : "medium"}
                startIcon={<FileDownloadOutlinedIcon />}
                endIcon={<KeyboardArrowDownIcon />}
                aria-haspopup="menu"
                aria-expanded={Boolean(exportMenuAnchor)}
                onClick={(e) => setExportMenuAnchor(e.currentTarget)}
              >
                Export
              </Button>
              <Menu
                anchorEl={exportMenuAnchor}
                open={Boolean(exportMenuAnchor)}
                onClose={() => setExportMenuAnchor(null)}
              >
                {exportOptions.map((opt) => (
                  <MenuItem
                    key={`export-${opt.format}`}
                    onClick={() => {
                      setExportMenuAnchor(null);
                      void downloadFromEndpoint(opt.exportEndpoint, opt.exportFilename);
                    }}
                  >
                    <ListItemText primary={opt.label} secondary={opt.exportDescription} />
                  </MenuItem>
                ))}
              </Menu>
            </AuthGuard>

            <AuthGuard permission="admin:import">
              <Button
                variant="outlined"
                size={isMobile ? "small" : "medium"}
                startIcon={<UploadFileOutlinedIcon />}
                endIcon={<KeyboardArrowDownIcon />}
                aria-haspopup="menu"
                aria-expanded={Boolean(importMenuAnchor)}
                onClick={(e) => setImportMenuAnchor(e.currentTarget)}
              >
                Import
              </Button>
              <Menu
                anchorEl={importMenuAnchor}
                open={Boolean(importMenuAnchor)}
                onClose={() => setImportMenuAnchor(null)}
              >
                {DATA_FORMAT_OPTIONS.map((opt) => (
                  <MenuItem
                    key={`import-${opt.format}`}
                    onClick={() => {
                      setImportMenuAnchor(null);
                      setImportFormat(opt.format);
                      setCsvImportOpen(true);
                    }}
                  >
                    <ListItemText primary={opt.label} secondary={opt.importDescription} />
                  </MenuItem>
                ))}
              </Menu>
            </AuthGuard>
          </Box>
        </CardContent>
      </Card>
      </AuthGuard>

      <AuthGuard permission="admin:import">
        <BulkAddDialog
          open={csvImportOpen}
          initialTab="csv"
          initialImportFormat={importFormat}
          onClose={() => setCsvImportOpen(false)}
          onAdded={(_count, message, batchId) => {
            notifyDataChanged("items");
            const summary = message || "Items imported successfully";
            if (batchId) {
              showUndo({
                message: summary,
                onUndo: async () => {
                  await api.undoBatch(batchId);
                  notifyDataChanged("items");
                },
              });
            } else {
              setImportMessage(summary);
            }
          }}
        />
      </AuthGuard>

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
