import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Avatar,
  Tooltip,
  Divider,
  Stack,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { api, ApiException, ProfileOut, ProfileRole } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { AccountIcon } from "../../components/shared/AccountIcon";
import { AccountIconPicker } from "../../components/shared/AccountIconPicker";
import { ColorSwatchPicker } from "../../components/shared/ColorSwatchPicker";

const CUSTOM_PERM_OPTIONS = [
  { key: "items:write", label: "Create & Edit Items", category: "Inventory" },
  { key: "items:delete", label: "Delete Items", category: "Inventory" },
  { key: "photos:write", label: "Upload Photos & Attachments", category: "Inventory" },
  { key: "tags:write", label: "Manage Tags", category: "Inventory" },
  { key: "bulk:write", label: "Bulk Operations", category: "Inventory" },
  { key: "categories:write", label: "Manage Categories & Fields", category: "Household" },
  { key: "locations:write", label: "Manage Storage Locations", category: "Household" },
  { key: "reminders:write", label: "Manage Expiry & Reminders", category: "Household" },
  { key: "moves:write", label: "Manage Moves & Boxes", category: "Household" },
  { key: "contacts:write", label: "Manage Contacts & Loans", category: "Household" },
  { key: "export:read", label: "Export Data & Book", category: "System" },
  { key: "audit:write", label: "Conduct Audits", category: "System" },
  { key: "trash:restore", label: "Restore from Trash", category: "System" },
];

