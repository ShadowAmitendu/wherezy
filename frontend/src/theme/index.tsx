import React, { createContext, useContext, useState, useEffect } from "react";
import { createTheme, ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

type ThemeMode = "system" | "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedMode: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  setMode: () => {},
  resolvedMode: "light",
});

export const useAppTheme = () => useContext(ThemeContext);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem("hi_theme") as ThemeMode) || "system";
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

  const resolvedMode: "light" | "dark" =
    mode === "system" ? (systemPrefersDark ? "dark" : "light") : mode;

  const theme = React.useMemo(() => {
    const isDark = resolvedMode === "dark";
    return createTheme({
      palette: {
        mode: resolvedMode,
        primary: {
          main: isDark ? "#90caf9" : "#1976d2",
          light: isDark ? "#e3f2fd" : "#42a5f5",
          dark: isDark ? "#42a5f5" : "#1565c0",
          contrastText: isDark ? "rgba(0, 0, 0, 0.87)" : "#ffffff",
        },
        secondary: {
          main: isDark ? "#80cbc4" : "#00897b",
          light: isDark ? "#b2dfdb" : "#4ebaaa",
          dark: isDark ? "#4db6ac" : "#005b4f",
          contrastText: "#ffffff",
        },
        background: {
          default: isDark ? "#121212" : "#f5f5f5",
          paper: isDark ? "#1e1e1e" : "#ffffff",
        },
        error: {
          main: isDark ? "#f48fb1" : "#d32f2f",
        },
        warning: {
          main: isDark ? "#ffe082" : "#ed6c02",
        },
        info: {
          main: isDark ? "#81d4fa" : "#0288d1",
        },
        success: {
          main: isDark ? "#a5d6a7" : "#2e7d32",
        },
        divider: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)",
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
              boxShadow: isDark
                ? "0px 2px 1px -1px rgba(0,0,0,0.5), 0px 1px 1px 0px rgba(0,0,0,0.35), 0px 1px 3px 0px rgba(0,0,0,0.3)"
                : "0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)",
              transition: "box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms",
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
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
              padding: "24px 24px 12px 24px",
            },
          },
        },
        MuiDialogContent: {
          styleOverrides: {
            root: {
              padding: "20px 24px 24px 24px",
              "&.MuiDialogContent-root": {
                paddingTop: "20px",
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
            },
          },
        },
      },
    });
  }, [resolvedMode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedMode }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
