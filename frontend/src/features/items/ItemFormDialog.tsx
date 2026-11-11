import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Divider,
  Grid,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useForm } from "react-hook-form";
import { Item } from "./types";
import { Category, FieldDef } from "../forms/types";
import { DynamicFields } from "../forms/DynamicFields";
import { LocationPicker } from "../locations/LocationPicker";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { api, ApiException } from "../../api/client";
import {
  getItemQuantity,
  getItemTakenOutQuantity,
  parsePositiveInt,
} from "./quantityUtils";

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

  const { control, reset, getValues } = useForm();

  // Load categories list
  useEffect(() => {
    if (open) {
      api.getCategories().then((cats) => {
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
    }
  }, [open, item, initialCategoryId, initialLocationId, reset]);

  // When selected category changes, fetch its fields
  useEffect(() => {
    let active = true;
    Promise.resolve(
      selectedCategoryId ? api.getCategory(Number(selectedCategoryId)) : null
    )
      .then((cat) => {
        if (active) setCategoryFields(cat?.fields || []);
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [selectedCategoryId]);

  const activeCategory = categories.find((c) => c.id === selectedCategoryId);

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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: isMobile ? "100%" : "auto" }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", px: { xs: 2, sm: 3 } }}>
          <span>{item ? "Edit Item" : "Add New Item"}</span>
          {isMobile && (
            <IconButton onClick={onClose} size="small" edge="end">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent sx={{ pt: "20px !important", px: { xs: 2, sm: 3 }, flexGrow: 1, overflowY: "auto" }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Item Save Error"
            message={errorMsg}
            severity="error"
          />

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
