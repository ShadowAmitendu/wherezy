import React from "react";
import { SxProps, Theme } from "@mui/material";
import { LazyMaterialIcon } from "./LazyMaterialIcon";
import {
  getAccountIconComponent,
  hasCuratedAccountIcon,
  resolveAccountIconName,
} from "./accountIcons";

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
  if (!icon || hasCuratedAccountIcon(icon)) {
    return React.createElement(getAccountIconComponent(icon), { fontSize, sx });
  }
  return (
    <LazyMaterialIcon
      icon={resolveAccountIconName(icon)}
      fallbackType="person"
      fontSize={fontSize}
      sx={sx}
    />
  );
};
