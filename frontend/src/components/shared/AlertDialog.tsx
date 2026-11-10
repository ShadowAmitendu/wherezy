import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Typography,
} from "@mui/material";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

export type AlertSeverity = "error" | "success" | "warning" | "info";

export interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message: string | null;
  severity?: AlertSeverity;
  confirmText?: string;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onClose,
  title,
  message,
  severity = "error",
  confirmText = "OK",
}) => {
  if (!message) return null;

  const getIconAndColor = () => {
    switch (severity) {
      case "success":
        return {
          icon: <CheckCircleOutlinedIcon sx={{ fontSize: 32 }} />,
          color: "success.main",
          defaultTitle: "Success",
        };
      case "warning":
        return {
          icon: <WarningAmberOutlinedIcon sx={{ fontSize: 32 }} />,
          color: "warning.main",
          defaultTitle: "Warning",
        };
      case "info":
        return {
          icon: <InfoOutlinedIcon sx={{ fontSize: 32 }} />,
          color: "info.main",
          defaultTitle: "Notice",
        };
      case "error":
      default:
        return {
          icon: <ErrorOutlineOutlinedIcon sx={{ fontSize: 32 }} />,
          color: "error.main",
          defaultTitle: "Notice",
        };
    }
  };

  const { icon, color, defaultTitle } = getIconAndColor();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            p: 1,
            boxShadow: 6,
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}>
        <Box sx={{ color, display: "flex", alignItems: "center" }}>
          {icon}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {title || defaultTitle}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 1, pb: 1.5 }}>
        <DialogContentText sx={{ color: "text.primary", fontSize: "0.95rem", lineHeight: 1.5 }}>
          {message}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, pb: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          autoFocus
          sx={{
            minWidth: 90,
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 1,
          }}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
