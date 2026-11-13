import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import type { UndoOptions } from "../../components/shared/UndoContext";
import { extractBulkErrorMessage, runBulkItemsRequest } from "./selectionUtils";

interface SharedDialogProps {
  open: boolean;
  itemIds: number[];
  onClose: () => void;
  onApplied: () => void | Promise<void>;
  showUndo: (opts: UndoOptions) => void;
  onNotice?: (message: string) => void;
}

type BodyProps = Omit<SharedDialogProps, "open">;

const BulkTagsDialogBody: React.FC<BodyProps> = ({ itemIds, onClose, onApplied, showUndo }) => {
  const [mode, setMode] = useState<"add_tags" | "remove_tags">("add_tags");
  const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null }>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getTags()
      .then((list) => {
        if (active) setTags(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (active) setError(extractBulkErrorMessage(err, "Failed to load tags"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const created = await api.createTag({ name: trimmed });
      setTags((prev) => [...prev, created]);
      setSelectedTagIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setNewTagName("");
    } catch (err) {
      setError(extractBulkErrorMessage(err, "Failed to create tag"));
    }
  };

  const handleSubmit = async () => {
    if (selectedTagIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await runBulkItemsRequest({
        ids: itemIds,
        action: mode,
        params: { tag_ids: selectedTagIds },
        pastTenseLabel: mode === "add_tags" ? "Updated tags on" : "Removed tags from",
        showUndo,
        onSuccess: onApplied,
      });
      onClose();
    } catch (err) {
      setError(extractBulkErrorMessage(err, "Failed to update tags"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>Manage Tags for {itemIds.length} Item(s)</DialogTitle>
      <DialogContent sx={{ pt: "16px !important", display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, val) => {
            if (val) setMode(val);
          }}
        >
          <ToggleButton value="add_tags">Add Tags</ToggleButton>
          <ToggleButton value="remove_tags">Remove Tags</ToggleButton>
        </ToggleButtonGroup>

        {mode === "add_tags" && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              size="small"
              label="Create new tag"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateTag();
                }
              }}
              fullWidth
            />
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
            >
              Add
            </Button>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : tags.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No tags exist yet. Create one above to apply it.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <Chip
                  key={tag.id}
                  label={`#${tag.name}`}
                  clickable
                  color={selected ? "primary" : "default"}
                  variant={selected ? "filled" : "outlined"}
                  onClick={() => toggleTag(tag.id)}
                />
              );
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || selectedTagIds.length === 0}
        >
          {mode === "add_tags" ? "Apply Tags" : "Remove Tags"}
        </Button>
      </DialogActions>
    </>
  );
};

export const BulkTagsDialog: React.FC<SharedDialogProps> = ({ open, onClose, ...rest }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    {open && <BulkTagsDialogBody onClose={onClose} {...rest} />}
  </Dialog>
);

const BulkTakenOutDialogBody: React.FC<BodyProps> = ({ itemIds, onClose, onApplied, showUndo }) => {
  const [takenBy, setTakenBy] = useState("");
  const [takenDue, setTakenDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await runBulkItemsRequest({
        ids: itemIds,
        action: "set_taken",
        params: {
          taken_out: true,
          taken_by: takenBy.trim() || null,
          taken_due: takenDue || null,
        },
        pastTenseLabel: "Marked taken out:",
        showUndo,
        onSuccess: onApplied,
      });
      onClose();
    } catch (err) {
      setError(extractBulkErrorMessage(err, "Failed to mark items as taken out"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>Mark {itemIds.length} Item(s) Taken Out</DialogTitle>
      <DialogContent sx={{ pt: "16px !important", display: "flex", flexDirection: "column", gap: 2.25 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">
          Mark all selected items as taken out. Optional borrower and return due date apply to all selected items.
        </Typography>
        <TextField
          label="Taken By / Borrower (Optional)"
          value={takenBy}
          onChange={(e) => setTakenBy(e.target.value)}
          placeholder="e.g. Alex, Garage project"
          fullWidth
        />
        <TextField
          label="Return Due Date (Optional)"
          type="date"
          value={takenDue}
          onChange={(e) => setTakenDue(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          Mark Taken Out
        </Button>
      </DialogActions>
    </>
  );
};

export const BulkTakenOutDialog: React.FC<SharedDialogProps> = ({ open, onClose, ...rest }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    {open && <BulkTakenOutDialogBody onClose={onClose} {...rest} />}
  </Dialog>
);

const BulkExpiryDialogBody: React.FC<BodyProps> = ({ itemIds, onClose, onApplied, showUndo }) => {
  const [expiryDate, setExpiryDate] = useState("");
  const [clearExpiry, setClearExpiry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!clearExpiry && !expiryDate) return;
    setSaving(true);
    setError(null);
    try {
      await runBulkItemsRequest({
        ids: itemIds,
        action: "set_expiry",
        params: { expiry_date: clearExpiry ? null : expiryDate },
        pastTenseLabel: clearExpiry ? "Cleared expiry on" : "Updated expiry on",
        showUndo,
        onSuccess: onApplied,
      });
      onClose();
    } catch (err) {
      setError(extractBulkErrorMessage(err, "Failed to update expiry dates"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>Set Expiry Date for {itemIds.length} Item(s)</DialogTitle>
      <DialogContent sx={{ pt: "16px !important", display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">
          Only items whose category has expiry tracking enabled will be updated; others are skipped safely.
        </Typography>
        <TextField
          label="Expiry Date"
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          disabled={clearExpiry}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={clearExpiry}
              onChange={(e) => setClearExpiry(e.target.checked)}
            />
          }
          label="Clear expiry date instead"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || (!clearExpiry && !expiryDate)}
        >
          Apply
        </Button>
      </DialogActions>
    </>
  );
};

export const BulkExpiryDialog: React.FC<SharedDialogProps> = ({ open, onClose, ...rest }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    {open && <BulkExpiryDialogBody onClose={onClose} {...rest} />}
  </Dialog>
);

interface BoxChoice {
  id: number;
  label: string;
}

const BulkBoxDialogBody: React.FC<BodyProps> = ({ itemIds, onClose, onApplied, onNotice }) => {
  const [boxes, setBoxes] = useState<BoxChoice[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getMoves()
      .then(async (moves) => {
        const activeMoves = (Array.isArray(moves) ? moves : []).filter(
          (m) => m.status !== "finished" && m.status !== "completed"
        );
        const perMoveBoxes = await Promise.all(
          activeMoves.map(async (m) => {
            const boxList = await api.getBoxes(m.id);
            return (Array.isArray(boxList) ? boxList : [])
              .filter((b) => b.status !== "unpacked")
              .map((b) => ({
                id: Number(b.id),
                label: `${m.name} — ${b.label || `Box #${b.id}`}`,
              }));
          })
        );
        if (!active) return;
        const flat = perMoveBoxes.flat();
        setBoxes(flat);
        if (flat.length === 1) {
          setSelectedBoxId(flat[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(extractBulkErrorMessage(err, "Failed to load moving boxes"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!selectedBoxId) return;
    setSaving(true);
    setError(null);
    try {
      await runBulkItemsRequest({
        ids: itemIds,
        action: "add_to_box",
        params: { box_id: Number(selectedBoxId) },
        pastTenseLabel: "Packed",
        allowUndo: false,
        onSuccess: onApplied,
        onNotice,
      });
      onClose();
    } catch (err) {
      setError(extractBulkErrorMessage(err, "Failed to pack items into box"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>Pack {itemIds.length} Item(s) into Box</DialogTitle>
      <DialogContent sx={{ pt: "16px !important", display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : boxes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No active moving boxes found. Create a move and box on the Moves page first.
          </Typography>
        ) : (
          <FormControl fullWidth>
            <InputLabel id="bulk-box-select-label">Moving Box</InputLabel>
            <Select
              labelId="bulk-box-select-label"
              label="Moving Box"
              value={selectedBoxId}
              onChange={(e) => setSelectedBoxId(Number(e.target.value))}
            >
              {boxes.map((box) => (
                <MenuItem key={box.id} value={box.id}>
                  {box.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !selectedBoxId}
        >
          Pack Selected
        </Button>
      </DialogActions>
    </>
  );
};

export const BulkBoxDialog: React.FC<SharedDialogProps> = ({ open, onClose, ...rest }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    {open && <BulkBoxDialogBody onClose={onClose} {...rest} />}
  </Dialog>
);

const BulkRetireDialogBody: React.FC<BodyProps> = ({ itemIds, onClose, onApplied, showUndo }) => {
  const [reason, setReason] = useState("donated");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await runBulkItemsRequest({
        ids: itemIds,
        action: "retire",
        params: {
          reason,
          date,
          note: note.trim() || null,
        },
        pastTenseLabel: "Retired",
        showUndo,
        onSuccess: onApplied,
      });
      onClose();
    } catch (err) {
      setError(extractBulkErrorMessage(err, "Failed to retire selected items"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogTitle>Retire {itemIds.length} Item(s)</DialogTitle>
      <DialogContent sx={{ pt: "16px !important", display: "flex", flexDirection: "column", gap: 2.25 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">
          Retired items are removed from active inventory while preserving their history and attachments. Currently taken-out items are skipped.
        </Typography>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="bulk-retire-reason-label">Reason</InputLabel>
            <Select
              labelId="bulk-retire-reason-label"
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <MenuItem value="sold">Sold</MenuItem>
              <MenuItem value="donated">Donated</MenuItem>
              <MenuItem value="thrown_away">Thrown Away</MenuItem>
              <MenuItem value="broken">Broken</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          <TextField
            label="Note (Optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for history"
            multiline
            rows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleSubmit}
          disabled={saving}
        >
          Retire Items
        </Button>
      </DialogActions>
    </>
  );
};

export const BulkRetireDialog: React.FC<SharedDialogProps> = ({ open, onClose, ...rest }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    {open && <BulkRetireDialogBody onClose={onClose} {...rest} />}
  </Dialog>
);
