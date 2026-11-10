import React, { useState, useEffect } from "react";
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
  Badge,
  Menu,
  MenuItem,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Divider,
  Paper,
  Grid,
  BottomNavigation,
  BottomNavigationAction,
  CircularProgress,
} from "@mui/material";
import { AlertDialog } from "../components/shared/AlertDialog";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ManageAccountsOutlinedIcon from "@mui/icons-material/ManageAccountsOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import CheckIcon from "@mui/icons-material/Check";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useAppTheme, THEME_PRESETS, ThemePreset } from "../theme";
import { useAuth } from "../auth/AuthContext";
import { CommandPalette } from "../features/palette/CommandPalette";
import { api } from "../api/client";

const DRAWER_WIDTH = 240;
const MINI_DRAWER_WIDTH = 68;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Items", path: "/items", icon: <Inventory2OutlinedIcon /> },
  { label: "Inbox", path: "/inbox", icon: <MoveToInboxOutlinedIcon /> },
  { label: "Reminders", path: "/reminders", icon: <NotificationsOutlinedIcon /> },
  { label: "Categories", path: "/categories", icon: <CategoryOutlinedIcon /> },
  { label: "Locations", path: "/locations", icon: <PlaceOutlinedIcon /> },
  { label: "Users", path: "/users", icon: <ManageAccountsOutlinedIcon />, adminOnly: true },
  { label: "Health", path: "/health", icon: <HealingOutlinedIcon /> },
  { label: "Moves", path: "/moves", icon: <LocalShippingOutlinedIcon /> },
  { label: "Contacts", path: "/contacts", icon: <PeopleOutlinedIcon /> },
  { label: "Activity", path: "/activity", icon: <HistoryOutlinedIcon /> },
  { label: "Trash", path: "/trash", icon: <DeleteOutlinedIcon /> },
  { label: "Scan Code", path: "/scan", icon: <QrCodeScannerOutlinedIcon /> },
  { label: "Settings", path: "/settings", icon: <SettingsOutlinedIcon /> },
];

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const { mode, setMode, preset, setPreset, resolvedMode, presetConfig } = useAppTheme();
  const [themeAnchorEl, setThemeAnchorEl] = useState<null | HTMLElement>(null);
  const { pinSet, logout, selectProfile, currentProfile: authProfile } = useAuth();

  // Desktop/Tablet sidebar state: expanded (text + icons) or collapsed (only icons)
  // On tablets, default to mini rail (68px) to maximize content width
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

  // Profile switcher state
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // PIN switch dialog state
  const [pinTargetProfile, setPinTargetProfile] = useState<any | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const currentProfile = authProfile;

  useEffect(() => {
    const fetchProfileAndReminders = async () => {
      try {
        const [remCount, profiles] = await Promise.all([
          api.getRemindersCount().catch(() => ({ total: 0 })),
          api.getProfiles().catch(() => []),
        ]);
        if (remCount) setRemindersCount(remCount.total || 0);
        if (profiles) setAllProfiles(profiles);
      } catch (err) {
        console.error(err);
      }
    };
    fetchProfileAndReminders();
  }, [location.pathname]);

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

  const handleThemeToggle = () => {
    if (mode === "system") {
      setMode(resolvedMode === "dark" ? "light" : "dark");
    } else if (mode === "light") {
      setMode("dark");
    } else {
      setMode("system");
    }
  };

  const handleProfileSelect = async (profile: any) => {
    setProfileAnchorEl(null);
    if (profile.id === currentProfile?.id) return;
    if (profile.has_pin) {
      setPinTargetProfile(profile);
      setPinInput("");
      setPinError(null);
    } else {
      try {
        await selectProfile(profile.id);
        window.location.reload();
      } catch (err: any) {
        console.error("Failed to select profile", err);
      }
    }
  };

  const handleConfirmPinSwitch = async () => {
    if (!pinTargetProfile) return;
    try {
      await selectProfile(pinTargetProfile.id, pinInput);
      setPinTargetProfile(null);
      window.location.reload();
    } catch (err: any) {
      setPinError(err.error?.message || "Incorrect PIN");
    }
  };

  const isUserAdminOrCoAdmin = currentProfile?.role === "admin" || currentProfile?.role === "co_admin";
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) {
      return isUserAdminOrCoAdmin;
    }
    return true;
  });

  const renderNavList = (isMini: boolean) => (
    <List sx={{ py: 1 }}>
      {visibleNavItems.map((item) => {
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
              {item.path === "/reminders" && remindersCount > 0 ? (
                <Badge badgeContent={remindersCount} color="error" max={99}>
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
        <Toolbar sx={{ justifyContent: "space-between", px: { xs: 1, sm: 2 }, minHeight: { xs: 56, sm: 64 } }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {/* Hamburger Button */}
            <Tooltip title={isMobile ? "Open menu" : desktopOpen ? "Collapse sidebar" : "Expand sidebar"}>
              <IconButton
                color="inherit"
                aria-label="toggle navigation menu"
                onClick={handleDrawerToggle}
                edge="start"
                size={isMobile ? "small" : "medium"}
                sx={{ mr: { xs: 0.5, sm: 1.5 } }}
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
                HomeInventory
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

            {/* Notification Dropdown Menu Box */}
            <Menu
              anchorEl={notifAnchorEl}
              open={Boolean(notifAnchorEl)}
              onClose={handleCloseNotifications}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              slotProps={{
                paper: {
                  sx: {
                    width: { xs: 320, sm: 380 },
                    maxWidth: "92vw",
                    maxHeight: 480,
                    borderRadius: 2,
                    boxShadow: 8,
                    overflow: "hidden",
                    p: 0,
                    mt: 1,
                  },
                },
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  bgcolor: "background.paper",
                  borderBottom: 1,
                  borderColor: "divider",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <NotificationsActiveOutlinedIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Notifications
                  </Typography>
                </Box>
                {remindersCount > 0 ? (
                  <Chip
                    label={`${remindersCount} New`}
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
                  />
                ) : (
                  <Chip
                    label="All Clear"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600 }}
                  />
                )}
              </Box>

              {/* Notifications List */}
              <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
                {loadingNotifications ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : topNotifications.length === 0 ? (
                  <Box sx={{ py: 4, px: 2, textAlign: "center" }}>
                    <CheckCircleOutlinedIcon sx={{ fontSize: 40, color: "success.main", mb: 1, opacity: 0.8 }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      All caught up!
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      No overdue or pending inventory reminders right now.
                    </Typography>
                  </Box>
                ) : (
                  <List disablePadding>
                    {topNotifications.map((n, i) => {
                      const isOverdue = n.status === "overdue";
                      return (
                        <ListItemButton
                          key={n.id || i}
                          divider={i < topNotifications.length - 1}
                          onClick={() => {
                            handleCloseNotifications();
                            if (n.item_id) {
                              navigate(`/items?selected=${n.item_id}`);
                            } else {
                              navigate("/reminders");
                            }
                          }}
                          sx={{
                            px: 2,
                            py: 1.25,
                            gap: 1.5,
                            alignItems: "flex-start",
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 28, mt: 0.5 }}>
                            {isOverdue ? (
                              <WarningAmberOutlinedIcon fontSize="small" color="error" />
                            ) : (
                              <ScheduleOutlinedIcon fontSize="small" color="warning" />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                  {n.item_name}
                                </Typography>
                                <Chip
                                  label={isOverdue ? "OVERDUE" : "SOON"}
                                  size="small"
                                  color={isOverdue ? "error" : "warning"}
                                  sx={{ height: 18, fontSize: "0.6rem", fontWeight: 800 }}
                                />
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 0.25 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  {n.source_type ? `${n.source_type.toUpperCase()}: ` : ""}
                                  {isOverdue ? `Expired on ${n.due_date}` : `Due on ${n.due_date}`}
                                </Typography>
                                {n.borrower_name && (
                                  <Typography variant="caption" color="info.main" sx={{ display: "block", fontWeight: 600 }}>
                                    Loaned to: {n.borrower_name}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                )}
              </Box>

              {/* Footer */}
              <Box
                sx={{
                  p: 1,
                  display: "flex",
                  justifyContent: "space-between",
                  bgcolor: "background.paper",
                  borderTop: 1,
                  borderColor: "divider",
                }}
              >
                <Button
                  size="small"
                  onClick={() => {
                    handleCloseNotifications();
                    navigate("/reminders");
                  }}
                  endIcon={<OpenInNewIcon fontSize="small" />}
                  sx={{ textTransform: "none", fontWeight: 600, width: "100%" }}
                >
                  Open Reminder Centre
                </Button>
              </Box>
            </Menu>

            {/* Theme & Palette Switcher */}
            <Tooltip title={`Theme: ${presetConfig.name} (${resolvedMode})`}>
              <IconButton onClick={(e) => setThemeAnchorEl(e.currentTarget)} color="inherit" size={isMobile ? "small" : "medium"}>
                <PaletteOutlinedIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            {/* Lock / Switch User Button - visible on sm+ to prevent toolbar crowding on mobile */}
            <Tooltip title="Lock Session / Switch User">
              <IconButton
                onClick={() => {
                  logout();
                  navigate("/lock");
                }}
                color="inherit"
                size={isMobile ? "small" : "medium"}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <LockOutlinedIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={themeAnchorEl}
              open={Boolean(themeAnchorEl)}
              onClose={() => setThemeAnchorEl(null)}
              transformOrigin={{ horizontal: "right", vertical: "top" }}
              anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
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
                    onClick={() => {
                      setPreset(k);
                      setThemeAnchorEl(null);
                    }}
                    sx={{ display: "flex", justifyContent: "space-between", gap: 2, minWidth: 230 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        {cfg.colors.map((c, i) => (
                          <Box key={i} sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c, border: "1px solid rgba(255,255,255,0.2)" }} />
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
                onClick={() => {
                  setMode("dark");
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
                onClick={() => {
                  setMode("light");
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
                onClick={() => {
                  setMode("system");
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

            {/* Profile Switcher Menu */}
            {currentProfile ? (
              <>
                <Tooltip title={`Signed in as ${currentProfile.name} (${currentProfile.role})`}>
                  <Box
                    onClick={(e) => setProfileAnchorEl(e.currentTarget)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      cursor: "pointer",
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 30,
                        height: 30,
                        bgcolor: currentProfile.color || "primary.main",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                      }}
                    >
                      {currentProfile.avatar_emoji || currentProfile.name.charAt(0).toUpperCase()}
                    </Avatar>
                    {!isMobile && (
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                          {currentProfile.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize", fontSize: "0.65rem" }}>
                          {currentProfile.role}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Tooltip>

                <Menu
                  anchorEl={profileAnchorEl}
                  open={Boolean(profileAnchorEl)}
                  onClose={() => setProfileAnchorEl(null)}
                >
                  <Box sx={{ px: 2, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Household Profiles
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Switch active household member
                    </Typography>
                  </Box>
                  <Divider />
                  {allProfiles.map((p) => (
                    <MenuItem
                      key={p.id}
                      selected={p.id === currentProfile.id}
                      onClick={() => handleProfileSelect(p)}
                      sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Avatar
                          sx={{
                            width: 24,
                            height: 24,
                            bgcolor: p.color || "primary.main",
                            fontSize: "0.75rem",
                          }}
                        >
                          {p.avatar_emoji || p.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography variant="body2">{p.name}</Typography>
                      </Box>
                      <Chip
                        label={p.role}
                        size="small"
                        sx={{ height: 20, fontSize: "0.65rem", textTransform: "capitalize" }}
                      />
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem onClick={() => { setProfileAnchorEl(null); navigate("/account"); }}>
                    <AccountCircleOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> My Account & Profile
                  </MenuItem>
                  {isUserAdminOrCoAdmin && (
                    <MenuItem onClick={() => { setProfileAnchorEl(null); navigate("/users"); }}>
                      <ManageAccountsOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> Manage Users & Roles
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => { setProfileAnchorEl(null); navigate("/settings"); }}>
                    <SettingsOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> Settings & Preferences
                  </MenuItem>
                  <MenuItem onClick={() => { setProfileAnchorEl(null); navigate("/lock"); }}>
                    <SwitchAccountOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> Switch User (Who's Using)
                  </MenuItem>
                  <Divider />
                  <MenuItem onClick={() => { setProfileAnchorEl(null); logout(); navigate("/lock"); }}>
                    <LockOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> Lock Session
                  </MenuItem>
                  <MenuItem onClick={() => { setProfileAnchorEl(null); logout(); navigate("/login"); }}>
                    <LogoutIcon sx={{ mr: 1, fontSize: 18 }} /> Sign Out
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={() => setPickerOpen(true)}
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
          <Box sx={{ overflowY: "auto", overflowX: "hidden", py: 1 }}>
            {renderNavList(!desktopOpen)}
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
              width: 280,
              maxWidth: "80vw",
              boxSizing: "border-box",
              bgcolor: "background.paper",
            },
          }}
        >
          <Toolbar sx={{ display: "flex", alignItems: "center", px: 2, gap: 1 }}>
            <Inventory2OutlinedIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              HomeInventory
            </Typography>
          </Toolbar>
          <Divider />
          <Box sx={{ overflowY: "auto", py: 1 }}>
            {renderNavList(false)}
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
              duration: t.transitions.duration.enteringScreen,
            }),
          mt: { xs: 7, sm: 8 },
          mb: { xs: 8, sm: 0 },
          overflowX: "hidden",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 1400, mx: "auto" }}>
          <Outlet />
        </Box>
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
                "&.Mui-selected": {
                  color: "primary.main",
                  fontWeight: 700,
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

      {/* PIN Switch Dialog */}
      <Dialog open={Boolean(pinTargetProfile)} onClose={() => setPinTargetProfile(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Enter Profile PIN</DialogTitle>
        <DialogContent sx={{ pt: "24px !important" }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Switching to <strong>{pinTargetProfile?.name}</strong> requires a 4-digit PIN.
          </Typography>
          <AlertDialog
            open={Boolean(pinError)}
            onClose={() => setPinError(null)}
            title="PIN Error"
            message={pinError}
            severity="error"
          />
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="4-Digit PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 8 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPinTargetProfile(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmPinSwitch}>
            Unlock & Switch
          </Button>
        </DialogActions>
      </Dialog>

      {/* Who's Using? Profile Picker Dialog */}
      <Dialog
        open={pickerOpen && !currentProfile}
        onClose={() => setPickerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: "center", pt: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Who's using HomeInventory?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Select your profile to continue.
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Grid container spacing={2}>
            {allProfiles.map((p) => (
              <Grid key={p.id} size={{ xs: 12, sm: 6 }}>
                <Paper
                  variant="outlined"
                  onClick={() => {
                    setPickerOpen(false);
                    handleProfileSelect(p);
                  }}
                  sx={{
                    p: 2.5,
                    cursor: "pointer",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    transition: "all 0.15s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      bgcolor: "action.hover",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 48,
                      height: 48,
                      bgcolor: p.color || "primary.main",
                      fontSize: "1.25rem",
                      fontWeight: 700,
                    }}
                  >
                    {p.avatar_emoji || p.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                        {p.name}
                      </Typography>
                      {p.has_pin && <LockOutlinedIcon sx={{ fontSize: 16, opacity: 0.6 }} />}
                    </Box>
                    <Chip
                      label={p.role}
                      size="small"
                      sx={{ height: 20, fontSize: "0.7rem", textTransform: "capitalize", mt: 0.5 }}
                    />
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
      </Dialog>
    </Box>
  );
};