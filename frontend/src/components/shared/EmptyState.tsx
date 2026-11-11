import React from "react";
import { Box, Typography, Button, Fade } from "@mui/material";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <Fade in appear timeout={250}>
      <Box
        sx={{
          textAlign: "center",
          py: 6,
          px: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            color: "text.secondary",
            fontSize: 48,
            mb: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon || <InboxOutlinedIcon sx={{ fontSize: 56 }} />}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
          {title}
        </Typography>
        {description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 450, mb: 2.5 }}
          >
            {description}
          </Typography>
        )}
        {actionLabel && onAction && (
          <Button variant="contained" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Box>
    </Fade>
  );
};
