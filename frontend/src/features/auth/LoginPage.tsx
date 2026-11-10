import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
  Chip,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import { useAuth } from "../../auth/AuthContext";
import { ApiException } from "../../api/client";

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg("Please enter your username.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message || "Invalid username or password.");
      } else {
        setErrorMsg("Failed to sign in. Please verify your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Card
        elevation={6}
        sx={{
          maxWidth: 420,
          width: "100%",
          borderRadius: 2,
          p: { xs: 2, sm: 3 },
          boxShadow: (t) =>
            t.palette.mode === "dark"
              ? "0 8px 32px rgba(0,0,0,0.5)"
              : "0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          {/* Brand & Title */}
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 3 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 1.5,
                boxShadow: 2,
              }}
            >
              <Inventory2OutlinedIcon fontSize="large" />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
              HomeInventory
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Sign in to manage your inventory & household
            </Typography>
          </Box>

          {errorMsg && (
            <Alert severity="error" variant="filled" sx={{ mb: 2.5 }}>
              {errorMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              placeholder="e.g. admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              autoFocus
              disabled={loading}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder="e.g. admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              disabled={loading}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            {/* Hint for default credentials */}
            <Box sx={{ mt: 1, mb: 2, display: "flex", justifyContent: "center" }}>
              <Chip
                label="Default login: admin / admin"
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.75rem", opacity: 0.8 }}
              />
            </Box>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || !username.trim()}
              sx={{
                py: 1.25,
                fontWeight: 700,
                fontSize: "1rem",
                borderRadius: 1,
                textTransform: "none",
              }}
            >
              {loading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              OR
            </Typography>
          </Divider>

          {/* Switch to Netflix-style User Picker */}
          <Button
            variant="outlined"
            fullWidth
            startIcon={<GroupOutlinedIcon />}
            onClick={() => navigate("/lock")}
            sx={{
              py: 1,
              borderRadius: 1,
              textTransform: "none",
              fontWeight: 600,
            }}
          >
            Who's using? (Profile Picker)
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
};
