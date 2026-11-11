import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";
import { Item } from "./types";
import { LocationPicker } from "../locations/LocationPicker";
import { useUndo } from "../../components/shared/UndoContext";
import { api } from "../../api/client";

interface ItemMoveDialogProps {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onMoved: () => void;
}

export const ItemMoveDialog: React.FC<ItemMoveDialogProps> = ({
  open,
  item,
  onClose,
  onMoved,
}) => {
  const [prevItem, setPrevItem] = useState<Item | null>(item);
  const [selectedLoc, setSelectedLoc] = useState<number | null>(item?.location_id || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showUndo } = useUndo();

  if (item !== prevItem) {
    setPrevItem(item);
    setSelectedLoc(item?.location_id || null);
  }

  const handleMove = async () => {
    if (!item) return;
    const itemId = item.id;
    const itemName = item.name;
    const prevLocationId = item.location_id ?? null;
    setIsSubmitting(true);
    try {
      await api.moveItem(itemId, selectedLoc);
      onMoved();
      showUndo({
        message: `Moved "${itemName}"`,
        onUndo: async () => {
          await api.moveItem(itemId, prevLocationId);
        },
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Move Item</DialogTitle>
      <DialogContent sx={{ pt: "20px !important" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select new storage location for &quot;{item?.name}&quot;:
        </Typography>
        <LocationPicker
          value={selectedLoc}
          onChange={(newId) => setSelectedLoc(newId)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleMove} disabled={isSubmitting}>
          Move Item
        </Button>
      </DialogActions>
    </Dialog>
  );
};
