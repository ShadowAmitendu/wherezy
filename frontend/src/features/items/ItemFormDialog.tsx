import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import { useForm } from "react-hook-form";
import { Item } from "./types";
import { Category, FieldDef } from "../forms/types";
import { DynamicFields } from "../forms/DynamicFields";
import { LocationPicker } from "../locations/LocationPicker";
import { AiCapturePanel } from "../../components/shared/AiCapturePanel";
import { useAiMediaRecorder } from "../../components/shared/useAiMediaRecorder";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { api, ApiException } from "../../api/client";
import {
  getItemQuantity,
  getItemTakenOutQuantity,
  parsePositiveInt,
} from "./quantityUtils";

const ITEM_AI_EXAMPLES = [
  {
    label: "Medicine strip",
    prompt: "2 strips of Paracetamol 500mg expiring 2027-08-01 in Kitchen Medicine Cabinet",
  },
  {
    label: "USB-C cable",
    prompt: "2m Anker braided USB-C 100W cable stored in Office Desk Drawer",
  },
  {
    label: "Read photo label",
    prompt: "Extract item name, category, expiry date and key specs from the attached label photo",
  },
];

interface ItemFormDialogProps {
  open: boolean;
  item?: Item | null;
  initialCategoryId?: number | null;
  initialLocationId?: number | null;
  onClose: () => void;
  onSaved: (savedItem: Item) => void;
}

