import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";
import { LocationPicker } from "../locations/LocationPicker";
import { api } from "../../api/client";

interface BulkMoveDialogProps {
  open: boolean;
  itemIds: number[];
  onClose: () => void;
  onMoved: () => void;
}

export const BulkMoveDialog: React.FC<BulkMoveDialogProps> = ({
  open,
  itemIds,
  onClose,
  onMoved,
}) => {
  const [selectedLoc, setSelectedLoc] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBulkMove = async () => {
    if (itemIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await api.bulkMove(itemIds, selectedLoc);
      onMoved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Move {itemIds.length} Items</DialogTitle>
      <DialogContent sx={{ pt: "20px !important" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select destination location for {itemIds.length} selected item(s):
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
        <Button variant="contained" onClick={handleBulkMove} disabled={isSubmitting}>
          Move All
        </Button>
      </DialogActions>
    </Dialog>
  );
};
