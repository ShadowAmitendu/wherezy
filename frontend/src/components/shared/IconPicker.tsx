import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { CURATED_ICONS, renderMuiIcon } from "./iconUtils";
import { MaterialIconGrid } from "./MaterialIconGrid";

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pr: 1.5,
        }}
      >
        Select Category Icon
        <IconButton aria-label="Close icon picker" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <MaterialIconGrid
          curatedItems={CURATED_ICONS}
          selectedIcon={selectedIcon}
          onSelect={(name) => {
            onSelect(name.toLowerCase());
            onClose();
          }}
          renderCuratedIcon={(name) => renderMuiIcon(name, "medium")}
          fallbackType="category"
          variant="labeled"
          maxHeight={isMobile ? "calc(100vh - 230px)" : 420}
          searchPlaceholder="Search 2,164 Material icons (e.g. coffee, guitar, drill, vaccine)..."
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
