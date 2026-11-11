import { createContext, useContext } from "react";

export const HEADING_FONT_FAMILY =
  "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const BODY_FONT_FAMILY =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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

export interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
  resolvedMode: "light" | "dark";
  presetConfig: ThemePresetConfig;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  setMode: () => {},
  preset: "material",
  setPreset: () => {},
  resolvedMode: "dark",
  presetConfig: THEME_PRESETS.material,
});

export const useAppTheme = () => useContext(ThemeContext);
