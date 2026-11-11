import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Avatar,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
} from "@mui/material";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { useAuth } from "../../auth/AuthContext";
import { useAppTheme } from "../../theme";
import { api, ApiException } from "../../api/client";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { AccountIcon } from "../../components/shared/AccountIcon";
import { AccountIconPicker } from "../../components/shared/AccountIconPicker";
import { ColorSwatchPicker } from "../../components/shared/ColorSwatchPicker";
import { ThemePalettePicker } from "../../components/shared/ThemePalettePicker";

export const AccountProfilePage: React.FC = () => {
  const { currentProfile, refreshAuth } = useAuth();
  const { mode, setMode, preset, setPreset } = useAppTheme();

  // Profile details state
  const [displayName, setDisplayName] = useState(currentProfile?.name || "");
  const [avatarEmoji, setAvatarEmoji] = useState(currentProfile?.avatar_emoji || "Person");
  const [userColor, setUserColor] = useState(currentProfile?.color || "#486B85");
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Preference state
  const [highContrast, setHighContrast] = useState(Boolean(currentProfile?.high_contrast));
  const [textScale, setTextScale] = useState<number>(currentProfile?.text_scale || 100);

  useEffect(() => {
    if (currentProfile) {
      setDisplayName(currentProfile.name);
      setAvatarEmoji(currentProfile.avatar_emoji || "Person");
      setUserColor(currentProfile.color || "#486B85");
      setHighContrast(Boolean(currentProfile.high_contrast));
      setTextScale(currentProfile.text_scale || 100);
    }
  }, [currentProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setProfileMsg({ type: "error", text: "Display name cannot be empty." });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      await api.updateMyPrefs({
        name: displayName.trim(),
        avatar_emoji: avatarEmoji,
        color: userColor,
        high_contrast: highContrast,
        text_scale: textScale,
      });
      await refreshAuth();
      setProfileMsg({ type: "success", text: "Profile details updated successfully!" });
    } catch (err: any) {
      if (err instanceof ApiException) {
        setProfileMsg({ type: "error", text: err.error.message || "Failed to update profile." });
      } else {
        setProfileMsg({ type: "error", text: "Failed to update profile." });
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 3) {
      setPasswordMsg({ type: "error", text: "New password must be at least 3 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    setSavingPassword(true);
    try {
      await api.updatePassword({
        current_password: currentPassword || undefined,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ type: "success", text: "Password changed successfully!" });
      await refreshAuth();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setPasswordMsg({ type: "error", text: err.error.message || "Failed to change password." });
      } else {
        setPasswordMsg({ type: "error", text: "Failed to change password." });
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      <PageHeader
        title="Account & Profile"
        subtitle="Manage your personal credentials, appearance, and household preferences"
        icon={<AccountCircleOutlinedIcon />}
      />

      {/* Profile Overview Card */}
      <Card variant="outlined" sx={{ borderRadius: 2, mb: 3, p: 1 }}>
        <CardContent sx={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
          <Avatar
            sx={{
              width: 76,
              height: 76,
              bgcolor: userColor,
              boxShadow: 2,
            }}
          >
            <AccountIcon icon={avatarEmoji} name={displayName} sx={{ fontSize: 44, color: "#ffffff" }} />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {displayName || currentProfile?.name}
              </Typography>
              <Chip
                label={currentProfile?.role?.replace("_", " ")}
                size="small"
                color="primary"
                sx={{ fontWeight: 700, textTransform: "capitalize" }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", mt: 0.5 }}>
              @{currentProfile?.username || currentProfile?.name?.toLowerCase().replace(" ", "")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Household Member since {currentProfile?.created_at ? new Date(currentProfile.created_at).toLocaleDateString() : "—"}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Section 1: Profile Details */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                <PersonOutlinedIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Profile Information
                </Typography>
              </Box>

              <AlertDialog
                open={Boolean(profileMsg)}
                onClose={() => setProfileMsg(null)}
                title={profileMsg?.type === "success" ? "Profile Updated" : "Profile Error"}
                message={profileMsg?.text || null}
                severity={profileMsg?.type || "error"}
              />

              <form onSubmit={handleSaveProfile}>
                <TextField
                  fullWidth
                  label="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  margin="normal"
                  required
                />

                <Box sx={{ mt: 2, mb: 2 }}>
                  <AccountIconPicker
                    value={avatarEmoji}
                    onChange={setAvatarEmoji}
                    label="Account Icon"
                  />
                </Box>

                <Box sx={{ mb: 3 }}>
                  <ColorSwatchPicker
                    value={userColor}
                    onChange={setUserColor}
                    label="Accent Color"
                  />
                </Box>

                <Button
                  type="submit"
                  variant="contained"
                  disabled={savingProfile}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  {savingProfile ? "Saving..." : "Save Profile Details"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* Section 2: Change Password */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                <LockOutlinedIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Security & Password
                </Typography>
              </Box>

              <AlertDialog
                open={Boolean(passwordMsg)}
                onClose={() => setPasswordMsg(null)}
                title={passwordMsg?.type === "success" ? "Password Updated" : "Password Error"}
                message={passwordMsg?.text || null}
                severity={passwordMsg?.type || "error"}
              />

              <form onSubmit={handleSavePassword}>
                <TextField
                  fullWidth
                  type="password"
                  label="Current Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  margin="normal"
                  placeholder="Leave blank if not set"
                />

                <TextField
                  fullWidth
                  type="password"
                  label="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  margin="normal"
                  required
                />

                <TextField
                  fullWidth
                  type="password"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  margin="normal"
                  required
                  sx={{ mb: 3 }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  disabled={savingPassword || !newPassword || !confirmPassword}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  {savingPassword ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Grid>

        {/* Section 3: Theme & Visual Appearance */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5 }}>
                <PaletteOutlinedIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Theme & Visual Customization
                </Typography>
              </Box>

              <Grid container spacing={3}>
                {/* Display Mode & Contrast */}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Display Mode
                  </Typography>
                  <FormControl fullWidth>
                    <InputLabel id="mode-select-label">Mode</InputLabel>
                    <Select
                      labelId="mode-select-label"
                      value={mode}
                      label="Mode"
                      onChange={(e) => setMode(e.target.value as any)}
                    >
                      <MenuItem value="dark">Dark Theme</MenuItem>
                      <MenuItem value="light">Light Theme</MenuItem>
                      <MenuItem value="system">Follow System Default</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Accessibility Options
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={highContrast}
                        onChange={(e) => setHighContrast(e.target.checked)}
                      />
                    }
                    label="High Contrast Mode"
                  />
                </Grid>

                {/* Theme Palette Selection */}
                <Grid size={{ xs: 12 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>
                    Color Palette
                  </Typography>
                  <ThemePalettePicker variant="compact" preset={preset} onSelect={setPreset} />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
