import React, { useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  useMediaQuery,
  useTheme,
  Tooltip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useAppTheme } from "../theme";
import { useAuth } from "../auth/AuthContext";

const DRAWER_WIDTH = 240;
const MINI_DRAWER_WIDTH = 68;

const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Items", path: "/items", icon: <Inventory2OutlinedIcon /> },
  { label: "Categories", path: "/categories", icon: <CategoryOutlinedIcon /> },
  { label: "Locations", path: "/locations", icon: <PlaceOutlinedIcon /> },
  { label: "Expiry", path: "/expiry", icon: <EventBusyOutlinedIcon /> },
  { label: "Scan Code", path: "/scan", icon: <QrCodeScannerOutlinedIcon /> },
  { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon /> },
];

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { mode, setMode, resolvedMode } = useAppTheme();
  const { pinSet, logout } = useAuth();

  // Desktop sidebar state: expanded (text + icons) or collapsed (only icons)
  const [desktopOpen, setDesktopOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("hi_sidebar_open");
    return saved !== null ? saved === "true" : true;
  });

  // Mobile temporary drawer state
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setDesktopOpen((prev) => {
        const next = !prev;
        localStorage.setItem("hi_sidebar_open", String(next));
        return next;
      });
    }
  };

  const handleThemeToggle = () => {
    if (mode === "system") {
      setMode(resolvedMode === "dark" ? "light" : "dark");
    } else if (mode === "light") {
      setMode("dark");
    } else {
      setMode("system");
    }
  };

  const renderNavList = (isMini: boolean) => (
    <List sx={{ py: 1 }}>
      {NAV_ITEMS.map((item) => {
        const isSelected =
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);

        const buttonContent = (
          <ListItemButton
            selected={isSelected}
            onClick={() => {
              navigate(item.path);
              if (isMobile) setMobileOpen(false);
            }}
            sx={{
              minHeight: 48,
              justifyContent: isMini ? "center" : "initial",
              px: isMini ? 1.5 : 2.5,
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
              {item.icon}
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
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5, display: "block" }}>
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
  );

  const currentDesktopWidth = desktopOpen ? DRAWER_WIDTH : MINI_DRAWER_WIDTH;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Top App Bar with Hamburger menu */}
      <AppBar
        position="fixed"
        elevation={4}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: "background.paper",
          color: "text.primary",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {/* Hamburger Button */}
            <Tooltip title={desktopOpen ? "Collapse sidebar (icons only)" : "Expand sidebar"}>
              <IconButton
                color="inherit"
                aria-label="toggle navigation menu"
                onClick={handleDrawerToggle}
                edge="start"
                sx={{ mr: 1.5 }}
              >
                <MenuIcon />
              </IconButton>
            </Tooltip>

            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}
              onClick={() => navigate("/")}
            >
              <Inventory2OutlinedIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
                HomeInventory
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Tooltip title={`Theme: ${mode} (${resolvedMode})`}>
              <IconButton onClick={handleThemeToggle} color="inherit">
                {resolvedMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Tooltip>

            {pinSet && (
              <Tooltip title="Lock session">
                <IconButton onClick={logout} color="inherit">
                  <LockOutlinedIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* Desktop Side Drawer (Toggles between Icons-Only and Text + Icons) */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: currentDesktopWidth,
            flexShrink: 0,
            whiteSpace: "nowrap",
            boxSizing: "border-box",
            transition: (t) =>
              t.transitions.create("width", {
                easing: t.transitions.easing.sharp,
                duration: t.transitions.duration.enteringScreen,
              }),
            [`& .MuiDrawer-paper`]: {
              width: currentDesktopWidth,
              overflowX: "hidden",
              boxSizing: "border-box",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              transition: (t) =>
                t.transitions.create("width", {
                  easing: t.transitions.easing.sharp,
                  duration: t.transitions.duration.enteringScreen,
                }),
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: "hidden", py: 1 }}>
            {renderNavList(!desktopOpen)}
          </Box>
        </Drawer>
      )}

      {/* Mobile Drawer (Temporary slide-in when Hamburger is pressed) */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            [`& .MuiDrawer-paper`]: {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              bgcolor: "background.paper",
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: "auto", py: 1 }}>
            {renderNavList(false)}
          </Box>
        </Drawer>
      )}

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${currentDesktopWidth}px)` },
          transition: (t) =>
            t.transitions.create(["width", "margin"], {
              easing: t.transitions.easing.sharp,
              duration: t.transitions.duration.enteringScreen,
            }),
          mt: 8,
          mb: 0,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};
