import React, { useEffect, useRef, useState } from "react";
import {
  Snackbar,
  Paper,
  Button,
  IconButton,
  Box,
  Typography,
  LinearProgress,
  CircularProgress,
  Slide,
  SlideProps,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";

function SlideUpTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

export const DEFAULT_UNDO_DURATION_MS = 10000;

export interface UndoSnackbarProps {
  open: boolean;
  message: string;
  onUndo: () => void | Promise<void>;
  onClose: (event?: React.SyntheticEvent | Event, reason?: string) => void;
  autoHideDuration?: number;
  actionKey?: number | string;
  undoLabel?: string;
  undoing?: boolean;
  errorMessage?: string | null;
}

export const UndoSnackbar: React.FC<UndoSnackbarProps> = ({
  open,
  message,
  onUndo,
  onClose,
  autoHideDuration = DEFAULT_UNDO_DURATION_MS,
  actionKey = 0,
  undoLabel = "UNDO",
  undoing = false,
  errorMessage = null,
}) => {
  const theme = useTheme();
  const durationMs = Math.max(1000, autoHideDuration);
  const sessionKey = `${actionKey}:${durationMs}`;

  const [countdown, setCountdown] = useState<{ sessionKey: string; remainingMs: number }>({
    sessionKey,
    remainingMs: durationMs,
  });
  const [pausedSession, setPausedSession] = useState<string | null>(null);

  const remainingRef = useRef<{ sessionKey: string; open: boolean; ms: number }>({
    sessionKey,
    open: false,
    ms: durationMs,
  });
  const closedByTimeoutRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const paused = pausedSession === sessionKey;

  // Keep progress bar and 10s auto-close synchronized on a single clock
  useEffect(() => {
    if (!open) {
      remainingRef.current = { sessionKey: "", open: false, ms: durationMs };
      closedByTimeoutRef.current = false;
      return;
    }

    if (
      !remainingRef.current.open ||
      remainingRef.current.sessionKey !== sessionKey
    ) {
      remainingRef.current = { sessionKey, open: true, ms: durationMs };
      closedByTimeoutRef.current = false;
    }

    if (paused || undoing) return;

    let rafId: number | null = null;
    let lastNow = typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const delta = Math.max(0, now - lastNow);
      lastNow = now;

      const nextRemaining = Math.max(0, remainingRef.current.ms - delta);
      remainingRef.current.ms = nextRemaining;
      setCountdown({ sessionKey, remainingMs: nextRemaining });

      if (nextRemaining <= 0) {
        if (!closedByTimeoutRef.current) {
          closedByTimeoutRef.current = true;
          onCloseRef.current(undefined, "timeout");
        }
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [open, paused, undoing, sessionKey, durationMs]);

  const remainingMs = open
    ? countdown.sessionKey === sessionKey
      ? countdown.remainingMs
      : durationMs
    : countdown.remainingMs;

  const progressPercent = open
    ? Math.max(0, Math.min(100, (remainingMs / durationMs) * 100))
    : 0;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  const isDark = theme.palette.mode === "dark";
  const surfaceBg = isDark ? "#232730" : "#1f2430";
  const borderCol = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)";
  const trackBg = "rgba(255,255,255,0.16)";
  const accentColor = theme.palette.primary.light;

  const handleSnackbarClose = (event: React.SyntheticEvent | Event, reason: string) => {
    // Allow users to continue interacting with the page while keeping the 10s undo window active
    if (reason === "clickaway") return;
    onClose(event, reason);
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={null}
      onClose={handleSnackbarClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      slots={{ transition: SlideUpTransition }}
      sx={{
        zIndex: 2100,
        bottom: { xs: 74, sm: 28 },
      }}
    >
      <Paper
        elevation={8}
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPausedSession(sessionKey)}
        onMouseLeave={() => setPausedSession(null)}
        sx={{
          position: "relative",
          overflow: "hidden",
          bgcolor: surfaceBg,
          color: "#f8fafc",
          border: `1px solid ${borderCol}`,
          borderRadius: 1.5,
          minWidth: { xs: "calc(100vw - 24px)", sm: 400 },
          maxWidth: { xs: "calc(100vw - 24px)", sm: 560 },
          boxShadow: "0px 10px 28px rgba(0, 0, 0, 0.42)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            px: 2,
            pt: 1.25,
            pb: errorMessage ? 0.5 : 1.4,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="body2"
              sx={{
                color: "#f8fafc",
                fontWeight: 500,
                lineHeight: 1.35,
                wordBreak: "break-word",
              }}
            >
              {message}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
            <Typography
              variant="caption"
              aria-label={`${secondsLeft} seconds left to undo`}
              sx={{
                fontVariantNumeric: "tabular-nums",
                color: paused ? accentColor : "rgba(248, 250, 252, 0.72)",
                fontWeight: 600,
                minWidth: 28,
                textAlign: "right",
              }}
            >
              {secondsLeft}s
            </Typography>
            <Button
              size="small"
              onClick={() => void onUndo()}
              disabled={undoing}
              startIcon={
                undoing ? (
                  <CircularProgress size={14} sx={{ color: accentColor }} />
                ) : (
                  <UndoIcon fontSize="small" />
                )
              }
              sx={{
                color: accentColor,
                fontWeight: 700,
                letterSpacing: "0.04em",
                minWidth: "auto",
                px: 1.1,
                py: 0.4,
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.08)",
                },
                "&.Mui-disabled": {
                  color: "rgba(248, 250, 252, 0.5)",
                },
              }}
            >
              {undoing ? "Undoing..." : undoLabel}
            </Button>
            <IconButton
              size="small"
              aria-label="Dismiss undo notification"
              onClick={(e) => onClose(e, "dismiss")}
              disabled={undoing}
              sx={{
                color: "rgba(248, 250, 252, 0.72)",
                "&:hover": {
                  color: "#ffffff",
                  bgcolor: "rgba(255,255,255,0.08)",
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {errorMessage && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              px: 2,
              pb: 1.1,
              color: "#fca5a5",
              fontWeight: 500,
            }}
          >
            {errorMessage}
          </Typography>
        )}

        <LinearProgress
          variant="determinate"
          value={progressPercent}
          aria-label="Undo time remaining"
          sx={{
            height: 4,
            bgcolor: trackBg,
            "& .MuiLinearProgress-bar": {
              bgcolor: accentColor,
              transition: "none",
            },
          }}
        />
      </Paper>
    </Snackbar>
  );
};
