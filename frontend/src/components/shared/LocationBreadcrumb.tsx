import React from "react";
import { Breadcrumbs, Link, Typography, Chip } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

export interface BreadcrumbItem {
  id: number;
  name: string;
  kind?: string;
}

interface LocationBreadcrumbProps {
  breadcrumbs?: BreadcrumbItem[];
  onSelect?: (id: number) => void;
}

export const LocationBreadcrumb: React.FC<LocationBreadcrumbProps> = ({
  breadcrumbs,
  onSelect,
}) => {
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No location set
      </Typography>
    );
  }

  return (
    <Breadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      aria-label="location path"
      sx={{ alignItems: "center" }}
    >
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return isLast ? (
          <Chip
            key={crumb.id}
            icon={<PlaceOutlinedIcon />}
            label={`${crumb.name} (${crumb.kind || "Place"})`}
            size="small"
            color="primary"
            variant="filled"
          />
        ) : (
          <Link
            key={crumb.id}
            component="button"
            underline="hover"
            color="inherit"
            variant="body2"
            onClick={() => onSelect && onSelect(crumb.id)}
            sx={{ cursor: onSelect ? "pointer" : "default" }}
          >
            {crumb.name}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
};