export const ItemFormDialog: React.FC<ItemFormDialogProps> = ({
  open,
  item,
  initialCategoryId,
  initialLocationId,
  onClose,
  onSaved,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [categoryFields, setCategoryFields] = useState<FieldDef[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [quantityStr, setQuantityStr] = useState("1");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [attachAiPhoto, setAttachAiPhoto] = useState(true);
  const pendingAiValuesRef = useRef<Record<string, any> | null>(null);

  const aiMedia = useAiMediaRecorder(open && aiOpen);
  const { resetAll: resetAiMedia } = aiMedia;

  const { control, reset, getValues } = useForm();

  // Load categories list
  useEffect(() => {
    if (!open) return;
    let active = true;
    pendingAiValuesRef.current = null;

    api.getCategories().then((cats) => {
      if (!active) return;
      setAiOpen(false);
      setAiExtracting(false);
      setAiSummary(null);
      setAiError(null);
      setAttachAiPhoto(!item);
      resetAiMedia();
      setCategories(cats);
      if (item) {
        setSelectedCategoryId(item.category_id);
        setSelectedLocationId(item.location_id || null);
        setName(item.name);
        setQuantityStr(String(getItemQuantity(item)));
        setExpiryDate(item.expiry_date || "");
        setNotes(item.notes || "");
        reset({ values: item.values || {} });
      } else {
        const defaultCatId = initialCategoryId || (cats.length > 0 ? cats[0].id : "");
        setSelectedCategoryId(defaultCatId);
        setSelectedLocationId(initialLocationId || null);
        setName("");
        setQuantityStr("1");
        setExpiryDate("");
        setNotes("");
        reset({ values: {} });
      }
    }).catch(console.error);

    return () => {
      active = false;
    };
  }, [open, item, initialCategoryId, initialLocationId, reset, resetAiMedia]);

  useEffect(() => {
    if (!open || !aiOpen) return;
    let active = true;
    api
      .getSettings()
      .then((s) => {
        if (active) setAiConfigured(Boolean(s.ai_configured));
      })
      .catch(() => {
        // Ignore transient status fetch failure
      });
    return () => {
      active = false;
    };
  }, [open, aiOpen]);

  // When selected category changes, fetch its fields
  useEffect(() => {
    let active = true;
    Promise.resolve(
      selectedCategoryId ? api.getCategory(Number(selectedCategoryId)) : null
    )
      .then((cat) => {
        if (!active) return;
        setCategoryFields(cat?.fields || []);
        if (pendingAiValuesRef.current) {
          reset({ values: pendingAiValuesRef.current });
          pendingAiValuesRef.current = null;
        }
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [selectedCategoryId, reset]);

  const activeCategory = categories.find((c) => c.id === selectedCategoryId);

  const handleRunAiExtract = async () => {
    if (aiMedia.isRecording) {
      setAiError("Please stop the active voice recording first.");
      return;
    }
    if (!aiMedia.prompt.trim() && !aiMedia.audioDraft && !aiMedia.imageDraft) {
      setAiError("Describe the item, record a voice note, or attach a photo first.");
      return;
    }

    setAiExtracting(true);
    setAiError(null);
    try {
      const res = await api.extractItemWithAi({
        prompt: aiMedia.prompt,
        audio: aiMedia.audioDraft?.blob ?? null,
        audioFilename: aiMedia.audioDraft?.filename,
        image: aiMedia.imageDraft?.file ?? null,
        imageFilename: aiMedia.imageDraft?.file.name,
        preferredCategoryId: selectedCategoryId ? Number(selectedCategoryId) : null,
        preferredLocationId: selectedLocationId,
      });

      const s = res.suggestion;
      if (s.name) setName(s.name);
      if (s.location_id !== null && s.location_id !== undefined) {
        setSelectedLocationId(s.location_id);
      }
      if (s.quantity && s.quantity >= 1) {
        setQuantityStr(String(s.quantity));
      }
      if (s.expiry_date) {
        setExpiryDate(s.expiry_date);
      }
      if (s.notes !== null && s.notes !== undefined) {
        setNotes(s.notes);
      }

      const currentValues = getValues("values") || {};
      const nextValues = { ...currentValues, ...(s.values || {}) };
      if (s.category_id && s.category_id !== selectedCategoryId) {
        pendingAiValuesRef.current = nextValues;
        setSelectedCategoryId(s.category_id);
      } else {
        reset({ values: nextValues });
      }
      setAiSummary(s.summary || "Fields auto-filled by AI. Review and save when ready.");
    } catch (err: any) {
      if (err instanceof ApiException) {
        if (err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        }
        setAiError(err.error.message);
      } else {
        setAiError("Failed to extract item details with AI.");
      }
    } finally {
      setAiExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Item name is required");
      return;
    }
    if (!selectedCategoryId) {
      setErrorMsg("Please select a category");
      return;
    }
    const parsedQty = parsePositiveInt(quantityStr);
    if (parsedQty === null) {
      setErrorMsg("Quantity must be a whole number of at least 1");
      return;
    }
    const minQty = item ? Math.max(1, getItemTakenOutQuantity(item)) : 1;
    if (item && parsedQty < minQty) {
      setErrorMsg(`Quantity cannot be less than ${minQty} currently taken out units`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const formValues = getValues("values") || {};

    try {
      let saved: Item;
      if (item) {
        saved = await api.updateItem(item.id, {
          name: name.trim(),
          category_id: Number(selectedCategoryId),
          location_id: selectedLocationId,
          quantity: parsedQty,
          expiry_date: expiryDate.trim() || null,
          notes: notes.trim() || null,
          values: formValues,
        });
      } else {
        saved = await api.createItem({
          name: name.trim(),
          category_id: Number(selectedCategoryId),
          location_id: selectedLocationId,
          quantity: parsedQty,
          expiry_date: expiryDate.trim() || null,
          notes: notes.trim() || null,
          values: formValues,
        });
      }

      if (attachAiPhoto && aiMedia.imageDraft?.file) {
        try {
          await api.uploadPhoto("item", saved.id, aiMedia.imageDraft.file);
          saved = await api.getItem(saved.id);
        } catch (uploadErr) {
          console.error("Failed to attach AI photo to saved item", uploadErr);
        }
      }

      onSaved(saved);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to save item");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        transition: {
          onExited: resetAiMedia,
        },
      }}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: isMobile ? "100%" : "auto" }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, px: { xs: 2, sm: 3 } }}>
          <span>{item ? "Edit Item" : "Add New Item"}</span>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              type="button"
              size="small"
              variant={aiOpen ? "contained" : "outlined"}
              color="secondary"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setAiOpen((prev) => !prev)}
              disabled={isSubmitting}
            >
              AI Smart Fill
            </Button>
            {isMobile && (
              <IconButton onClick={onClose} size="small" edge="end">
                <CloseIcon />
              </IconButton>
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: "20px !important", px: { xs: 2, sm: 3 }, flexGrow: 1, overflowY: "auto" }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Item Save Error"
            message={errorMsg}
            severity="error"
          />

          <Collapse in={aiOpen} unmountOnExit>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                borderColor: "secondary.main",
                bgcolor: "action.hover",
              }}
            >
              <Stack spacing={1.5}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <AutoAwesomeIcon color="secondary" fontSize="small" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      AI Item Smart Fill
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Speak, describe, or snap a label/product photo
                  </Typography>
                </Box>

                {aiExtracting && <LinearProgress color="secondary" />}

                {aiError && (
                  <Alert severity="error" onClose={() => setAiError(null)}>
                    {aiError}
                  </Alert>
                )}

                {aiSummary && (
                  <Alert severity="success" onClose={() => setAiSummary(null)}>
                    {aiSummary}
                  </Alert>
                )}

                <AiCapturePanel
                  media={aiMedia}
                  aiConfigured={aiConfigured}
                  disabled={aiExtracting || isSubmitting}
                  promptLabel="Describe the item (or speak / snap a photo)"
                  promptPlaceholder="e.g. 2x Paracetamol 500mg in Kitchen Medicine Cabinet expiring August 2027..."
                  examples={ITEM_AI_EXAMPLES}
                  allowImage
                  promptRows={2}
                  onNavigateSettings={onClose}
                />

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                  {aiMedia.imageDraft ? (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={attachAiPhoto}
                          onChange={(e) => setAttachAiPhoto(e.target.checked)}
                          disabled={aiExtracting || isSubmitting}
                        />
                      }
                      label={
                        <Typography variant="caption">
                          {item ? "Also upload photo to this item" : "Also save photo as cover image"}
                        </Typography>
                      }
                    />
                  ) : (
                    <span />
                  )}

                  <Button
                    type="button"
                    variant="contained"
                    color="secondary"
                    size="small"
                    startIcon={<AutoAwesomeIcon />}
                    onClick={() => void handleRunAiExtract()}
                    disabled={
                      aiExtracting ||
                      isSubmitting ||
                      aiMedia.isRecording ||
                      (!aiMedia.prompt.trim() && !aiMedia.audioDraft && !aiMedia.imageDraft)
                    }
                  >
                    {aiExtracting ? "Extracting..." : "Fill Fields with AI"}
                  </Button>
                </Box>
              </Stack>
            </Paper>
          </Collapse>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 0.5 }}>
            {/* Section 1: Basic Information */}
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  color: "primary.main",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: "0.75rem",
                  mb: 1.5,
                }}
              >
                Basic Information
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Item Name"
                    placeholder="e.g. Paracetamol 500mg, Phillips LED Bulb"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    fullWidth
                    required
                    autoFocus
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel id="item-category-select-label">Category</InputLabel>
                    <Select
                      labelId="item-category-select-label"
                      value={selectedCategoryId ? String(selectedCategoryId) : ""}
                      label="Category"
                      onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
                    >
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 8 }}>
                  <LocationPicker
                    value={selectedLocationId}
                    onChange={(newLoc) => setSelectedLocationId(newLoc)}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Quantity"
                    type="number"
                    required
                    value={quantityStr}
                    onChange={(e) => setQuantityStr(e.target.value)}
                    fullWidth
                    slotProps={{
                      htmlInput: {
                        min: item ? Math.max(1, getItemTakenOutQuantity(item)) : 1,
                        step: 1,
                        style: { fontFamily: "var(--font-mono)" },
                      },
                    }}
                    helperText={
                      item && getItemTakenOutQuantity(item) > 0
                        ? `${getItemTakenOutQuantity(item)} currently out`
                        : "Units stored (min 1)"
                    }
                  />
                </Grid>

                {activeCategory?.track_expiry && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label={activeCategory.expiry_label || "Expiry Date"}
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      fullWidth
                      slotProps={{
                        inputLabel: {
                          shrink: true,
                        },
                      }}
                    />
                  </Grid>
                )}
              </Grid>
            </Box>

            {/* Section 2: Category Attributes (when fields exist) */}
            {categoryFields.length > 0 && (
              <Box>
                <Divider sx={{ mb: 2 }} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "primary.main",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontSize: "0.75rem",
                    mb: 1.5,
                  }}
                >
                  {activeCategory?.name ? `${activeCategory.name} Details` : "Properties"}
                </Typography>
                <DynamicFields fields={categoryFields} control={control} />
              </Box>
            )}

            {/* Section 3: Notes & Documentation */}
            <Box>
              <Divider sx={{ mb: 2 }} />
              <Typography
                variant="subtitle2"
                sx={{
                  color: "text.secondary",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontSize: "0.75rem",
                  mb: 1.5,
                }}
              >
                Notes & Additional Details
              </Typography>
              <TextField
                label="Notes (Optional)"
                placeholder="Any extra details, serial numbers, warranty notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                rows={3}
                fullWidth
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: 1, borderColor: "divider" }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : item ? "Save Changes" : "Create Item"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
