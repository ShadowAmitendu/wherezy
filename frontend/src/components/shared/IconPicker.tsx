import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  IconButton,
  Tooltip,
} from "@mui/material";
import * as Icons from "@mui/icons-material";

export const CURATED_ICONS: { name: string; label: string }[] = [
  { name: "Medication", label: "Medication" },
  { name: "Lightbulb", label: "Lightbulb" },
  { name: "Construction", label: "Tools" },
  { name: "Description", label: "Document" },
  { name: "Kitchen", label: "Kitchen" },
  { name: "Devices", label: "Electronics" },
  { name: "Checkroom", label: "Clothes" },
  { name: "LocalShipping", label: "Moving / Storage" },
  { name: "Inventory", label: "Inventory" },
  { name: "Home", label: "Home" },
  { name: "Folder", label: "Folder" },
  { name: "Book", label: "Book" },
  { name: "SportsEsports", label: "Gaming" },
  { name: "FitnessCenter", label: "Fitness" },
  { name: "Pets", label: "Pets" },
  { name: "Palette", label: "Art / Craft" },
  { name: "MusicNote", label: "Music" },
  { name: "CameraAlt", label: "Camera" },
  { name: "Chair", label: "Furniture" },
  { name: "Build", label: "Hardware" },
  { name: "Weekend", label: "Living" },
  { name: "Bed", label: "Bedroom" },
  { name: "CleanHands", label: "Cleaning" },
  { name: "ElectricalServices", label: "Cables / Electrical" },
  { name: "DirectionsCar", label: "Automotive" },
  { name: "Luggage", label: "Travel" },
  { name: "Watch", label: "Watches / Jewelry" },
  { name: "LocalPharmacy", label: "First Aid" },
  { name: "Science", label: "Science" },
  { name: "School", label: "Education" },
  { name: "LocalDrink", label: "Drinks" },
  { name: "Fastfood", label: "Food" },
  { name: "Shield", label: "Security" },
  { name: "LocalOffer", label: "Tagged" },
  { name: "Grade", label: "Valuables" },
  { name: "Category", label: "General Category" },
];

export const renderMuiIcon = (iconName: string, fontSize: "small" | "medium" | "large" = "medium") => {
  const normalized = iconName.charAt(0).toUpperCase() + iconName.slice(1);
  const IconComponent = (Icons as any)[normalized] || (Icons as any)[iconName] || Icons.Category;
  return <IconComponent fontSize={fontSize} />;
};

interface IconPickerProps {
  open: boolean;
  selectedIcon: string;
  onSelect: (iconName: string) => void;
  onClose: () => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  open,
  selectedIcon,
  onSelect,
  onClose,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Select an Icon</DialogTitle>
      <DialogContent>
        <Grid container spacing={1} sx={{ pt: 1 }}>
          {CURATED_ICONS.map((item) => {
            const isSelected = selectedIcon.toLowerCase() === item.name.toLowerCase();
            return (
              <Grid key={item.name}>
                <Tooltip title={item.label}>
                  <IconButton
                    color={isSelected ? "primary" : "default"}
                    sx={{
                      p: 1.5,
                      border: isSelected ? "2px solid" : "1px solid transparent",
                      borderColor: isSelected ? "primary.main" : "transparent",
                      bgcolor: isSelected ? "action.selected" : "transparent",
                    }}
                    onClick={() => {
                      onSelect(item.name.toLowerCase());
                      onClose();
                    }}
                  >
                    {renderMuiIcon(item.name)}
                  </IconButton>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};
