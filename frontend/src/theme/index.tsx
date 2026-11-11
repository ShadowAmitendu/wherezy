import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline, alpha } from "@mui/material";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";

export const HEADING_FONT_FAMILY = "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const BODY_FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const MONO_FONT_FAMILY = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export type ThemePreset =
  | "material"
  | "dracula"
  | "tokyo_night"
  | "catppuccin"
  | "nord"
  | "emerald"
  | "solarized"
  | "rose_pine"
  | "sunset"
  | "gruvbox";

export type ThemeMode = "system" | "light" | "dark";

export interface ThemePresetConfig {
  id: ThemePreset;
  name: string;
  description: string;
  colors: [string, string, string, string, string];
}

interface ModePalette {
  defaultBg: string;
  paperBg: string;
  primaryMain: string;
  primaryLight: string;
  primaryDark: string;
  primaryContrast: string;
  secondaryMain: string;
  secondaryLight: string;
  secondaryDark: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  dividerColor: string;
}

export const THEME_PRESETS: Record<ThemePreset, ThemePresetConfig> = {
  material: {
    id: "material",
    name: "Material (Default)",
    description: "Classic Material Blue & Surfaces",
    colors: ["#121212", "#1E1E1E", "#1976D2", "#42A5F5", "#FFFFFF"],
  },
  dracula: {
    id: "dracula",
    name: "Dracula Purple",
    description: "Midnight Violet & Neon Pink",
    colors: ["#181528", "#221E38", "#BD93F9", "#FF79C6", "#F8F8F2"],
  },
  tokyo_night: {
    id: "tokyo_night",
    name: "Tokyo Night",
    description: "Stormy Indigo & Electric Azure",
    colors: ["#16161E", "#1F2335", "#7AA2F7", "#7DCFFF", "#C0CAF5"],
  },
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin",
    description: "Soothing Mocha & Lavender Pastel",
    colors: ["#181825", "#1E1E2E", "#CBA6F7", "#89B4FA", "#CDD6F4"],
  },
  nord: {
    id: "nord",
    name: "Nordic Frost",
    description: "Polar Night & Arctic Frost Blue",
    colors: ["#1A1E24", "#242933", "#88C0D0", "#81A1C1", "#ECEFF4"],
  },
  emerald: {
    id: "emerald",
    name: "Emerald Forest",
    description: "Deep Pine & Radiant Emerald",
    colors: ["#061A12", "#0E2B1F", "#10B981", "#6EE7B7", "#ECFDF5"],
  },
  solarized: {
    id: "solarized",
    name: "Solarized",
    description: "Balanced Ocean Teal & Warm Sand",
    colors: ["#002B36", "#073642", "#268BD2", "#2AA198", "#EEE8D5"],
  },
  rose_pine: {
    id: "rose_pine",
    name: "Rosé Pine",
    description: "Velvet Plum, Rose Quartz & Dawn",
    colors: ["#191724", "#221F33", "#EBBCBA", "#C4A7E7", "#E0DEF4"],
  },
  sunset: {
    id: "sunset",
    name: "Sunset Amber",
    description: "Warm Charcoal & Radiant Amber",
    colors: ["#18120C", "#261D15", "#F59E0B", "#FBBF24", "#FEF3C7"],
  },
  gruvbox: {
    id: "gruvbox",
    name: "Gruvbox Retro",
    description: "Earthy Charcoal, Terracotta & Ochre",
    colors: ["#1D2021", "#282828", "#FE8019", "#FABD2F", "#EBDBB2"],
  },
};

