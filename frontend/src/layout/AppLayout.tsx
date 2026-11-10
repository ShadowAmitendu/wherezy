import React from "react";
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
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  useMediaQuery,
  useTheme,
  Tooltip,
} from "@mui/material";
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

  const handleThemeToggle = () => {
    if (mode === "system") {
      setMode(resolvedMode === "dark" ? "light" : "dark");
    } else if (mode === "light") {
      setMode("dark");
    } else {
      setMode("system");
    }
  };

  const getActiveTab = () => {
    const current = location.pathname;
    if (current === "/") return "/";
    if (current.startsWith("/items")) return "/items";
    if (current.startsWith("/locations")) return "/locations";
    if (current.startsWith("/scan")) return "/scan";
    if (current.startsWith("/settings")) return "/settings";
    return current;
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Top App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          color: "text.primary",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Inventory2OutlinedIcon color="primary" />
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, cursor: "pointer" }}
              noWrap
              onClick={() => navigate("/")}
            >
              HomeInventory
            </Typography>
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

      {/* Desktop Side Drawer */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: "auto", py: 2 }}>
            <List>
              {NAV_ITEMS.map((item) => {
                const isSelected =
                  item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);
                return (
                  <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                    <ListItemButton
                      selected={isSelected}
                      onClick={() => navigate(item.path)}
                      sx={{
                        mx: 1,
                        borderRadius: 2,
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
                      <ListItemIcon sx={{ minWidth: 40, color: isSelected ? "inherit" : "text.secondary" }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        sx={{ "& .MuiListItemText-primary": { fontWeight: isSelected ? 600 : 500 } }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        </Drawer>
      )}

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: 8,
          mb: { xs: 8, sm: 0 },
        }}
      >
        <Outlet />
      </Box>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <Paper
          sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000, borderTop: "1px solid", borderColor: "divider" }}
          elevation={3}
        >
          <BottomNavigation
            showLabels
            value={getActiveTab()}
            onChange={(_, newValue) => navigate(newValue)}
          >
            <BottomNavigationAction label="Home" value="/" icon={<DashboardOutlinedIcon />} />
            <BottomNavigationAction label="Items" value="/items" icon={<Inventory2OutlinedIcon />} />
            <BottomNavigationAction label="Places" value="/locations" icon={<PlaceOutlinedIcon />} />
            <BottomNavigationAction label="Scan" value="/scan" icon={<QrCodeScannerOutlinedIcon />} />
            <BottomNavigationAction label="More" value="/settings" icon={<SettingsOutlinedIcon />} />
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
};
