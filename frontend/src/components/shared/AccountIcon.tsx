import React from "react";
import { SxProps, Theme } from "@mui/material";
import { getAccountIconComponent } from "./accountIcons";

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
  return React.createElement(getAccountIconComponent(icon), { fontSize, sx });
};
