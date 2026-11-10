import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline, alpha } from "@mui/material";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

export type ThemePreset = "theme1" | "theme2";
export type ThemeMode = "system" | "light" | "dark";

export interface ThemePresetConfig {
  id: ThemePreset;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}

export const THEME_PRESETS: Record<ThemePreset, ThemePresetConfig> = {
  theme1: {
    id: "theme1",
    name: "Theme One",
    description: "Obsidian Slate & Aqua Mist",
    colors: ["#020608", "#1C252B", "#486B85", "#93B4BC", "#CAD2CB"],
  },
  theme2: {
    id: "theme2",
    name: "Theme 2",
    description: "Abyss Navy & Vibrant Cyan",
    colors: ["#001C2E", "#02435C", "#57B5C3", "#E0E6E5", "#98A7AE"],
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
  preset: "theme1",
  setPreset: () => {},
  resolvedMode: "dark",
  presetConfig: THEME_PRESETS.theme1,
});

export const useAppTheme = () => useContext(ThemeContext);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preset, setPresetState] = useState<ThemePreset>(() => {
    const saved = localStorage.getItem("hi_theme_preset") as ThemePreset;
    return saved === "theme2" ? "theme2" : "theme1";
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

  const presetConfig = THEME_PRESETS[preset] || THEME_PRESETS.theme1;

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

    if (preset === "theme1") {
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
