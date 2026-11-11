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
  type Theme,
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
 * when expanded and normal spacing/icon sizing in icon-only (mini) mode,
 * animating all sizing, padding, and label transitions cleanly across toggles.
 */
export const SidebarNav: React.FC<SidebarNavProps> = ({
  categories = NAV_CATEGORIES,
  currentPath,
  isMini,
  isAdminOrCoAdmin,
  badges = {},
  onSelectPath,
}) => {
  const navTransition =
    (props: string | string[]) =>
    (theme: Theme): string =>
      theme.transitions.create(props, {
        easing: theme.transitions.easing.sharp,
        duration: isMini
          ? theme.transitions.duration.leavingScreen
          : theme.transitions.duration.enteringScreen,
      });

  const visibleCategories = categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.adminOnly || isAdminOrCoAdmin),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <Box
      component="nav"
      aria-label="Main navigation"
      sx={{
        py: isMini ? 1 : 0.75,
        transition: navTransition(["padding-top", "padding-bottom"]),
      }}
    >
      {visibleCategories.map((category, index) => (
        <React.Fragment key={category.id}>
          {index > 0 && (
            <Divider
              sx={{
                my: isMini ? 1 : 0.75,
                mx: 2,
                transition: navTransition(["margin-top", "margin-bottom"]),
              }}
            />
          )}
          <List
            disablePadding
            subheader={
              <ListSubheader
                disableSticky
                aria-hidden={isMini}
                sx={{
                  // px: 3.5 (28px) aligns subheader text cleanly with ListItemIcon below (mx: 1 + px: 2.5)
                  px: 3.5,
                  pt: isMini ? 0 : 0.25,
                  pb: isMini ? 0 : 0.25,
                  maxHeight: isMini ? 0 : 28,
                  opacity: isMini ? 0 : 1,
                  overflow: "hidden",
                  pointerEvents: isMini ? "none" : "auto",
                  lineHeight: "24px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  bgcolor: "transparent",
                  color: "text.secondary",
                  transition: navTransition(["max-height", "padding-top", "padding-bottom", "opacity"]),
                }}
              >
                {category.title}
              </ListSubheader>
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
                        transition: navTransition(["min-height", "padding-top", "padding-bottom", "background-color"]),
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
                          transition: navTransition("margin-right"),
                          "& svg": {
                            fontSize: isMini ? 24 : 20,
                            transition: navTransition("font-size"),
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
                      <ListItemText
                        primary={item.label}
                        aria-hidden={isMini}
                        sx={{
                          my: 0,
                          minWidth: 0,
                          maxWidth: isMini ? 0 : 180,
                          opacity: isMini ? 0 : 1,
                          overflow: "hidden",
                          transition: navTransition(["opacity", "max-width"]),
                          "& .MuiListItemText-primary": {
                            fontSize: "0.875rem",
                            fontWeight: isSelected ? 600 : 500,
                            whiteSpace: "nowrap",
                          },
                        }}
                      />
                    </ListItemButton>
                  );

                  return (
                    <ListItem key={item.path} disablePadding sx={{ mb: 0.25, display: "block" }}>
                      <Tooltip
                        title={item.label}
                        placement="right"
                        arrow
                        disableHoverListener={!isMini}
                        disableFocusListener={!isMini}
                        disableTouchListener={!isMini}
                      >
                        {buttonContent}
                      </Tooltip>
                    </ListItem>
                  );
                })}
          </List>
        </React.Fragment>
      ))}
    </Box>
  );
};
