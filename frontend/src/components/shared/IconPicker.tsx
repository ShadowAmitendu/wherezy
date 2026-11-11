import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  IconButton,
  Tooltip,
} from "@mui/material";
import { CURATED_ICONS, renderMuiIcon } from "./iconUtils";

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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
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
