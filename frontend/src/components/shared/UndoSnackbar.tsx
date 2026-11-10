import React from "react";
import { Snackbar, Alert, Button, IconButton, Box } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface UndoSnackbarProps {
  open: boolean;
  message: string;
  onUndo: () => void;
  onClose: () => void;
  autoHideDuration?: number;
}

export const UndoSnackbar: React.FC<UndoSnackbarProps> = ({
  open,
  message,
  onUndo,
  onClose,
  autoHideDuration = 10000,
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{
        zIndex: 2000,
        bottom: { xs: 24, sm: 32 },
      }}
    >
      <Alert
        variant="filled"
        severity="info"
        onClose={onClose}
        action={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              color="inherit"
              size="small"
              onClick={onUndo}
              sx={{
                fontWeight: 700,
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.6)",
                px: 1.5,
                py: 0.25,
                fontSize: "0.8rem",
                "&:hover": { bgcolor: "rgba(255, 255, 255, 0.2)" },
              }}
            >
              UNDO
            </Button>
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={onClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        }
        sx={{
          minWidth: { xs: 280, sm: 380 },
          maxWidth: { xs: "90vw", sm: 540 },
          boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)",
          borderRadius: 1,
          alignItems: "center",
          fontWeight: 500,
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};
