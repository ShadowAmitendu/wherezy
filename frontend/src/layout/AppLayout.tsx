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
  Alert,
  Divider,
  Paper,
  Grid,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import QrCodeScannerOutlinedIcon from "@mui/icons-material/QrCodeScannerOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
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

const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Items", path: "/items", icon: <Inventory2OutlinedIcon /> },
  { label: "Inbox", path: "/inbox", icon: <MoveToInboxOutlinedIcon /> },
  { label: "Reminders", path: "/reminders", icon: <NotificationsOutlinedIcon /> },
  { label: "Categories", path: "/categories", icon: <CategoryOutlinedIcon /> },
  { label: "Locations", path: "/locations", icon: <PlaceOutlinedIcon /> },
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
  const { mode, setMode, preset, setPreset, resolvedMode, presetConfig } = useAppTheme();
  const [themeAnchorEl, setThemeAnchorEl] = useState<null | HTMLElement>(null);
  const { pinSet, logout } = useAuth();

  // Desktop sidebar state: expanded (text + icons) or collapsed (only icons)
  const [desktopOpen, setDesktopOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("hi_sidebar_open");
    return saved !== null ? saved === "true" : true;
  });

  // Mobile temporary drawer state
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Command Palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Reminders badge state
  const [remindersCount, setRemindersCount] = useState<number>(0);

  // Profile switcher state
  const [currentProfile, setCurrentProfile] = useState<any | null>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // PIN switch dialog state
  const [pinTargetProfile, setPinTargetProfile] = useState<any | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfileAndReminders = async () => {
      try {
        const [me, remCount, profiles] = await Promise.all([
          api.getMyProfile().catch(() => null),
          api.getRemindersCount().catch(() => ({ total: 0 })),
          api.getProfiles().catch(() => []),
        ]);
        if (me) {
          setCurrentProfile(me);
        } else if (profiles && profiles.length > 0) {
          // If no active profile session, check if there is an admin profile without PIN to auto-connect
          const singleNoPin = profiles.length === 1 && !profiles[0].has_pin;
          if (singleNoPin) {
            try {
              const selected = await api.selectProfile(profiles[0].id);
              setCurrentProfile(selected);
              window.location.reload();
              return;
            } catch {
              setPickerOpen(true);
            }
          } else {
            setPickerOpen(true);
          }
        }
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
        const updated = await api.selectProfile(profile.id);
        setCurrentProfile(updated);
        window.location.reload();
      } catch (err: any) {
        console.error("Failed to select profile", err);
      }
    }
  };

  const handleConfirmPinSwitch = async () => {
    if (!pinTargetProfile) return;
    try {
      const updated = await api.selectProfile(pinTargetProfile.id, pinInput);
      setCurrentProfile(updated);
      setPinTargetProfile(null);
      window.location.reload();
    } catch (err: any) {
      setPinError(err.error?.message || "Incorrect PIN");
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
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {/* Hamburger Button */}
            <Tooltip title={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}>
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

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* Quick Command Palette Launcher */}
            <Tooltip title="Quick Search (Ctrl+K)">
              <IconButton onClick={() => setPaletteOpen(true)} color="inherit">
                <SearchIcon />
              </IconButton>
            </Tooltip>

            {/* Reminder Bell */}
            <Tooltip title="Reminders">
              <IconButton onClick={() => navigate("/reminders")} color="inherit">
                <Badge badgeContent={remindersCount} color="error" max={99}>
                  <NotificationsOutlinedIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Theme & Palette Switcher */}
            <Tooltip title={`Theme: ${presetConfig.name} (${resolvedMode})`}>
              <IconButton onClick={(e) => setThemeAnchorEl(e.currentTarget)} color="inherit">
                <PaletteOutlinedIcon />
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
                  <MenuItem onClick={() => { setProfileAnchorEl(null); navigate("/settings"); }}>
                    <SettingsOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> Settings & Preferences
                  </MenuItem>
                  {pinSet && (
                    <MenuItem onClick={() => { setProfileAnchorEl(null); logout(); }}>
                      <LockOutlinedIcon sx={{ mr: 1, fontSize: 18 }} /> Lock Session
                    </MenuItem>
                  )}
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

      {/* Global Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* PIN Switch Dialog */}
      <Dialog open={Boolean(pinTargetProfile)} onClose={() => setPinTargetProfile(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Enter Profile PIN</DialogTitle>
        <DialogContent sx={{ pt: "24px !important" }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Switching to <strong>{pinTargetProfile?.name}</strong> requires a 4-digit PIN.
          </Typography>
          {pinError && (
            <Alert severity="error" variant="filled" onClose={() => setPinError(null)} sx={{ mb: 2 }}>
              {pinError}
            </Alert>
          )}
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