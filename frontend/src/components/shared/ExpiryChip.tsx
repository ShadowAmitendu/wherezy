import React from "react";
import { Chip } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";

interface ExpiryChipProps {
  status?: "expired" | "soon" | "ok" | "none" | null;
  dateStr?: string | null;
  size?: "small" | "medium";
}

export const ExpiryChip: React.FC<ExpiryChipProps> = ({ status, dateStr, size = "small" }) => {
  if (!status || status === "none" || !dateStr) {
    return null;
  }

  if (status === "expired") {
    return (
      <Chip
        icon={<ErrorOutlineIcon />}
        label={`Expired ${dateStr}`}
        color="error"
        size={size}
        variant="filled"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  if (status === "soon") {
    return (
      <Chip
        icon={<WarningAmberIcon />}
        label={`Expiring ${dateStr}`}
        color="warning"
        size={size}
        variant="filled"
        sx={{ fontWeight: 600 }}
      />
    );
  }

  return (
    <Chip
      icon={<CheckCircleOutlineIcon />}
      label={`Valid till ${dateStr}`}
      color="success"
      size={size}
      variant="outlined"
    />
  );
};
