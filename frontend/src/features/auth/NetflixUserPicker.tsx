import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Avatar,
  IconButton,
  InputAdornment,
  Fade,
} from "@mui/material";
import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, ApiException, ProfileOut } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { NetflixProfileCard } from "./NetflixProfileCard";
import { AccountIcon } from "../../components/shared/AccountIcon";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

interface NetflixUserPickerProps {
  onSelectSuccess?: (profile: ProfileOut) => void;
  showBackToLogin?: boolean;
}

export const NetflixUserPicker: React.FC<NetflixUserPickerProps> = ({
  onSelectSuccess,
  showBackToLogin = true,
}) => {
  useDocumentTitle("Select Profile");
  const navigate = useNavigate();
  const { selectProfile, refreshAuth } = useAuth();
  const [profiles, setProfiles] = useState<ProfileOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ProfileOut | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const list = await api.getProfiles();
        setProfiles(list);
      } catch (err) {
        console.error("Failed to load profiles:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  const handleCardClick = async (profile: ProfileOut) => {
    if (profile.has_pin) {
      setSelectedProfile(profile);
      setPassword("");
      setErrorMsg(null);
    } else {
      // Profile without password
      setSubmitting(true);
      try {
        const p = await selectProfile(profile.id);
        if (onSelectSuccess) {
          onSelectSuccess(p);
        } else {
          navigate("/");
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const p = await selectProfile(selectedProfile.id, password);
      setSelectedProfile(null);
      await refreshAuth();
      if (onSelectSuccess) {
        onSelectSuccess(p);
      } else {
        navigate("/");
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message || "Incorrect password");
      } else {
        setErrorMsg("Failed to sign in");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 4 },
        bgcolor: "#020608",
        backgroundImage: `radial-gradient(ellipse at 50% 25%, #1C252B 0%, #020608 100%)`,
        color: "#ffffff",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Top Left Back Button (if opened from login) */}
      {showBackToLogin && (
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/login")}
          sx={{
            position: "absolute",
            top: { xs: 16, sm: 24 },
            left: { xs: 16, sm: 24 },
            color: "rgba(255,255,255,0.7)",
            "&:hover": { color: "#ffffff", bgcolor: "rgba(255,255,255,0.08)" },
            textTransform: "none",
          }}
        >
          Username Login
        </Button>
      )}

      {/* Main Netflix-style header */}
      <Fade in={!loading} timeout={400}>
        <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              letterSpacing: "-0.02em",
              fontSize: { xs: "2rem", sm: "3.2rem" },
              mb: 1,
              color: "#ffffff",
              textShadow: "0 2px 16px rgba(0,0,0,0.6)",
            }}
          >
            Who is using?
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: "rgba(255,255,255,0.65)",
              fontSize: { xs: "0.95rem", sm: "1.15rem" },
            }}
          >
            Select your household profile to enter Wherezy
          </Typography>
        </Box>
      </Fade>

      {/* User Profiles Grid */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: { xs: 3, sm: 5 },
          maxWidth: 960,
          mb: 6,
        }}
      >
        {profiles.map((p, index) => (
          <NetflixProfileCard
            key={p.id}
            profile={p}
            index={index}
            loading={loading}
            onClick={handleCardClick}
          />
        ))}
      </Box>

      {/* Bottom Switch to Normal Login */}
      {showBackToLogin && (
        <Fade in={!loading} timeout={500}>
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate("/login")}
              sx={{
                borderColor: "rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.8)",
                px: 3,
                py: 1,
                textTransform: "none",
                fontSize: "0.95rem",
                borderRadius: 1,
                transition: (theme) =>
                  theme.transitions.create(["border-color", "color", "background-color"], {
                    duration: theme.transitions.duration.shorter,
                    easing: theme.transitions.easing.easeInOut,
                  }),
                "&:hover": {
                  borderColor: "#ffffff",
                  color: "#ffffff",
                  bgcolor: "rgba(255,255,255,0.06)",
                },
              }}
            >
              Sign in with Username & Password
            </Button>
          </Box>
        </Fade>
      )}

      {/* Password Prompt Modal for Protected Users */}
      <Dialog
        open={Boolean(selectedProfile)}
        onClose={() => setSelectedProfile(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#1C252B",
              color: "#ffffff",
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.1)",
            },
          },
        }}
      >
        <form onSubmit={handlePasswordSubmit}>
          <DialogTitle sx={{ textAlign: "center", pt: 3.5, pb: 1 }}>
            <Avatar
              sx={{
                width: 68,
                height: 68,
                bgcolor: selectedProfile?.color || "primary.main",
                mx: "auto",
                mb: 1.5,
                boxShadow: 3,
              }}
            >
              <AccountIcon
                icon={selectedProfile?.avatar_emoji}
                name={selectedProfile?.name}
                sx={{ fontSize: 36, color: "#ffffff" }}
              />
            </Avatar>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "#ffffff" }}>
              {selectedProfile?.name}
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)", mt: 0.5 }}>
              Enter password to unlock this profile
            </Typography>
          </DialogTitle>

          <DialogContent sx={{ px: 3, pt: 1 }}>
            <AlertDialog
              open={Boolean(errorMsg)}
              onClose={() => setErrorMsg(null)}
              title="Unlock Failed"
              message={errorMsg}
              severity="error"
            />

            <TextField
              autoFocus
              fullWidth
              margin="dense"
              type={showPassword ? "text" : "password"}
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              slotProps={{
                inputLabel: { sx: { color: "rgba(255,255,255,0.7)" } },
                input: {
                  sx: { color: "#ffffff", bgcolor: "rgba(255,255,255,0.05)" },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{ color: "rgba(255,255,255,0.6)" }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </DialogContent>

          <DialogActions sx={{ pb: 3, px: 3, gap: 1 }}>
            <Button
              onClick={() => setSelectedProfile(null)}
              sx={{ color: "rgba(255,255,255,0.7)", textTransform: "none" }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!password.trim() || submitting}
              startIcon={<LockOpenOutlinedIcon />}
              sx={{ px: 3, textTransform: "none" }}
            >
              {submitting ? "Unlocking..." : "Enter"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};
