import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline, alpha } from "@mui/material";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

export type ThemePreset =
  | "material"
  | "theme1"
  | "theme2"
  | "dracula"
  | "emerald"
  | "nord"
  | "sunset";
export type ThemeMode = "system" | "light" | "dark";

export interface ThemePresetConfig {
  id: ThemePreset;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}

export const THEME_PRESETS: Record<ThemePreset, ThemePresetConfig> = {
  material: {
    id: "material",
    name: "Material (Default)",
    description: "Classic Material Blue & Surfaces",
    colors: ["#121212", "#1E1E1E", "#1976D2", "#42A5F5", "#FFFFFF"],
  },
  theme1: {
    id: "theme1",
    name: "Theme One (Slate)",
    description: "Obsidian Slate & Aqua Mist",
    colors: ["#020608", "#1C252B", "#486B85", "#93B4BC", "#CAD2CB"],
  },
  theme2: {
    id: "theme2",
    name: "Theme Two (Cyan)",
    description: "Abyss Navy & Vibrant Cyan",
    colors: ["#001C2E", "#02435C", "#57B5C3", "#E0E6E5", "#98A7AE"],
  },
  dracula: {
    id: "dracula",
    name: "Dracula Purple",
    description: "Vampire Midnight & Electric Violet",
    colors: ["#181528", "#221E38", "#BD93F9", "#FF79C6", "#F8F8F2"],
  },
  emerald: {
    id: "emerald",
    name: "Emerald Forest",
    description: "Deep Pine & Radiant Emerald",
    colors: ["#061A12", "#0E2B1F", "#10B981", "#6EE7B7", "#ECFDF5"],
  },
  nord: {
    id: "nord",
    name: "Nordic Frost",
    description: "Polar Night & Frost Blue",
    colors: ["#1A1E24", "#242933", "#88C0D0", "#81A1C1", "#ECEFF4"],
  },
  sunset: {
    id: "sunset",
    name: "Sunset Amber",
    description: "Charcoal & Radiant Amber",
    colors: ["#18120C", "#261D15", "#F59E0B", "#FBBF24", "#FEF3C7"],
  },
};

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
  resolvedMode: "light" | "dark";
  presetConfig: ThemePresetConfig;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  setMode: () => {},
  preset: "material",
  setPreset: () => {},
  resolvedMode: "dark",
  presetConfig: THEME_PRESETS.material,
});

