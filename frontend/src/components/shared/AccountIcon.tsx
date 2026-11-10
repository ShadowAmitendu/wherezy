import React from "react";
import { SxProps, Theme } from "@mui/material";
import * as Icons from "@mui/icons-material";

export const EMOJI_TO_ICON_MAP: Record<string, string> = {
  "👤": "Person",
  "🧑‍💻": "Engineering",
  "👑": "AdminPanelSettings",
  "🦊": "Pets",
  "🐱": "Pets",
  "🏡": "Home",
  "📦": "Inventory2",
  "⭐": "Star",
  "🔑": "Key",
  "🎨": "Palette",
  "🛠️": "Build",
  "🌸": "LocalFlorist",
  "⚡": "Bolt",
  "🍎": "Favorite",
  "🚀": "AutoAwesome",
  "👩": "Face3",
  "👨": "Face4",
};

export const getAccountIconComponent = (iconName?: string | null): React.ComponentType<any> => {
  if (!iconName) return Icons.Person;
  const mapped = EMOJI_TO_ICON_MAP[iconName] || iconName;
  const normalized = mapped.charAt(0).toUpperCase() + mapped.slice(1);
  return (Icons as any)[normalized] || (Icons as any)[mapped] || Icons.Person;
};

export interface AccountIconProps {
  icon?: string | null;
  name?: string;
  fontSize?: "inherit" | "small" | "medium" | "large";
  sx?: SxProps<Theme>;
}

export const AccountIcon: React.FC<AccountIconProps> = ({
  icon,
  fontSize = "medium",
  sx,
}) => {
  const IconComponent = getAccountIconComponent(icon);
  return <IconComponent fontSize={fontSize} sx={sx} />;
};
