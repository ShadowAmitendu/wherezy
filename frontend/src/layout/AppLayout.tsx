import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  ListItemIcon,
  ListItemText,
  IconButton,
  useMediaQuery,
  useTheme,
  Tooltip,
  Badge,
  Menu,
  MenuItem,
  Button,
  Divider,
  Paper,
  BottomNavigation,
  BottomNavigationAction,
  CircularProgress,
  Fade,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import CheckIcon from "@mui/icons-material/Check";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useAppTheme, THEME_PRESETS, ThemePreset } from "../theme/themeConstants";
import { useAuth } from "../auth/useAuth";
import { hasPermission } from "../auth/permissions";
import { ProfileAvatar } from "../components/shared/ProfileAvatar";
import { CommandPalette } from "../features/palette/CommandPalette";
import { SidebarNav } from "./SidebarNav";
import { useOnUndoRefresh } from "../components/shared/UndoContext";
import { api } from "../api/client";

const DRAWER_WIDTH = 220;
const MINI_DRAWER_WIDTH = 80;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { mode, setMode, preset, setPreset, resolvedMode, presetConfig } = useAppTheme();
  const [themeAnchorEl, setThemeAnchorEl] = useState<null | HTMLElement>(null);
  const { logout, currentProfile: authProfile } = useAuth();

  // Desktop/Tablet sidebar state: expanded (text + icons) or collapsed (only icons)
  // On tablets, default to mini rail (80px) to maximize content width
  const [desktopOpen, setDesktopOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("hi_sidebar_open");
    if (saved !== null) return saved === "true";
    return typeof window !== "undefined" ? window.innerWidth >= 960 : true;
  });

  // Mobile temporary drawer state
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Command Palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Reminders badge state
  const [remindersCount, setRemindersCount] = useState<number>(0);

  // Notification dropdown popover state
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [topNotifications, setTopNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);

  const handleOpenNotifications = async (event: React.MouseEvent<HTMLElement>) => {
    setNotifAnchorEl(event.currentTarget);
    setLoadingNotifications(true);
    try {
      const data = await api.getReminders();
      const active = (data || []).filter((r: any) => r.status === "overdue" || r.status === "due_soon");
      setTopNotifications(active.slice(0, 5));
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleCloseNotifications = () => {
    setNotifAnchorEl(null);
  };

  // Account menu anchor state
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);

  const currentProfile = authProfile;

  const fetchRemindersCount = useCallback(async () => {
    try {
      const remCount = await api.getRemindersCount().catch(() => ({ total: 0 }));
      if (remCount) setRemindersCount(remCount.total || 0);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getRemindersCount()
      .catch(() => ({ total: 0 }))
      .then((remCount) => {
        if (active && remCount) {
          setRemindersCount(remCount.total || 0);
        }
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useOnUndoRefresh(() => {
    void fetchRemindersCount();
  });

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const isUserAdminOrCoAdmin = hasPermission(currentProfile, "profiles:write");

  const handleNavSelect = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const renderSidebar = (isMini: boolean) => (
    <SidebarNav
      currentPath={location.pathname}
      isMini={isMini}
      isAdminOrCoAdmin={isUserAdminOrCoAdmin}
      badges={{ "/reminders": remindersCount }}
      onSelectPath={handleNavSelect}
    />
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
        <Toolbar
          sx={{
            justifyContent: "space-between",
            px: { xs: 1.5, sm: 2.5 },
            minHeight: { xs: 56, sm: 64 },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {/* Hamburger Button */}
            <Tooltip title={isMobile ? "Open menu" : desktopOpen ? "Collapse sidebar" : "Expand sidebar"}>
              <IconButton
                color="inherit"
                aria-label="toggle navigation menu"
                onClick={handleDrawerToggle}
                size={isMobile ? "small" : "medium"}
                sx={{
                  ml: { xs: -0.5, sm: 0 },
                  mr: { xs: 1, sm: 2 },
                }}
              >
                <MenuIcon />
              </IconButton>
            </Tooltip>

            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}
              onClick={() => navigate("/")}
            >
              <Inventory2OutlinedIcon color="primary" />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: "1rem", sm: "1.25rem" },
                  display: { xs: "none", sm: "block" },
                }}
                noWrap
              >
                Wherezy
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 } }}>
            {/* Quick Command Palette Launcher */}
            <Tooltip title="Quick Search (Ctrl+K)">
              <IconButton onClick={() => setPaletteOpen(true)} color="inherit" size={isMobile ? "small" : "medium"}>
                <SearchIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            {/* Notification Bell with Dropdown Menu */}
            <Tooltip title="Notifications">
              <IconButton
                onClick={handleOpenNotifications}
                color="inherit"
                size={isMobile ? "small" : "medium"}
                aria-label="notifications"
              >
                <Badge badgeContent={remindersCount} color="error" max={99}>
                  <NotificationsOutlinedIcon fontSize={isMobile ? "small" : "medium"} />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Notification Dropdown Menu */}
            <Menu
              anchorEl={notifAnchorEl}
              open={Boolean(notifAnchorEl)}
              onClose={handleCloseNotifications}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              slotProps={{
                paper: {
                  sx: {
                    width: { xs: 300, sm: 340 },
                    maxWidth: "92vw",
                    mt: 1,
                  },
                },
                list: {
                  disablePadding: true,
                },
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: 1,
                  borderColor: "divider",
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Notifications
                </Typography>
                {remindersCount > 0 && (
                  <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                    {remindersCount} due
                  </Typography>
                )}
              </Box>

              <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                {loadingNotifications ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size={22} />
                  </Box>
                ) : topNotifications.length === 0 ? (
                  <Box sx={{ py: 3, px: 2, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      No pending reminders
                    </Typography>
                  </Box>
                ) : (
                  topNotifications.map((n, i) => {
                    const isOverdue = n.status === "overdue";
                    const subtitleParts = [
                      isOverdue ? `Overdue (${n.due_date})` : `Due ${n.due_date}`,
                      n.borrower_name ? `Loaned to ${n.borrower_name}` : null,
                    ].filter(Boolean);

                    return (
                      <MenuItem
                        key={n.id || i}
                        divider={i < topNotifications.length - 1}
                        onClick={() => {
                          handleCloseNotifications();
                          navigate(n.item_id ? `/items?selected=${n.item_id}` : "/reminders");
                        }}
                        sx={{
                          px: 2,
                          py: 1.25,
                          gap: 1.5,
                          alignItems: "flex-start",
                          whiteSpace: "normal",
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 24, mt: 0.25 }}>
                          {isOverdue ? (
                            <WarningAmberOutlinedIcon fontSize="small" color="error" />
                          ) : (
                            <ScheduleOutlinedIcon fontSize="small" color="warning" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                              {n.item_name}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                              {subtitleParts.join(" · ")}
                            </Typography>
                          }
                        />
                      </MenuItem>
                    );
                  })
                )}
              </Box>

              <MenuItem
                onClick={() => {
                  handleCloseNotifications();
                  navigate("/reminders");
                }}
                sx={{
                  justifyContent: "center",
                  py: 1.25,
                  borderTop: 1,
                  borderColor: "divider",
                }}
              >
                <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                  View all reminders
                </Typography>
              </MenuItem>
            </Menu>

            {/* Theme & Palette Switcher */}
            <Tooltip title={`Theme: ${presetConfig.name} (${resolvedMode})`}>
              <IconButton onClick={(e) => setThemeAnchorEl(e.currentTarget)} color="inherit" size={isMobile ? "small" : "medium"}>
                <PaletteOutlinedIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={themeAnchorEl}
              open={Boolean(themeAnchorEl)}
              onClose={() => setThemeAnchorEl(null)}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              slotProps={{
                paper: {
                  sx: { maxHeight: "80vh" },
                },
              }}
              sx={{ mt: 1 }}
            >
              <MenuItem disabled sx={{ opacity: "1 !important", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Color Palette
              </MenuItem>
              {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((k) => {
                const cfg = THEME_PRESETS[k];
                const active = preset === k;
                return (
                  <MenuItem
                    key={k}
                    selected={active}
                    onClick={(e) => {
                      setPreset(k, e);
                      setThemeAnchorEl(null);
                    }}
                    sx={{ display: "flex", justifyContent: "space-between", gap: 2, minWidth: 230 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        {cfg.colors.map((c, i) => (
                          <Box
                            key={i}
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              bgcolor: c,
                              border: "1px solid",
                              borderColor: "divider",
                            }}
                          />
                        ))}
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: active ? 700 : 500 }}>
                        {cfg.name}
                      </Typography>
                    </Box>
                    {active && <CheckIcon fontSize="small" color="primary" />}
                  </MenuItem>
                );
              })}
              <Divider sx={{ my: 1 }} />
              <MenuItem disabled sx={{ opacity: "1 !important", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Display Mode
              </MenuItem>
              <MenuItem
                selected={mode === "dark"}
                onClick={(e) => {
                  setMode("dark", e);
                  setThemeAnchorEl(null);
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <DarkModeOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Dark Theme" />
                {mode === "dark" && <CheckIcon fontSize="small" color="primary" />}
              </MenuItem>
              <MenuItem
                selected={mode === "light"}
                onClick={(e) => {
                  setMode("light", e);
                  setThemeAnchorEl(null);
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <LightModeOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Light Theme" />
                {mode === "light" && <CheckIcon fontSize="small" color="primary" />}
              </MenuItem>
              <MenuItem
                selected={mode === "system"}
                onClick={(e) => {
                  setMode("system", e);
                  setThemeAnchorEl(null);
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <SettingsBrightnessIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Follow System" />
                {mode === "system" && <CheckIcon fontSize="small" color="primary" />}
              </MenuItem>
            </Menu>

            {/* Profile Menu */}
            {currentProfile ? (
              <>
                <Tooltip title={currentProfile.name}>
                  <IconButton
                    onClick={(e) => setProfileAnchorEl(e.currentTarget)}
                    color="inherit"
                    size={isMobile ? "small" : "medium"}
                    aria-label="account menu"
                    aria-controls={profileAnchorEl ? "profile-menu" : undefined}
                    aria-haspopup="true"
                    aria-expanded={profileAnchorEl ? "true" : undefined}
                    sx={{ p: 0.5 }}
                  >
                    <ProfileAvatar
                      name={currentProfile.name}
                      color={currentProfile.color}
                      avatarEmoji={currentProfile.avatar_emoji}
                      avatarUrl={currentProfile.avatar_url}
                      size={isMobile ? 28 : 32}
                      iconFontSize="small"
                    />
                  </IconButton>
                </Tooltip>

                <Menu
                  id="profile-menu"
                  anchorEl={profileAnchorEl}
                  open={Boolean(profileAnchorEl)}
                  onClose={() => setProfileAnchorEl(null)}
                  transformOrigin={{ horizontal: "right", vertical: "top" }}
                  anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                  slotProps={{
                    paper: {
                      elevation: 4,
                      sx: {
                        minWidth: 210,
                        maxWidth: 260,
                        mt: 1,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        overflow: "hidden",
                      },
                    },
                    list: {
                      disablePadding: true,
                      sx: {
                        pb: 0.75,
                        "& .MuiMenuItem-root": {
                          mx: 0.75,
                          px: 1.5,
                          py: 0.875,
                          borderRadius: 1,
                        },
                        "& .MuiMenuItem-root + .MuiMenuItem-root": {
                          mt: 0.25,
                        },
                        "& .MuiListItemIcon-root": {
                          minWidth: 28,
                          color: "text.secondary",
                        },
                        "& .MuiListItemText-primary": {
                          fontSize: "0.875rem",
                          fontWeight: 500,
                        },
                      },
                    },
                  }}
                >
                  <Box
                    sx={{
                      px: 2.5,
                      py: 1.25,
                      mb: 0.75,
                      textAlign: "center",
                      borderBottom: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.3 }}
                      noWrap
                    >
                      {currentProfile.name}
                    </Typography>
                  </Box>
                  <MenuItem
                    onClick={() => {
                      setProfileAnchorEl(null);
                      navigate("/account");
                    }}
                  >
                    <ListItemIcon>
                      <AccountCircleOutlinedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Account & Profile" />
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setProfileAnchorEl(null);
                      navigate("/lock");
                    }}
                  >
                    <ListItemIcon>
                      <SwitchAccountOutlinedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Switch User" />
                  </MenuItem>
                  <Divider sx={{ my: 0.75 }} />
                  <MenuItem
                    onClick={() => {
                      setProfileAnchorEl(null);
                      logout();
                      navigate("/lock");
                    }}
                  >
                    <ListItemIcon>
                      <LockOutlinedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Lock Session" />
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setProfileAnchorEl(null);
                      logout();
                      navigate("/login");
                    }}
                    sx={{
                      color: "error.main",
                      "& .MuiListItemIcon-root": {
                        color: "inherit",
                      },
                    }}
                  >
                    <ListItemIcon>
                      <LogoutIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary="Sign Out" />
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={() => navigate("/login")}
                sx={{ borderRadius: 1, textTransform: "none" }}
              >
                Sign In
              </Button>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* Desktop Side Drawer */}
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
                duration: desktopOpen
                  ? t.transitions.duration.enteringScreen
                  : t.transitions.duration.leavingScreen,
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
                  duration: desktopOpen
                    ? t.transitions.duration.enteringScreen
                    : t.transitions.duration.leavingScreen,
                }),
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflowY: "auto", overflowX: "hidden" }}>
            {renderSidebar(!desktopOpen)}
          </Box>
        </Drawer>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            [`& .MuiDrawer-paper`]: {
              width: 250,
              maxWidth: "80vw",
              boxSizing: "border-box",
              bgcolor: "background.paper",
            },
          }}
        >
          <Toolbar sx={{ display: "flex", alignItems: "center", px: 2, gap: 1 }}>
            <Inventory2OutlinedIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Wherezy
            </Typography>
          </Toolbar>
          <Divider />
          <Box sx={{ overflowY: "auto" }}>
            {renderSidebar(false)}
          </Box>
        </Drawer>
      )}

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2.5, md: 3 },
          width: { xs: "100%", sm: `calc(100% - ${currentDesktopWidth}px)` },
          transition: (t) =>
            t.transitions.create(["width", "margin"], {
              easing: t.transitions.easing.sharp,
              duration: desktopOpen
                ? t.transitions.duration.enteringScreen
                : t.transitions.duration.leavingScreen,
            }),
          mt: { xs: 7, sm: 8 },
          mb: { xs: 8, sm: 0 },
          overflowX: "hidden",
        }}
      >
        <Fade key={location.pathname} in appear timeout={{ enter: theme.transitions.duration.enteringScreen, exit: 0 }}>
          <Box sx={{ width: "100%", maxWidth: 1400, mx: "auto" }}>
            <Outlet />
          </Box>
        </Fade>
      </Box>

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <Paper
          elevation={8}
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.appBar,
            display: { xs: "block", sm: "none" },
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <BottomNavigation
            showLabels
            value={
              location.pathname === "/"
                ? "/"
                : location.pathname.startsWith("/items")
                ? "/items"
                : location.pathname.startsWith("/inbox")
                ? "/inbox"
                : location.pathname.startsWith("/scan")
                ? "/scan"
                : ""
            }
            onChange={(_, newValue) => {
              if (newValue === "more") {
                setMobileOpen(true);
              } else if (newValue) {
                navigate(newValue);
              }
            }}
            sx={{
              height: 58,
              bgcolor: "background.paper",
              "& .MuiBottomNavigationAction-root": {
                minWidth: "auto",
                px: 1,
                py: 0.5,
                color: "text.secondary",
                transition: (t) =>
                  t.transitions.create(["color", "transform"], {
                    duration: t.transitions.duration.shortest,
                  }),
                "&.Mui-selected": {
                  color: "primary.main",
                  fontWeight: 700,
                  "& svg": {
                    transform: "scale(1.1)",
                  },
                },
                "& svg": {
                  transition: (t) =>
                    t.transitions.create("transform", {
                      duration: t.transitions.duration.shortest,
                    }),
                },
              },
            }}
          >
            <BottomNavigationAction label="Home" value="/" icon={<DashboardOutlinedIcon fontSize="small" />} />
            <BottomNavigationAction label="Items" value="/items" icon={<Inventory2OutlinedIcon fontSize="small" />} />
            <BottomNavigationAction label="Inbox" value="/inbox" icon={<MoveToInboxOutlinedIcon fontSize="small" />} />
            <BottomNavigationAction label="Scan" value="/scan" icon={<QrCodeScannerOutlinedIcon fontSize="small" />} />
            <BottomNavigationAction label="More" value="more" icon={<MenuIcon fontSize="small" />} />
          </BottomNavigation>
        </Paper>
      )}

      {/* Global Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </Box>
  );
};