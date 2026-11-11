import React from "react";
import { Box, Typography, Tooltip, IconButton } from "@mui/material";
import { AccountIcon } from "./AccountIcon";
import { ACCOUNT_ICONS, getAccountIconComponent } from "./accountIcons";

interface AccountIconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  label?: string;
  size?: number;
}

export const AccountIconPicker: React.FC<AccountIconPickerProps> = ({
  value,
  onChange,
  label = "Account Icon",
  size = 40,
}) => {
  // Normalize value for matching (handles legacy emojis or lowercase names)
  const CurrentIconComp = getAccountIconComponent(value);

  return (
    <Box>
      {label && (
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {ACCOUNT_ICONS.map((item) => {
          const ItemComp = getAccountIconComponent(item.name);
          const isSelected = ItemComp === CurrentIconComp;

          return (
            <Tooltip key={item.name} title={item.label} arrow>
              <IconButton
                onClick={() => onChange(item.name)}
                aria-label={item.label}
                sx={{
                  width: size,
                  height: size,
                  borderRadius: 1.5,
                  bgcolor: isSelected ? "primary.main" : "action.hover",
                  color: isSelected ? "primary.contrastText" : "text.secondary",
                  border: isSelected ? "2px solid" : "1px solid transparent",
                  borderColor: isSelected ? "primary.main" : "divider",
                  boxShadow: isSelected ? 2 : 0,
                  transition: "all 0.15s ease",
                  transform: isSelected ? "scale(1.08)" : "scale(1)",
                  "&:hover": {
                    bgcolor: isSelected ? "primary.dark" : "action.selected",
                    transform: "scale(1.15)",
                  },
                }}
              >
                <AccountIcon icon={item.name} fontSize="small" />
              </IconButton>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};