export const useAppTheme = () => useContext(ThemeContext);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preset, setPresetState] = useState<ThemePreset>(() => {
    const saved = localStorage.getItem("hi_theme_preset") as ThemePreset;
    return saved && THEME_PRESETS[saved] ? saved : "material";
  });

  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem("hi_theme") as ThemeMode) || "dark";
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem("hi_theme", newMode);
  };

  const setPreset = (newPreset: ThemePreset) => {
    setPresetState(newPreset);
    localStorage.setItem("hi_theme_preset", newPreset);
  };

  const resolvedMode: "light" | "dark" =
    mode === "system" ? (systemPrefersDark ? "dark" : "light") : mode;

  const presetConfig = THEME_PRESETS[preset] || THEME_PRESETS.material;

  const theme = useMemo(() => {
    const isDark = resolvedMode === "dark";
    const colors = presetConfig.colors;

    // Mapping colors by preset
    let defaultBg: string;
    let paperBg: string;
    let primaryMain: string;
    let primaryLight: string;
    let primaryDark: string;
    let primaryContrast: string;
    let secondaryMain: string;
    let secondaryLight: string;
    let secondaryDark: string;
    let textPrimary: string;
    let textSecondary: string;
    let textDisabled: string;
    let dividerColor: string;

    if (preset === "material") {
      // Classic Material Design
      if (isDark) {
        defaultBg = "#121212";
        paperBg = "#1E1E1E";
        primaryMain = "#90CAF9";
        primaryLight = "#E3F2FD";
        primaryDark = "#42A5F5";
        primaryContrast = "#000000";
        secondaryMain = "#CE93D8";
        secondaryLight = "#F3E5F5";
        secondaryDark = "#AB47BC";
        textPrimary = "#FFFFFF";
        textSecondary = "rgba(255, 255, 255, 0.7)";
        textDisabled = "rgba(255, 255, 255, 0.38)";
        dividerColor = "rgba(255, 255, 255, 0.12)";
      } else {
        defaultBg = "#F5F5F5";
        paperBg = "#FFFFFF";
        primaryMain = "#1976D2";
        primaryLight = "#42A5F5";
        primaryDark = "#1565C0";
        primaryContrast = "#FFFFFF";
        secondaryMain = "#9C27B0";
        secondaryLight = "#BA68C8";
        secondaryDark = "#7B1FA2";
        textPrimary = "rgba(0, 0, 0, 0.87)";
        textSecondary = "rgba(0, 0, 0, 0.6)";
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = "rgba(0, 0, 0, 0.12)";
      }
    } else if (preset === "dracula") {
      // Dracula Purple
      if (isDark) {
        defaultBg = "#181528";
        paperBg = "#221E38";
        primaryMain = "#BD93F9";
        primaryLight = "#FF79C6";
        primaryDark = "#8BE9FD";
        primaryContrast = "#181528";
        secondaryMain = "#FF79C6";
        secondaryLight = "#50FA7B";
        secondaryDark = "#FF5555";
        textPrimary = "#F8F8F2";
        textSecondary = "#8BE9FD";
        textDisabled = alpha("#F8F8F2", 0.45);
        dividerColor = alpha("#BD93F9", 0.25);
      } else {
        defaultBg = "#F6F3FC";
        paperBg = "#FFFFFF";
        primaryMain = "#7B2CBF";
        primaryLight = "#9D4EDD";
        primaryDark = "#5A189A";
        primaryContrast = "#FFFFFF";
        secondaryMain = "#C77DFF";
        secondaryLight = "#E0AAFF";
        secondaryDark = "#3C096C";
        textPrimary = "#181528";
        textSecondary = "#4A3B69";
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = alpha("#7B2CBF", 0.15);
      }
    } else if (preset === "emerald") {
      // Emerald Forest
      if (isDark) {
        defaultBg = "#061A12";
        paperBg = "#0E2B1F";
        primaryMain = "#10B981";
        primaryLight = "#6EE7B7";
        primaryDark = "#047857";
        primaryContrast = "#061A12";
        secondaryMain = "#34D399";
        secondaryLight = "#A7F3D0";
        secondaryDark = "#059669";
        textPrimary = "#ECFDF5";
        textSecondary = "#6EE7B7";
        textDisabled = alpha("#ECFDF5", 0.45);
        dividerColor = alpha("#10B981", 0.25);
      } else {
        defaultBg = "#F0FDF4";
        paperBg = "#FFFFFF";
        primaryMain = "#059669";
        primaryLight = "#10B981";
        primaryDark = "#047857";
        primaryContrast = "#FFFFFF";
        secondaryMain = "#10B981";
        secondaryLight = "#34D399";
        secondaryDark = "#065F46";
        textPrimary = "#061A12";
        textSecondary = "#065F46";
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = alpha("#059669", 0.15);
      }
    } else if (preset === "nord") {
      // Nordic Frost
      if (isDark) {
        defaultBg = "#1A1E24";
        paperBg = "#242933";
        primaryMain = "#88C0D0";
        primaryLight = "#8FBCBB";
        primaryDark = "#81A1C1";
        primaryContrast = "#1A1E24";
        secondaryMain = "#5E81AC";
        secondaryLight = "#81A1C1";
        secondaryDark = "#4C566A";
        textPrimary = "#ECEFF4";
        textSecondary = "#D8DEE9";
        textDisabled = alpha("#ECEFF4", 0.45);
        dividerColor = alpha("#88C0D0", 0.22);
      } else {
        defaultBg = "#F4F6F9";
        paperBg = "#FFFFFF";
        primaryMain = "#5E81AC";
        primaryLight = "#81A1C1";
        primaryDark = "#4C566A";
        primaryContrast = "#FFFFFF";
        secondaryMain = "#88C0D0";
        secondaryLight = "#8FBCBB";
        secondaryDark = "#3B4252";
        textPrimary = "#2E3440";
        textSecondary = "#4C566A";
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = alpha("#5E81AC", 0.15);
      }
    } else if (preset === "sunset") {
      // Sunset Amber
      if (isDark) {
        defaultBg = "#18120C";
        paperBg = "#261D15";
        primaryMain = "#F59E0B";
        primaryLight = "#FBBF24";
        primaryDark = "#D97706";
        primaryContrast = "#18120C";
        secondaryMain = "#FB923C";
        secondaryLight = "#FDE047";
        secondaryDark = "#B45309";
        textPrimary = "#FEF3C7";
        textSecondary = "#FBBF24";
        textDisabled = alpha("#FEF3C7", 0.45);
        dividerColor = alpha("#F59E0B", 0.25);
      } else {
        defaultBg = "#FFFAEB";
        paperBg = "#FFFFFF";
        primaryMain = "#D97706";
        primaryLight = "#F59E0B";
        primaryDark = "#B45309";
        primaryContrast = "#FFFFFF";
        secondaryMain = "#EA580C";
        secondaryLight = "#F97316";
        secondaryDark = "#C2410C";
        textPrimary = "#18120C";
        textSecondary = "#78350F";
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = alpha("#D97706", 0.15);
      }
    } else if (preset === "theme1") {
      // Theme One: #020608, #1C252B, #486B85, #93B4BC, #CAD2CB
      if (isDark) {
        defaultBg = colors[0]; // #020608 Deep Obsidian
        paperBg = colors[1];   // #1C252B Slate Charcoal
        primaryMain = colors[3]; // #93B4BC Aqua Mist
        primaryLight = colors[4]; // #CAD2CB Soft Mist
        primaryDark = colors[2];  // #486B85 Steel Blue
        primaryContrast = colors[0]; // #020608
        secondaryMain = colors[2];   // #486B85
        secondaryLight = colors[3];  // #93B4BC
        secondaryDark = colors[1];   // #1C252B
        textPrimary = colors[4];     // #CAD2CB
        textSecondary = colors[3];   // #93B4BC
        textDisabled = alpha(colors[4], 0.45);
        dividerColor = alpha(colors[2], 0.35);
      } else {
        defaultBg = "#f2f5f4";
        paperBg = "#ffffff";
        primaryMain = colors[2]; // #486B85 Steel Blue
        primaryLight = colors[3]; // #93B4BC
        primaryDark = colors[1];  // #1C252B
        primaryContrast = "#ffffff";
        secondaryMain = colors[1]; // #1C252B
        secondaryLight = colors[2];
        secondaryDark = colors[0];
        textPrimary = colors[0];   // #020608
        textSecondary = colors[1]; // #1C252B
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = alpha(colors[1], 0.12);
      }
    } else {
      // Theme Two: #001C2E, #02435C, #57B5C3, #E0E6E5, #98A7AE
      if (isDark) {
        defaultBg = colors[0]; // #001C2E Midnight Abyss
        paperBg = colors[1];   // #02435C Ocean Teal
        primaryMain = colors[2]; // #57B5C3 Vibrant Cyan
        primaryLight = colors[3]; // #E0E6E5 Alabaster Ice
        primaryDark = colors[1];  // #02435C
        primaryContrast = colors[0]; // #001C2E
        secondaryMain = colors[4];   // #98A7AE Slate Fog
        secondaryLight = colors[3];  // #E0E6E5
        secondaryDark = colors[1];   // #02435C
        textPrimary = colors[3];     // #E0E6E5
        textSecondary = colors[4];   // #98A7AE
        textDisabled = alpha(colors[3], 0.45);
        dividerColor = alpha(colors[2], 0.22);
      } else {
        defaultBg = "#f0f5f6";
        paperBg = "#ffffff";
        primaryMain = colors[1]; // #02435C Deep Ocean
        primaryLight = colors[2]; // #57B5C3
        primaryDark = colors[0];  // #001C2E
        primaryContrast = "#ffffff";
        secondaryMain = colors[2]; // #57B5C3
        secondaryLight = colors[4];
        secondaryDark = colors[1];
        textPrimary = colors[0];   // #001C2E
        textSecondary = colors[1]; // #02435C
        textDisabled = "rgba(0, 0, 0, 0.38)";
        dividerColor = alpha(colors[1], 0.12);
      }
    }

    return createTheme({
      palette: {
        mode: resolvedMode,
        primary: {
          main: primaryMain,
          light: primaryLight,
          dark: primaryDark,
          contrastText: primaryContrast,
        },
        secondary: {
          main: secondaryMain,
          light: secondaryLight,
          dark: secondaryDark,
          contrastText: isDark ? primaryContrast : "#ffffff",
        },
        background: {
          default: defaultBg,
          paper: paperBg,
        },
        text: {
          primary: textPrimary,
          secondary: textSecondary,
          disabled: textDisabled,
        },
        error: {
          main: isDark ? "#ff6b81" : "#d32f2f",
        },
        warning: {
          main: isDark ? "#ffa726" : "#ed6c02",
        },
        info: {
          main: isDark ? primaryMain : "#0288d1",
        },
        success: {
          main: isDark ? "#66bb6a" : "#2e7d32",
        },
        divider: dividerColor,
        action: {
          hover: alpha(primaryMain, 0.08),
          selected: alpha(primaryMain, 0.18),
          focus: alpha(primaryMain, 0.22),
        },
      },
      typography: {
        fontFamily: "'Roboto', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        h4: {
          fontWeight: 400,
          letterSpacing: "0.00735em",
        },
        h5: {
          fontWeight: 400,
          letterSpacing: "0em",
        },
        h6: {
          fontWeight: 500,
          letterSpacing: "0.0075em",
        },
        subtitle1: {
          fontWeight: 400,
          letterSpacing: "0.00938em",
        },
        subtitle2: {
          fontWeight: 500,
          letterSpacing: "0.00714em",
        },
        body1: {
          fontWeight: 400,
          letterSpacing: "0.03125em",
        },
        body2: {
          fontWeight: 400,
          letterSpacing: "0.01786em",
        },
        button: {
          fontWeight: 500,
          letterSpacing: "0.02857em",
          textTransform: "uppercase",
        },
      },
      shape: {
        borderRadius: 4, // Authentic Material Design 2 4px border radius
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: {
              backgroundColor: defaultBg,
              color: textPrimary,
              scrollbarColor: isDark ? `${alpha(primaryMain, 0.3)} ${defaultBg}` : undefined,
              "&::-webkit-scrollbar": {
                width: 8,
                height: 8,
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: defaultBg,
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: alpha(primaryMain, 0.3),
                borderRadius: 4,
                "&:hover": {
                  backgroundColor: alpha(primaryMain, 0.5),
                },
              },
            },
          },
        },
        MuiAppBar: {
          defaultProps: {
            elevation: 0,
          },
          styleOverrides: {
            root: {
              backgroundColor: isDark ? paperBg : "#ffffff",
              color: textPrimary,
              borderBottom: `1px solid ${dividerColor}`,
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: isDark ? paperBg : "#ffffff",
              color: textPrimary,
              borderRight: `1px solid ${dividerColor}`,
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              textTransform: "uppercase",
              fontWeight: 500,
              letterSpacing: "0.02857em",
              padding: "6px 16px",
            },
            contained: {
              boxShadow: isDark
                ? "0px 3px 1px -2px rgba(0,0,0,0.5), 0px 2px 2px 0px rgba(0,0,0,0.35), 0px 1px 5px 0px rgba(0,0,0,0.3)"
                : "0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)",
              "&:hover": {
                boxShadow: isDark
                  ? "0px 2px 4px -1px rgba(0,0,0,0.5), 0px 4px 5px 0px rgba(0,0,0,0.35), 0px 1px 10px 0px rgba(0,0,0,0.3)"
                  : "0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)",
              },
            },
          },
        },
        MuiCard: {
          defaultProps: {
            elevation: 1,
          },
          styleOverrides: {
            root: {
              borderRadius: 4,
              backgroundColor: isDark ? paperBg : "#ffffff",
              boxShadow: isDark
                ? "0px 2px 1px -1px rgba(0,0,0,0.5), 0px 1px 1px 0px rgba(0,0,0,0.35), 0px 1px 3px 0px rgba(0,0,0,0.3)"
                : "0px 2px 1px -1px rgba(0,0,0,0.12), 0px 1px 1px 0px rgba(0,0,0,0.08), 0px 1px 3px 0px rgba(0,0,0,0.06)",
              transition: "box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 150ms ease",
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundColor: isDark ? paperBg : "#ffffff",
            },
            rounded: {
              borderRadius: 4,
            },
          },
        },
        MuiDialog: {
          defaultProps: {
            fullWidth: true,
          },
          styleOverrides: {
            paper: {
              borderRadius: 4,
              backgroundColor: isDark ? paperBg : "#ffffff",
              boxShadow: isDark
                ? "0px 11px 15px -7px rgba(0,0,0,0.6), 0px 24px 38px 3px rgba(0,0,0,0.45), 0px 9px 46px 8px rgba(0,0,0,0.4)"
                : "0px 11px 15px -7px rgba(0,0,0,0.2), 0px 24px 38px 3px rgba(0,0,0,0.14), 0px 9px 46px 8px rgba(0,0,0,0.12)",
            },
          },
        },
        MuiDialogTitle: {
          styleOverrides: {
            root: {
              fontSize: "1.25rem",
              fontWeight: 500,
              padding: "24px 24px 16px 24px",
            },
          },
        },
        MuiDialogContent: {
          styleOverrides: {
            root: {
              padding: "24px 24px 24px 24px",
              "&.MuiDialogContent-root": {
                paddingTop: "24px !important",
              },
              ".MuiDialogTitle-root + &": {
                paddingTop: "24px !important",
              },
            },
          },
        },
        MuiDialogActions: {
          styleOverrides: {
            root: {
              padding: "8px 16px 16px 16px",
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              "&.Mui-selected": {
                backgroundColor: `${alpha(primaryMain, isDark ? 0.16 : 0.12)} !important`,
                color: `${primaryMain} !important`,
                "& .MuiListItemIcon-root": {
                  color: `${primaryMain} !important`,
                },
                "& .MuiTypography-root": {
                  color: `${primaryMain} !important`,
                },
                "&:hover": {
                  backgroundColor: `${alpha(primaryMain, isDark ? 0.24 : 0.18)} !important`,
                },
              },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              borderRadius: 16,
              fontWeight: 500,
            },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              backgroundColor: isDark ? alpha(paperBg, 0.7) : "#ffffff",
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: primaryMain,
              },
            },
          },
        },
        MuiAlert: {
          defaultProps: {
            variant: "filled",
          },
          styleOverrides: {
            root: {
              borderRadius: 4,
              boxShadow: "0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)",
              alignItems: "center",
              fontWeight: 500,
              "&.MuiAlert-filledSuccess": {
                backgroundColor: isDark ? "#2e7d32" : "#2e7d32",
                color: "#ffffff",
              },
              "&.MuiAlert-filledError": {
                backgroundColor: isDark ? "#d32f2f" : "#d32f2f",
                color: "#ffffff",
              },
              "&.MuiAlert-filledWarning": {
                backgroundColor: isDark ? "#ed6c02" : "#ed6c02",
                color: "#ffffff",
              },
              "&.MuiAlert-filledInfo": {
                backgroundColor: isDark ? "#0288d1" : "#0288d1",
                color: "#ffffff",
              },
            },
            action: {
              paddingTop: 0,
              marginRight: 0,
              alignItems: "center",
            },
          },
        },
        MuiSnackbar: {
          defaultProps: {
            anchorOrigin: { vertical: "bottom", horizontal: "center" },
          },
          styleOverrides: {
            root: {
              zIndex: 2000,
            },
          },
        },
      },
    });
  }, [resolvedMode, preset, presetConfig]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, preset, setPreset, resolvedMode, presetConfig }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
