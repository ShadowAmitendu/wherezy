import React from "react";
import { Box, Typography } from "@mui/material";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  documentTitle?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  documentTitle,
}) => {
  useDocumentTitle(documentTitle ?? title);
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "center" },
        gap: { xs: 1.5, sm: 2 },
        mb: { xs: 2.5, sm: 3 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        {icon && (
          <Box
            sx={{
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 2,
              bgcolor: (theme) => (theme.palette.mode === "dark" ? "action.hover" : "primary.main"),
              color: (theme) => (theme.palette.mode === "dark" ? "primary.main" : "primary.contrastText"),
              border: "1px solid",
              borderColor: "divider",
              flexShrink: 0,
              "& svg": {
                fontSize: 26,
              },
            }}
          >
            {icon}
          </Box>
        )}
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: { xs: "0.8125rem", sm: "0.875rem" } }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {action && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{action}</Box>}
    </Box>
  );
};
