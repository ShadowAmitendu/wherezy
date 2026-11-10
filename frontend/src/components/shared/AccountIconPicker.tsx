import React from "react";
import { Box, Typography, Tooltip, IconButton } from "@mui/material";
import { AccountIcon, getAccountIconComponent } from "./AccountIcon";

export const ACCOUNT_ICONS: { name: string; label: string }[] = [
  { name: "Person", label: "Individual / Member" },
  { name: "AdminPanelSettings", label: "Administrator" },
  { name: "SupervisorAccount", label: "Co-Admin / Manager" },
  { name: "Face", label: "User Face" },
  { name: "Face3", label: "Woman" },
  { name: "Face4", label: "Man" },
  { name: "Face6", label: "Elder" },
  { name: "ChildCare", label: "Child / Kid" },
  { name: "Engineering", label: "Technician / Engineer" },
  { name: "Home", label: "Household / Family" },
  { name: "Pets", label: "Family Pet" },
  { name: "Security", label: "Security Guard" },
  { name: "Star", label: "VIP / Favorite" },
  { name: "Favorite", label: "Loved One" },
  { name: "Build", label: "Craftsman / DIY" },
  { name: "Palette", label: "Artist / Creative" },
  { name: "School", label: "Student / Scholar" },
  { name: "Work", label: "Professional / Office" },
  { name: "SportsEsports", label: "Gamer" },
  { name: "FitnessCenter", label: "Fitness / Athlete" },
  { name: "LocalFlorist", label: "Gardener" },
  { name: "Key", label: "Keys / Access" },
  { name: "AutoAwesome", label: "Special / Magic" },
  { name: "AccountCircle", label: "Standard Account" },
];

export interface AccountIconPickerProps {
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
