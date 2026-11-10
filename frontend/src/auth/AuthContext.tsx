import React, { createContext, useContext, useState, useEffect } from "react";
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
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { api, ApiException } from "../api/client";

interface AuthContextType {
  pinSet: boolean;
  authenticated: boolean;
  isLoading: boolean;
  login: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
  setupPin: (pin?: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  pinSet: false,
  authenticated: true,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  setupPin: async () => {},
  refreshAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pinSet, setPinSet] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Login dialog state
  const [pinInput, setPinInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshAuth = async () => {
    try {
      const status = await api.getAuthStatus();
      setPinSet(status.pin_set);
      setAuthenticated(status.authenticated);
    } catch {
      // Default to allowed if backend not ready or offline
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (pin: string) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await api.login(pin);
      setAuthenticated(true);
      setPinInput("");
    } catch (err) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message || "Invalid PIN");
      } else {
        setErrorMsg("Login failed");
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    await api.logout();
    setAuthenticated(false);
  };

  const setupPin = async (pin?: string) => {
    await api.setupPin(pin);
    await refreshAuth();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    try {
      await login(pinInput.trim());
    } catch {
      // Handled in login
    }
  };

  return (
    <AuthContext.Provider
      value={{
        pinSet,
        authenticated,
        isLoading,
        login,
        logout,
        setupPin,
        refreshAuth,
      }}
    >
      {children}

      {/* Login Dialog if PIN is set and unauthenticated */}
      <Dialog open={!isLoading && pinSet && !authenticated} maxWidth="sm" fullWidth>
        <form onSubmit={handleLoginSubmit}>
          <DialogTitle sx={{ textAlign: "center", pt: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? alpha(t.palette.primary.main, 0.16)
                    : alpha(t.palette.primary.main, 0.12),
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 1,
              }}
            >
              <LockOutlinedIcon />
            </Box>
            Household PIN Required
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: "center" }}>
              Please enter the household PIN to access HomeInventory.
            </Typography>
            {errorMsg && (
              <Alert severity="error" variant="filled" onClose={() => setErrorMsg("")} sx={{ mb: 2 }}>
                {errorMsg}
              </Alert>
            )}
            <TextField
              autoFocus
              type="password"
              label="Household PIN"
              fullWidth
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              disabled={isSubmitting}
              slotProps={{
                htmlInput: {
                  inputMode: "numeric",
                  pattern: "[0-9]*",
                },
              }}
            />
          </DialogContent>
          <DialogActions sx={{ pb: 3, px: 3 }}>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={!pinInput.trim() || isSubmitting}
            >
              {isSubmitting ? "Unlocking..." : "Unlock"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </AuthContext.Provider>
  );
};
