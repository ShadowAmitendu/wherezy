import React from "react";
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Badge,
  Tooltip,
} from "@mui/material";
import { NAV_CATEGORIES, NavCategory } from "./navConfig";

export interface SidebarNavProps {
  categories?: NavCategory[];
  currentPath: string;
  isMini: boolean;
  isAdminOrCoAdmin: boolean;
  badges?: Record<string, number>;
  onSelectPath: (path: string) => void;
}

/**
 * Categorized Material Design navigation list supporting both expanded drawer
 * subheaders and compact mini-rail dividers while keeping icon X-alignment fixed.
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({
  categories = NAV_CATEGORIES,
  currentPath,
  isMini,
  isAdminOrCoAdmin,
  badges = {},
  onSelectPath,
}) => {
  const visibleCategories = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.adminOnly || isAdminOrCoAdmin),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <Box component="nav" aria-label="Main navigation" sx={{ py: 1 }}>
      {visibleCategories.map((category, index) => (
        <React.Fragment key={category.id}>
          {index > 0 && <Divider sx={{ my: 1, mx: 2 }} />}
          <List
            disablePadding
            subheader={
              !isMini ? (
                <ListSubheader
                  component="div"
                  disableSticky
                  sx={{
                    bgcolor: "transparent",
                    color: "text.secondary",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    lineHeight: "28px",
                    // 28px horizontal padding aligns cleanly with ListItemIcon (mx: 1 + px: 2.5)
                    px: 3.5,
                    pt: index === 0 ? 0.25 : 0.5,
                    pb: 0.5,
                    userSelect: "none",
                  }}
                >
                  {category.title}
                </ListSubheader>
              ) : undefined
            }
          >
            {category.items.map((item) => {
              const isSelected =
                item.path === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(item.path);
              const badgeCount = badges[item.path] || 0;

              const buttonContent = (
                <ListItemButton
                  selected={isSelected}
                  onClick={() => onSelectPath(item.path)}
                  sx={{
                    minHeight: { xs: 46, sm: 44 },
                    justifyContent: "initial",
                    px: 2.5,
                    mx: 1,
                    borderRadius: 1,
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "& .MuiListItemIcon-root": {
                        color: "primary.contrastText",
                      },
                      "&:hover": {
                        bgcolor: "primary.dark",
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: isMini ? 0 : 2,
                      justifyContent: "center",
                      color: isSelected ? "inherit" : "text.secondary",
                    }}
                  >
                    {badgeCount > 0 ? (
                      <Badge badgeContent={badgeCount} color="error" max={99}>
                        {item.icon}
                      </Badge>
                    ) : (
                      item.icon
                    )}
                  </ListItemIcon>
                  {!isMini && (
                    <ListItemText
                      primary={item.label}
                      sx={{
                        "& .MuiListItemText-primary": {
                          fontWeight: isSelected ? 600 : 500,
                          whiteSpace: "nowrap",
                        },
                      }}
                    />
                  )}
                </ListItemButton>
              );

              return (
                <ListItem key={item.path} disablePadding sx={{ mb: 0.25, display: "block" }}>
                  {isMini ? (
                    <Tooltip title={item.label} placement="right" arrow>
                      {buttonContent}
                    </Tooltip>
                  ) : (
                    buttonContent
                  )}
                </ListItem>
              );
            })}
          </List>
        </React.Fragment>
      ))}
    </Box>
  );
};