const THEME_PALETTES: Record<ThemePreset, { dark: ModePalette; light: ModePalette }> = {
  material: {
    dark: {
      defaultBg: "#121212",
      paperBg: "#1E1E1E",
      primaryMain: "#90CAF9",
      primaryLight: "#E3F2FD",
      primaryDark: "#42A5F5",
      primaryContrast: "#000000",
      secondaryMain: "#CE93D8",
      secondaryLight: "#F3E5F5",
      secondaryDark: "#AB47BC",
      textPrimary: "#FFFFFF",
      textSecondary: "rgba(255, 255, 255, 0.7)",
      textDisabled: "rgba(255, 255, 255, 0.38)",
      dividerColor: "rgba(255, 255, 255, 0.12)",
    },
    light: {
      defaultBg: "#F5F5F5",
      paperBg: "#FFFFFF",
      primaryMain: "#1976D2",
      primaryLight: "#42A5F5",
      primaryDark: "#1565C0",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#9C27B0",
      secondaryLight: "#BA68C8",
      secondaryDark: "#7B1FA2",
      textPrimary: "rgba(0, 0, 0, 0.87)",
      textSecondary: "rgba(0, 0, 0, 0.6)",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: "rgba(0, 0, 0, 0.12)",
    },
  },
  dracula: {
    dark: {
      defaultBg: "#181528",
      paperBg: "#221E38",
      primaryMain: "#BD93F9",
      primaryLight: "#D6B8FC",
      primaryDark: "#9A6AF5",
      primaryContrast: "#181528",
      secondaryMain: "#FF79C6",
      secondaryLight: "#FF9AD5",
      secondaryDark: "#E052A6",
      textPrimary: "#F8F8F2",
      textSecondary: "#BEB2E0",
      textDisabled: alpha("#F8F8F2", 0.45),
      dividerColor: alpha("#BD93F9", 0.25),
    },
    light: {
      defaultBg: "#F6F3FC",
      paperBg: "#FFFFFF",
      primaryMain: "#7B2CBF",
      primaryLight: "#9D4EDD",
      primaryDark: "#5A189A",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#D63384",
      secondaryLight: "#E668A6",
      secondaryDark: "#A61E61",
      textPrimary: "#181528",
      textSecondary: "#4A3B69",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#7B2CBF", 0.15),
    },
  },
  tokyo_night: {
    dark: {
      defaultBg: "#16161E",
      paperBg: "#1F2335",
      primaryMain: "#7AA2F7",
      primaryLight: "#7DCFFF",
      primaryDark: "#3D59A1",
      primaryContrast: "#15161E",
      secondaryMain: "#BB9AF7",
      secondaryLight: "#C0CAF5",
      secondaryDark: "#9D7CD8",
      textPrimary: "#C0CAF5",
      textSecondary: "#9AA5CE",
      textDisabled: alpha("#C0CAF5", 0.45),
      dividerColor: alpha("#7AA2F7", 0.22),
    },
    light: {
      defaultBg: "#EEF0F7",
      paperBg: "#FFFFFF",
      primaryMain: "#2E7DE9",
      primaryLight: "#5A9CF8",
      primaryDark: "#1E5BB8",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#7847BD",
      secondaryLight: "#9854CB",
      secondaryDark: "#5A3296",
      textPrimary: "#1F2335",
      textSecondary: "#565F89",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#2E7DE9", 0.15),
    },
  },
  catppuccin: {
    dark: {
      defaultBg: "#181825",
      paperBg: "#1E1E2E",
      primaryMain: "#CBA6F7",
      primaryLight: "#F5C2E7",
      primaryDark: "#9D70D9",
      primaryContrast: "#11111B",
      secondaryMain: "#89B4FA",
      secondaryLight: "#74C7EC",
      secondaryDark: "#5E8EE6",
      textPrimary: "#CDD6F4",
      textSecondary: "#A6ADC8",
      textDisabled: alpha("#CDD6F4", 0.45),
      dividerColor: alpha("#CBA6F7", 0.22),
    },
    light: {
      defaultBg: "#EFF1F5",
      paperBg: "#FFFFFF",
      primaryMain: "#8839EF",
      primaryLight: "#A663F5",
      primaryDark: "#722ED1",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#1E66F5",
      secondaryLight: "#4C88F8",
      secondaryDark: "#1449B8",
      textPrimary: "#4C4F69",
      textSecondary: "#6C6F85",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#8839EF", 0.15),
    },
  },
  nord: {
    dark: {
      defaultBg: "#1A1E24",
      paperBg: "#242933",
      primaryMain: "#88C0D0",
      primaryLight: "#8FBCBB",
      primaryDark: "#5E81AC",
      primaryContrast: "#1A1E24",
      secondaryMain: "#81A1C1",
      secondaryLight: "#88C0D0",
      secondaryDark: "#4C566A",
      textPrimary: "#ECEFF4",
      textSecondary: "#D8DEE9",
      textDisabled: alpha("#ECEFF4", 0.45),
      dividerColor: alpha("#88C0D0", 0.22),
    },
    light: {
      defaultBg: "#F4F6F9",
      paperBg: "#FFFFFF",
      primaryMain: "#5E81AC",
      primaryLight: "#81A1C1",
      primaryDark: "#4C566A",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#438A9E",
      secondaryLight: "#88C0D0",
      secondaryDark: "#2F6777",
      textPrimary: "#2E3440",
      textSecondary: "#4C566A",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#5E81AC", 0.15),
    },
  },
  emerald: {
    dark: {
      defaultBg: "#061A12",
      paperBg: "#0E2B1F",
      primaryMain: "#10B981",
      primaryLight: "#6EE7B7",
      primaryDark: "#047857",
      primaryContrast: "#061A12",
      secondaryMain: "#34D399",
      secondaryLight: "#A7F3D0",
      secondaryDark: "#059669",
      textPrimary: "#ECFDF5",
      textSecondary: "#6EE7B7",
      textDisabled: alpha("#ECFDF5", 0.45),
      dividerColor: alpha("#10B981", 0.25),
    },
    light: {
      defaultBg: "#F0FDF4",
      paperBg: "#FFFFFF",
      primaryMain: "#059669",
      primaryLight: "#10B981",
      primaryDark: "#047857",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#0D9488",
      secondaryLight: "#2DD4BF",
      secondaryDark: "#0F766E",
      textPrimary: "#061A12",
      textSecondary: "#065F46",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#059669", 0.15),
    },
  },
  solarized: {
    dark: {
      defaultBg: "#002B36",
      paperBg: "#073642",
      primaryMain: "#2AA198",
      primaryLight: "#4FD1C5",
      primaryDark: "#1D7A73",
      primaryContrast: "#001E26",
      secondaryMain: "#268BD2",
      secondaryLight: "#5BA8DF",
      secondaryDark: "#1B6CA8",
      textPrimary: "#EEE8D5",
      textSecondary: "#93A1A1",
      textDisabled: alpha("#EEE8D5", 0.45),
      dividerColor: alpha("#2AA198", 0.25),
    },
    light: {
      defaultBg: "#FDF6E3",
      paperBg: "#FFFFFF",
      primaryMain: "#00796B",
      primaryLight: "#2AA198",
      primaryDark: "#004D40",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#268BD2",
      secondaryLight: "#5BA8DF",
      secondaryDark: "#1B6CA8",
      textPrimary: "#073642",
      textSecondary: "#586E75",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#073642", 0.15),
    },
  },
  rose_pine: {
    dark: {
      defaultBg: "#191724",
      paperBg: "#221F33",
      primaryMain: "#EBBCBA",
      primaryLight: "#F5D0CE",
      primaryDark: "#D49B99",
      primaryContrast: "#191724",
      secondaryMain: "#C4A7E7",
      secondaryLight: "#D7C2F0",
      secondaryDark: "#9D7CD8",
      textPrimary: "#E0DEF4",
      textSecondary: "#908CAA",
      textDisabled: alpha("#E0DEF4", 0.45),
      dividerColor: alpha("#EBBCBA", 0.22),
    },
    light: {
      defaultBg: "#FAF4ED",
      paperBg: "#FFFFFF",
      primaryMain: "#B4637A",
      primaryLight: "#D7827E",
      primaryDark: "#8F475C",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#907AA9",
      secondaryLight: "#B19ECA",
      secondaryDark: "#6E5A87",
      textPrimary: "#575279",
      textSecondary: "#797593",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#B4637A", 0.15),
    },
  },
  sunset: {
    dark: {
      defaultBg: "#18120C",
      paperBg: "#261D15",
      primaryMain: "#F59E0B",
      primaryLight: "#FBBF24",
      primaryDark: "#D97706",
      primaryContrast: "#18120C",
      secondaryMain: "#FB923C",
      secondaryLight: "#FDE047",
      secondaryDark: "#B45309",
      textPrimary: "#FEF3C7",
      textSecondary: "#FCD34D",
      textDisabled: alpha("#FEF3C7", 0.45),
      dividerColor: alpha("#F59E0B", 0.25),
    },
    light: {
      defaultBg: "#FFFAEB",
      paperBg: "#FFFFFF",
      primaryMain: "#D97706",
      primaryLight: "#F59E0B",
      primaryDark: "#B45309",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#EA580C",
      secondaryLight: "#F97316",
      secondaryDark: "#C2410C",
      textPrimary: "#18120C",
      textSecondary: "#78350F",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#D97706", 0.15),
    },
  },
  gruvbox: {
    dark: {
      defaultBg: "#1D2021",
      paperBg: "#282828",
      primaryMain: "#FE8019",
      primaryLight: "#FABD2F",
      primaryDark: "#D65D0E",
      primaryContrast: "#1D2021",
      secondaryMain: "#B8BB26",
      secondaryLight: "#D3D652",
      secondaryDark: "#98971A",
      textPrimary: "#EBDBB2",
      textSecondary: "#BDAE93",
      textDisabled: alpha("#EBDBB2", 0.45),
      dividerColor: alpha("#FE8019", 0.24),
    },
    light: {
      defaultBg: "#F9F5D7",
      paperBg: "#FFFFFF",
      primaryMain: "#AF3A03",
      primaryLight: "#D65D0E",
      primaryDark: "#7E2902",
      primaryContrast: "#FFFFFF",
      secondaryMain: "#79740E",
      secondaryLight: "#98971A",
      secondaryDark: "#585408",
      textPrimary: "#282828",
      textSecondary: "#665C54",
      textDisabled: "rgba(0, 0, 0, 0.38)",
      dividerColor: alpha("#AF3A03", 0.16),
    },
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
    if (saved && THEME_PRESETS[saved]) return saved;
    if (saved) localStorage.setItem("hi_theme_preset", "material");
    return "material";
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
    const modePalette = (THEME_PALETTES[preset] || THEME_PALETTES.material)[resolvedMode];
    const {
      defaultBg,
      paperBg,
      primaryMain,
      primaryLight,
      primaryDark,
      primaryContrast,
      secondaryMain,
      secondaryLight,
      secondaryDark,
      textPrimary,
      textSecondary,
      textDisabled,
      dividerColor,
    } = modePalette;

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
        fontFamily: BODY_FONT_FAMILY,
        h1: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 700,
          letterSpacing: "-0.025em",
        },
        h2: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        },
        h3: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 700,
          letterSpacing: "-0.02em",
        },
        h4: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 700,
          letterSpacing: "-0.015em",
        },
        h5: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 700,
          letterSpacing: "-0.015em",
        },
        h6: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        },
        subtitle1: {
          fontFamily: HEADING_FONT_FAMILY,
          fontWeight: 600,
          letterSpacing: "-0.005em",
        },
        subtitle2: {
          fontFamily: BODY_FONT_FAMILY,
          fontWeight: 500,
          letterSpacing: "0em",
        },
        body1: {
          fontFamily: BODY_FONT_FAMILY,
          fontWeight: 400,
          letterSpacing: "0em",
        },
        body2: {
          fontFamily: BODY_FONT_FAMILY,
          fontWeight: 400,
          letterSpacing: "0em",
        },
        button: {
          fontFamily: BODY_FONT_FAMILY,
          fontWeight: 600,
          letterSpacing: "0.015em",
          textTransform: "uppercase",
        },
        caption: {
          fontFamily: BODY_FONT_FAMILY,
        },
        overline: {
          fontFamily: BODY_FONT_FAMILY,
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
              fontFamily: BODY_FONT_FAMILY,
              fontWeight: 600,
              letterSpacing: "0.015em",
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
              fontFamily: HEADING_FONT_FAMILY,
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
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
                backgroundColor: "#2e7d32",
                color: "#ffffff",
              },
              "&.MuiAlert-filledError": {
                backgroundColor: "#d32f2f",
                color: "#ffffff",
              },
              "&.MuiAlert-filledWarning": {
                backgroundColor: "#ed6c02",
                color: "#ffffff",
              },
              "&.MuiAlert-filledInfo": {
                backgroundColor: "#0288d1",
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
  }, [resolvedMode, preset]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, preset, setPreset, resolvedMode, presetConfig }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
