import React, { useState } from "react";
import {
  Box,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Badge,
  Tooltip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { NAV_CATEGORIES, NavCategory } from "./navConfig";

const COLLAPSED_CATS_KEY = "hi_sidebar_collapsed_cats";

function loadCollapsedCategories(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_CATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const map: Record<string, boolean> = {};
    for (const id of parsed) {
      if (typeof id === "string") map[id] = true;
    }
    return map;
  } catch {
    return {};
  }
}

export interface SidebarNavProps {
  categories?: NavCategory[];
  currentPath: string;
  isMini: boolean;
  isAdminOrCoAdmin: boolean;
  badges?: Record<string, number>;
  onSelectPath: (path: string) => void;
}

/**
 * Categorized Material Design navigation list with collapsible category groups
 * and compact link proportions, keeping icon X-alignment aligned with the AppBar menu button.
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({
  categories = NAV_CATEGORIES,
  currentPath,
  isMini,
  isAdminOrCoAdmin,
  badges = {},
  onSelectPath,
}) => {
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(loadCollapsedCategories);

  const toggleCategory = (categoryId: string) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [categoryId]: !prev[categoryId] };
      const collapsedIds = Object.keys(next).filter((k) => next[k]);
      try {
        localStorage.setItem(COLLAPSED_CATS_KEY, JSON.stringify(collapsedIds));
      } catch {
        // Ignore storage errors (e.g. private mode quota)
      }
      return next;
    });
  };

  const visibleCategories = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.adminOnly || isAdminOrCoAdmin),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <Box component="nav" aria-label="Main navigation" sx={{ py: 0.75 }}>
      {visibleCategories.map((category, index) => {
        const isExpanded = isMini || !collapsedMap[category.id];
        const categoryBadgeCount = category.items.reduce(
          (sum, item) => sum + (badges[item.path] || 0),
          0,
        );

        return (
          <React.Fragment key={category.id}>
            {index > 0 && <Divider sx={{ my: 0.75, mx: 2 }} />}

            {!isMini && (
              <ListItemButton
                onClick={() => toggleCategory(category.id)}
                aria-expanded={isExpanded}
                sx={{
                  mx: 1,
                  // pl: 2.5 aligns header text (8px + 20px = 28px) cleanly with ListItemIcon below
                  pl: 2.5,
                  pr: 1.5,
                  py: 0.4,
                  minHeight: 28,
                  borderRadius: 1,
                  justifyContent: "space-between",
                  color: "text.secondary",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    lineHeight: 1.2,
                  }}
                >
                  {category.title}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {!isExpanded && categoryBadgeCount > 0 && (
                    <Typography
                      variant="caption"
                      color="error.main"
                      sx={{ fontSize: "0.68rem", fontWeight: 700, lineHeight: 1 }}
                    >
                      {categoryBadgeCount}
                    </Typography>
                  )}
                  <ExpandMoreIcon
                    sx={{
                      fontSize: 16,
                      color: "text.disabled",
                      transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                </Box>
              </ListItemButton>
            )}

            <Collapse in={isExpanded} timeout="auto">
              <List disablePadding sx={{ mt: !isMini ? 0.25 : 0 }}>
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
                        minHeight: { xs: 40, sm: 36 },
                        py: 0.5,
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
                          minWidth: 24,
                          mr: isMini ? 0 : 1.75,
                          justifyContent: "center",
                          color: isSelected ? "inherit" : "text.secondary",
                          "& svg": {
                            fontSize: isMini ? 22 : 20,
                          },
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
                            my: 0,
                            "& .MuiListItemText-primary": {
                              fontSize: "0.875rem",
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
            </Collapse>
          </React.Fragment>
        );
      })}
    </Box>
  );
};