/** Normalizes a name or input string into a valid lowercase login username. */
function sanitizeUsername(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export const UsersPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { currentProfile } = useAuth();
  const [profiles, setProfiles] = useState<ProfileOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dialog state: Add/Edit User
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileOut | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const [avatarEmoji, setAvatarEmoji] = useState("Person");
  const [color, setColor] = useState("#486B85");
  const [role, setRole] = useState<ProfileRole>("member");
  const [password, setPassword] = useState("");
  const [customPerms, setCustomPerms] = useState<string[]>([]);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog state: Reset Password
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTargetProfile, setResetTargetProfile] = useState<ProfileOut | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const data = await api.getProfiles(true);
      setProfiles(data);
    } catch (err: any) {
      setErrorMsg("Failed to load users list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleOpenAdd = () => {
    setEditingProfile(null);
    setName("");
    setUsername("");
    setUsernameManuallyEdited(false);
    setAvatarEmoji("Person");
    setColor("#486B85");
    setRole("member");
    setPassword("");
    setCustomPerms(["items:write", "photos:write", "tags:write"]);
    setDialogError(null);
    setUserDialogOpen(true);
  };

  const handleOpenEdit = (p: ProfileOut) => {
    setEditingProfile(p);
    setName(p.name);
    setUsername(p.username || "");
    // Keep existing users' saved login username untouched when editing display name.
    setUsernameManuallyEdited(Boolean(p.username));
    setAvatarEmoji(p.avatar_emoji || "Person");
    setColor(p.color || "#486B85");
    setRole(p.role);
    setPassword("");
    setCustomPerms(p.custom_permissions || []);
    setDialogError(null);
    setUserDialogOpen(true);
  };

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    if (!usernameManuallyEdited) {
      setUsername(sanitizeUsername(nextName));
    }
  };

  const handleUsernameChange = (nextValue: string) => {
    const sanitized = sanitizeUsername(nextValue);
    setUsername(sanitized);
    setUsernameManuallyEdited(sanitized.length > 0);
  };

  const handleOpenReset = (p: ProfileOut) => {
    setResetTargetProfile(p);
    setNewPassword("");
    setMustChangePassword(true);
    setResetError(null);
    setResetDialogOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setDialogError("Name is required");
      return;
    }

    setIsSubmitting(true);
    setDialogError(null);

    try {
      if (editingProfile) {
        // Update user
        await api.updateProfile(editingProfile.id, {
          name: name.trim(),
          username: username.trim().toLowerCase() || undefined,
          avatar_emoji: avatarEmoji,
          color,
          role,
          password: password.trim() ? password.trim() : undefined,
          custom_permissions: role === "custom" ? customPerms : undefined,
        });
        setSuccessMsg(`User '${name}' updated successfully.`);
      } else {
        // Create user
        await api.createProfile({
          name: name.trim(),
          username: username.trim().toLowerCase() || undefined,
          avatar_emoji: avatarEmoji,
          color,
          role,
          password: password.trim() ? password.trim() : undefined,
          custom_permissions: role === "custom" ? customPerms : undefined,
        });
        setSuccessMsg(`User '${name}' created successfully.`);
      }
      setUserDialogOpen(false);
      await loadProfiles();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setDialogError(err.error.message || "Failed to save user.");
      } else {
        setDialogError("Failed to save user.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetProfile) return;
    if (newPassword.trim().length < 3) {
      setResetError("Password must be at least 3 characters");
      return;
    }

    setIsSubmitting(true);
    setResetError(null);

    try {
      await api.updateProfile(resetTargetProfile.id, {
        password: newPassword.trim(),
        must_change_password: mustChangePassword,
      });
      setSuccessMsg(`Password for '${resetTargetProfile.name}' reset successfully.`);
      setResetDialogOpen(false);
      await loadProfiles();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setResetError(err.error.message || "Failed to reset password.");
      } else {
        setResetError("Failed to reset password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (p: ProfileOut) => {
    try {
      await api.updateProfile(p.id, { is_active: !p.is_active });
      setSuccessMsg(`User '${p.name}' ${p.is_active ? "deactivated" : "activated"}.`);
      await loadProfiles();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message || "Action failed.");
      } else {
        setErrorMsg("Failed to update status.");
      }
    }
  };

  const toggleCustomPerm = (permKey: string) => {
    setCustomPerms((prev) =>
      prev.includes(permKey) ? prev.filter((k) => k !== permKey) : [...prev, permKey]
    );
  };

  const getRoleChipColor = (r: ProfileRole) => {
    switch (r) {
      case "admin":
        return { bgcolor: "primary.main", color: "primary.contrastText" };
      case "co_admin":
        return { bgcolor: "#02435C", color: "#57B5C3" };
      case "member":
        return { bgcolor: "#1C252B", color: "#CAD2CB" };
      case "viewer":
        return { bgcolor: "action.selected", color: "text.secondary" };
      case "custom":
        return { bgcolor: "#9c27b0", color: "#ffffff" };
      default:
        return { bgcolor: "action.hover", color: "text.primary" };
    }
  };

  const isCurrentUserAdmin = currentProfile?.role === "admin";

  return (
    <Box>
      <PageHeader
        title="Users & Roles"
        subtitle="Manage household members, access control, and customizable permission roles"
        icon={<PeopleOutlinedIcon />}
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            sx={{ fontWeight: 600, textTransform: "none", borderRadius: 1 }}
          >
            Add User
          </Button>
        }
      />

      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="User Action Failed"
        message={errorMsg}
        severity="error"
      />

      <AlertDialog
        open={Boolean(successMsg)}
        onClose={() => setSuccessMsg(null)}
        title="Success"
        message={successMsg}
        severity="success"
      />

      {/* Grid of User Cards */}
      <Grid container spacing={2.5}>
        {profiles.map((p) => {
          const roleStyle = getRoleChipColor(p.role);
          const isSelf = p.id === currentProfile?.id;
          const isTargetAdmin = p.role === "admin";
          const canModify = isCurrentUserAdmin || (!isTargetAdmin && !isSelf);

          return (
            <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  opacity: p.is_active ? 1 : 0.65,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    boxShadow: 2,
                    borderColor: "primary.main",
                  },
                }}
              >
                <CardContent sx={{ p: 2.5, flex: 1, display: "flex", flexDirection: "column" }}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, mb: 2 }}>
                    <Avatar
                      sx={{
                        width: 52,
                        height: 52,
                        bgcolor: p.color || "primary.main",
                        boxShadow: 1,
                      }}
                    >
                      <AccountIcon icon={p.avatar_emoji} name={p.name} fontSize="medium" sx={{ color: "#ffffff" }} />
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem" }} noWrap>
                          {p.name}
                        </Typography>
                        {isSelf && (
                          <Chip
                            label="You"
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                        @{p.username || p.name.toLowerCase().replace(" ", "")}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.8, flexWrap: "wrap" }}>
                        <Chip
                          label={p.role.replace("_", " ")}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            textTransform: "capitalize",
                            ...roleStyle,
                          }}
                        />
                        <Chip
                          label={p.is_active ? "Active" : "Inactive"}
                          size="small"
                          color={p.is_active ? "success" : "default"}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                      </Box>
                    </Box>
                  </Box>

                  {/* Password & Security status */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      bgcolor: "action.hover",
                      p: 1.25,
                      borderRadius: 1,
                      mb: 2,
                    }}
                  >
                    {p.has_pin ? (
                      <LockOutlinedIcon sx={{ fontSize: 16, color: "success.main" }} />
                    ) : (
                      <LockOpenOutlinedIcon sx={{ fontSize: 16, color: "warning.main" }} />
                    )}
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {p.has_pin ? "Password protected" : "No password set"}
                    </Typography>
                    {p.must_change_password && (
                      <Chip
                        label="Change required"
                        size="small"
                        color="warning"
                        sx={{ height: 18, fontSize: "0.6rem", ml: "auto" }}
                      />
                    )}
                  </Box>

                  {/* Custom permissions chips if role == custom */}
                  {p.role === "custom" && p.custom_permissions && p.custom_permissions.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>
                        Permissions:
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {p.custom_permissions.map((perm) => (
                          <Chip
                            key={perm}
                            label={perm}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                  <Box sx={{ flex: 1 }} />

                  {/* Action buttons */}
                  <Divider sx={{ my: 1.5 }} />
                  <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                    <Tooltip title="Reset Password">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenReset(p)}
                        disabled={!canModify}
                      >
                        <LockResetOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Edit User">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenEdit(p)}
                        disabled={!canModify}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title={p.is_active ? "Deactivate User" : "Activate User"}>
                      <IconButton
                        size="small"
                        color={p.is_active ? "error" : "success"}
                        onClick={() => handleToggleActive(p)}
                        disabled={!canModify || (isTargetAdmin && profiles.filter((x) => x.role === "admin" && x.is_active).length <= 1)}
                      >
                        {p.is_active ? <BlockOutlinedIcon fontSize="small" /> : <CheckCircleOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Add / Edit User Dialog */}
      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <form onSubmit={handleSaveUser}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingProfile ? `Edit User: ${editingProfile.name}` : "Create New Household User"}
          </DialogTitle>
          <DialogContent dividers sx={{ pt: 2 }}>
            <AlertDialog
              open={Boolean(dialogError)}
              onClose={() => setDialogError(null)}
              title="Save User Error"
              message={dialogError}
              severity="error"
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Full Name"
                  placeholder="e.g. Alex Smith"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Username"
                  placeholder="e.g. alex"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  helperText="Unique lowercase login username"
                />
              </Grid>

              {/* Account Icon Selector */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <AccountIconPicker
                  value={avatarEmoji}
                  onChange={setAvatarEmoji}
                  label="Account Icon"
                />
              </Grid>

              {/* Accent Color Selector */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <ColorSwatchPicker
                  value={color}
                  onChange={setColor}
                  label="User Color"
                />
              </Grid>

              {/* Role Selection */}
              <Grid size={{ xs: 12 }}>
                <FormControl fullWidth>
                  <InputLabel id="role-select-label">Account Role</InputLabel>
                  <Select
                    labelId="role-select-label"
                    value={role}
                    label="Account Role"
                    onChange={(e) => setRole(e.target.value as ProfileRole)}
                  >
                    {isCurrentUserAdmin && <MenuItem value="admin">Admin (Full Control)</MenuItem>}
                    {isCurrentUserAdmin && <MenuItem value="co_admin">Co-Admin (Household Management)</MenuItem>}
                    <MenuItem value="member">Member (Inventory Operations)</MenuItem>
                    <MenuItem value="viewer">Viewer (Read-Only Access)</MenuItem>
                    <MenuItem value="custom">Custom Permissions...</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Granular Checkboxes if Role is Custom */}
              {role === "custom" && (
                <Grid size={{ xs: 12 }}>
                  <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <SecurityOutlinedIcon color="primary" fontSize="small" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Granular Permission Grants
                      </Typography>
                    </Box>
                    <Grid container spacing={1}>
                      {CUSTOM_PERM_OPTIONS.map((opt) => (
                        <Grid key={opt.key} size={{ xs: 12, sm: 6 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={customPerms.includes(opt.key)}
                                onChange={() => toggleCustomPerm(opt.key)}
                              />
                            }
                            label={
                              <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
                                {opt.label}
                              </Typography>
                            }
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </Grid>
              )}

              {/* Password field */}
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label={editingProfile ? "New Password (leave blank to keep current)" : "Initial Password"}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingProfile ? "••••••••" : "Leave blank if no password"}
                  helperText="Optional: If left blank, user can sign in without a password"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setUserDialogOpen(false)} color="inherit" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save User"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleResetPasswordSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            Reset Password: {resetTargetProfile?.name}
          </DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <AlertDialog
              open={Boolean(resetError)}
              onClose={() => setResetError(null)}
              title="Reset Password Error"
              message={resetError}
              severity="error"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Set a new password for account @{resetTargetProfile?.username || resetTargetProfile?.name}.
            </Typography>
            <TextField
              fullWidth
              autoFocus
              type="password"
              label="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={isSubmitting}
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={mustChangePassword}
                  onChange={(e) => setMustChangePassword(e.target.checked)}
                />
              }
              label="Require user to change password on next login"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setResetDialogOpen(false)} color="inherit" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!newPassword.trim() || isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};
