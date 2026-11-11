import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  Stack,
  Chip,
  Alert,
  CircularProgress,
} from "@mui/material";
import { Add as AddIcon, Remove as RemoveIcon } from "@mui/icons-material";
import { api, ApiException } from "../../api/client";
import { useUndo } from "../../components/shared/UndoContext";
import {
  clampTakenOutQuantity,
  getItemQuantity,
  getItemTakenOutQuantity,
} from "./quantityUtils";

export interface TakenOutTarget {
  id: number;
  name: string;
  quantity?: number | null;
  taken_out?: boolean;
  taken_out_quantity?: number | null;
  taken_by?: string | null;
}

interface TakenOutDialogProps {
  open: boolean;
  item: TakenOutTarget | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface TakenOutDialogBodyProps {
  item: TakenOutTarget;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function TakenOutDialogBody({ item, onClose, onSaved }: TakenOutDialogBodyProps) {
  const total = getItemQuantity(item);
  const initialOut = getItemTakenOutQuantity(item);

  const [outQty, setOutQty] = useState<number>(initialOut);
  const [takenBy, setTakenBy] = useState<string>(item.taken_by || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showUndo } = useUndo();

  const availableAfterSave = Math.max(0, total - outQty);

  const handleSave = async () => {
    const prevQty = initialOut;
    const prevTakenBy = item.taken_by ?? null;
    setSaving(true);
    setError(null);
    try {
      const clamped = clampTakenOutQuantity(outQty, total);
      await api.toggleTaken(item.id, {
        taken_out_quantity: clamped,
        taken_by: clamped > 0 ? takenBy.trim() || null : null,
      });
      await onSaved();
      showUndo({
        message:
          clamped === 0
            ? `Returned all units of "${item.name}"`
            : `Updated taken-out (${clamped}/${total}) for "${item.name}"`,
        onUndo: async () => {
          await api.toggleTaken(item.id, {
            taken_out_quantity: prevQty,
            taken_by: prevTakenBy,
          });
        },
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError("Failed to update taken out quantity.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>
        <Typography variant="h6" component="span" sx={{ fontWeight: 700, display: "block" }}>
          Taken Out Quantity
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {item.name}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2.5, flexWrap: "wrap" }}>
          <Chip
            size="small"
            label={`Total: ${total}`}
            variant="outlined"
            sx={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
          />
          <Chip
            size="small"
            color={availableAfterSave > 0 ? "success" : "default"}
            variant={availableAfterSave > 0 ? "outlined" : "filled"}
            label={`In Place: ${availableAfterSave}`}
            sx={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
          />
          <Chip
            size="small"
            color={outQty > 0 ? "secondary" : "default"}
            label={`Taken Out: ${outQty}`}
            sx={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
          />
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          How many units are currently taken out? (0 to {total})
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <IconButton
            aria-label="Decrease taken out quantity"
            onClick={() => setOutQty((q) => clampTakenOutQuantity(q - 1, total))}
            disabled={saving || outQty <= 0}
            sx={{ border: 1, borderColor: "divider" }}
          >
            <RemoveIcon />
          </IconButton>

          <TextField
            size="small"
            type="number"
            label="Taken Out"
            value={outQty}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                setOutQty(0);
                return;
              }
              setOutQty(clampTakenOutQuantity(Number(raw), total));
            }}
            slotProps={{
              htmlInput: {
                min: 0,
                max: total,
                step: 1,
                style: { textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 700 },
              },
            }}
            sx={{ width: 120 }}
            disabled={saving}
          />

          <IconButton
            aria-label="Increase taken out quantity"
            onClick={() => setOutQty((q) => clampTakenOutQuantity(q + 1, total))}
            disabled={saving || outQty >= total}
            sx={{ border: 1, borderColor: "divider" }}
          >
            <AddIcon />
          </IconButton>
        </Box>

        <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2.5, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            disabled={saving || outQty === 0}
            onClick={() => setOutQty(0)}
          >
            Return All (0)
          </Button>
          {total > 1 && (
            <Button
              size="small"
              variant="outlined"
              disabled={saving || outQty === total}
              onClick={() => setOutQty(total)}
            >
              Take All ({total})
            </Button>
          )}
        </Stack>

        <TextField
          fullWidth
          size="small"
          label="Taken By (optional)"
          placeholder="e.g., Alex or Kitchen Counter"
          value={takenBy}
          onChange={(e) => setTakenBy(e.target.value)}
          disabled={saving || outQty === 0}
          helperText={
            outQty === 0
              ? "Cleared automatically when all units are returned."
              : "Person or temporary place holding the taken out units."
          }
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </DialogActions>
    </>
  );
}

export const TakenOutDialog: React.FC<TakenOutDialogProps> = ({
  open,
  item,
  onClose,
  onSaved,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      {open && item && (
        <TakenOutDialogBody
          key={`${item.id}-${getItemQuantity(item)}-${getItemTakenOutQuantity(item)}`}
          item={item}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
};
