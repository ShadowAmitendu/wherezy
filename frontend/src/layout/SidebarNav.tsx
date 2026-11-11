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
 * Categorized Material Design navigation list using compact link proportions
 * when expanded and normal spacing/icon sizing in icon-only (mini) mode.
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
    <Box component="nav" aria-label="Main navigation" sx={{ py: isMini ? 1 : 0.75 }}>
      {visibleCategories.map((category, index) => (
        <React.Fragment key={category.id}>
          {index > 0 && <Divider sx={{ my: isMini ? 1 : 0.75, mx: 2 }} />}
          <List
            disablePadding
            subheader={
              !isMini ? (
                <ListSubheader
                  disableSticky
                  sx={{
                    // px: 3.5 (28px) aligns subheader text cleanly with ListItemIcon below (mx: 1 + px: 2.5)
                    px: 3.5,
                    pt: 0.25,
                    pb: 0.25,
                    lineHeight: "24px",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    bgcolor: "transparent",
                    color: "text.secondary",
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
                        minHeight: isMini ? { xs: 46, sm: 44 } : { xs: 40, sm: 36 },
                        py: isMini ? 1 : 0.5,
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
                          minWidth: isMini ? 0 : 24,
                          mr: isMini ? 0 : 1.75,
                          justifyContent: "center",
                          color: isSelected ? "inherit" : "text.secondary",
                          ...(!isMini && {
                            "& svg": {
                              fontSize: 20,
                            },
                          }),
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
        </React.Fragment>
      ))}
    </Box>
  );
};
