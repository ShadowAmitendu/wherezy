import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Alert,
  Box,
  InputAdornment,
  IconButton,
} from "@mui/material";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { api, ApiException } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

interface UpdatePasswordDialogProps {
  open: boolean;
  onClose?: () => void;
  requireOldPassword?: boolean;
}

export const UpdatePasswordDialog: React.FC<UpdatePasswordDialogProps> = ({
  open,
  onClose,
  requireOldPassword = false,
}) => {
  const { currentProfile, refreshAuth, setMustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 3) {
      setErrorMsg("New password must be at least 3 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("New password and confirm password do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.updatePassword({
        current_password: requireOldPassword ? currentPassword : (currentPassword || undefined),
        new_password: newPassword,
      });
      setSuccessMsg("Password updated successfully!");
      setMustChangePassword(false);
      await refreshAuth();
      setTimeout(() => {
        if (onClose) onClose();
      }, 900);
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message || "Failed to update password");
      } else {
        setErrorMsg("Failed to update password. Please check your inputs.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={requireOldPassword ? onClose : undefined}
      maxWidth="xs"
      fullWidth
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ textAlign: "center", pt: 3 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 1.5,
              boxShadow: 2,
            }}
          >
            <LockResetOutlinedIcon fontSize="large" />
          </Box>
          Update Your Password
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, textAlign: "center" }}>
            {currentProfile?.must_change_password
              ? "Welcome to HomeInventory! For account security, please set a new password before proceeding."
              : `Change the login password for account @${currentProfile?.username || currentProfile?.name}.`}
          </Typography>

          {errorMsg && (
            <Alert severity="error" variant="filled" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          {successMsg && (
            <Alert severity="success" variant="filled" sx={{ mb: 2 }}>
              {successMsg}
            </Alert>
          )}

          {requireOldPassword && (
            <TextField
              margin="dense"
              label="Current Password"
              type="password"
              fullWidth
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={isSubmitting}
              sx={{ mb: 1.5 }}
            />
          )}

          <TextField
            margin="dense"
            label="New Password"
            type={showNew ? "text" : "password"}
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoFocus
            disabled={isSubmitting}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowNew(!showNew)}
                      edge="end"
                    >
                      {showNew ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 1.5 }}
          />

          <TextField
            margin="dense"
            label="Confirm New Password"
            type="password"
            fullWidth
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </DialogContent>
        <DialogActions sx={{ pb: 3, px: 3, gap: 1 }}>
          {requireOldPassword && onClose && (
            <Button onClick={onClose} disabled={isSubmitting} color="inherit">
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            fullWidth={!requireOldPassword}
            size="large"
            disabled={!newPassword || !confirmPassword || isSubmitting}
          >
            {isSubmitting ? "Updating..." : "Update Password"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
