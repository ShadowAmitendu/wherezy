import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
  Paper,
  Divider,
  Chip,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Grid,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import CheckIcon from "@mui/icons-material/Check";
import { api } from "../../api/client";
import { renderMuiIcon } from "../../components/shared/iconUtils";
import { IconPicker } from "../../components/shared/IconPicker";
import { ColorSwatchPicker } from "../../components/shared/ColorSwatchPicker";
import { AlertDialog } from "../../components/shared/AlertDialog";

export const FIELD_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "text", label: "Short Text", hint: "Single-line string" },
  { value: "longtext", label: "Long Text", hint: "Multi-line notes or specs" },
  { value: "number", label: "Number", hint: "Numeric quantities, values, ratings" },
  { value: "date", label: "Date", hint: "Calendar date (YYYY-MM-DD)" },
  { value: "dropdown", label: "Dropdown (Single Select)", hint: "Pick one from a list" },
  { value: "multiselect", label: "Multiple Choice", hint: "Pick one or more" },
  { value: "checkbox", label: "Checkbox (Yes/No)", hint: "True or false toggle" },
];

export interface EditableTemplateField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  show_in_list: boolean;
  options: string[];
  unit?: string;
  hint?: string;
}

interface TemplateCustomizeDialogProps {
  open: boolean;
  mode: "customize_apply" | "create_custom" | "edit_custom";
  templateSlug?: string;
  disablePortal?: boolean;
  onClose: () => void;
  onSuccess: (cat?: any) => void;
}

export const TemplateCustomizeDialog: React.FC<TemplateCustomizeDialogProps> = ({
  open,
  mode,
  templateSlug,
  disablePortal,
  onClose,
  onSuccess,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Template attributes
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("category");
  const [color, setColor] = useState("#1976d2");
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [expiryLabel, setExpiryLabel] = useState("Expiry date");
  const [fields, setFields] = useState<EditableTemplateField[]>([]);

  // Icon picker state
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  // Load template details when dialog opens
  useEffect(() => {
    if (!open) return;

    if (mode === "create_custom") {
      setName("");
      setDescription("");
      setIcon("category");
      setColor("#1976d2");
      setTrackExpiry(false);
      setExpiryLabel("Expiry date");
      setFields([
        {
          id: `f-${Date.now()}-1`,
          label: "Item Model / Brand",
          type: "text",
          required: false,
          show_in_list: true,
          options: [],
        },
      ]);
      return;
    }

    if (templateSlug) {
      setLoading(true);
      setErrorMsg(null);
      api
        .getTemplate(templateSlug)
        .then((tpl) => {
          setName(tpl.name || "");
          setDescription(tpl.description || "");
          setIcon(tpl.icon || "category");
          setColor(tpl.color || "#1976d2");
          setTrackExpiry(Boolean(tpl.track_expiry));
          setExpiryLabel(tpl.expiry_label || "Expiry date");
          const editableFields: EditableTemplateField[] = (tpl.fields || []).map((f: any, idx: number) => ({
            id: `field-${idx}-${Date.now()}`,
            label: f.label || "",
            type: f.type || "text",
            required: Boolean(f.required),
            show_in_list: f.show_in_list !== undefined ? Boolean(f.show_in_list) : true,
            options: Array.isArray(f.options) ? f.options : [],
            unit: f.unit || "",
            hint: f.hint || "",
          }));
          setFields(editableFields);
        })
        .catch((err) => {
          console.error("Failed loading template detail", err);
          setErrorMsg("Failed to load template data.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, mode, templateSlug]);

  const handleAddField = () => {
    const newField: EditableTemplateField = {
      id: `field-${Date.now()}-${fields.length}`,
      label: "",
      type: "text",
      required: false,
      show_in_list: true,
      options: [],
    };
    setFields([...fields, newField]);
  };

  const handleRemoveField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };

  const handleUpdateField = (id: string, patch: Partial<EditableTemplateField>) => {
    setFields(
      fields.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
        // If switching to dropdown/multiselect and options are empty, initialize sample options
        if (
          (patch.type === "dropdown" || patch.type === "multiselect") &&
          (!updated.options || updated.options.length === 0)
        ) {
          updated.options = ["Option A", "Option B"];
        }
        return updated;
      })
    );
  };

  const prepareFieldsPayload = () => {
    return fields
      .map((f) => ({
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        show_in_list: f.show_in_list,
        options: f.type === "dropdown" || f.type === "multiselect" ? f.options.filter(Boolean) : undefined,
        unit: f.type === "number" && f.unit?.trim() ? f.unit.trim() : undefined,
        hint: f.hint?.trim() || undefined,
      }))
      .filter((f) => f.label.length > 0);
  };

  const handleSaveOrApply = async (saveAsCustomTemplateFirst: boolean = false) => {
    if (!name.trim()) {
      setErrorMsg("Please provide a name.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payloadFields = prepareFieldsPayload();

    try {
      if (mode === "create_custom" || saveAsCustomTemplateFirst) {
        // Create custom template
        const tplData = {
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || "Expiry date",
          fields: payloadFields,
        };
        const createdTpl = await api.createCustomTemplate(tplData);

        if (mode === "create_custom") {
          onSuccess(createdTpl);
          onClose();
          return;
        }
      }

      if (mode === "edit_custom" && templateSlug) {
        // Update custom template
        const updateData = {
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || "Expiry date",
          fields: payloadFields,
        };
        const updated = await api.updateCustomTemplate(templateSlug, updateData);
        onSuccess(updated);
        onClose();
        return;
      }

      if (mode === "customize_apply" && templateSlug) {
        // Apply customized template to create a new category
        const applyPayload = {
          name: name.trim(),
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || "Expiry date",
          fields: payloadFields,
        };
        const cat = await api.applyTemplate(templateSlug, applyPayload);
        onSuccess(cat);
        onClose();
      }
    } catch (err: any) {
      console.error("Template operation failed", err);
      setErrorMsg(err.message || "Failed to process template action.");
    } finally {
      setSubmitting(false);
    }
  };

  const dialogTitle =
    mode === "create_custom"
      ? "Create Custom Template"
      : mode === "edit_custom"
      ? `Edit Custom Template: ${name || templateSlug}`
      : `Customize & Use Template: ${name || templateSlug}`;

  return (
    <>
      <Dialog
        open={open}
        onClose={submitting ? undefined : onClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        disablePortal={disablePortal}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                bgcolor: `${color}20`,
                color: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {renderMuiIcon(icon)}
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {dialogTitle}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {mode === "customize_apply"
                  ? "Tweak names, add/remove fields, and freely customize field types before creating this category."
                  : "Define a reusable category template with custom fields and types."}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "16px !important" }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Template Notice"
            message={errorMsg}
            severity="error"
          />

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Template Attributes Card */}
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5 }}>
                  General Information
                </Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 7 }}>
                    <TextField
                      label="Template / Category Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      fullWidth
                      size="small"
                      required
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box>
                        <IconButton
                          onClick={() => setIconPickerOpen(true)}
                          size="small"
                          sx={{
                            border: "1px solid",
                            borderColor: "divider",
                            color,
                            p: 1,
                          }}
                        >
                          {renderMuiIcon(icon)}
                        </IconButton>
                      </Box>
                      <Box sx={{ flexGrow: 1 }}>
                        <ColorSwatchPicker
                          value={color}
                          onChange={setColor}
                          label="Colour"
                          size={24}
                        />
                      </Box>
                    </Box>
                  </Grid>

                  {mode !== "customize_apply" && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Description (Optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="e.g. Starter fields for camera gear and accessories"
                      />
                    </Grid>
                  )}

                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={trackExpiry}
                            onChange={(e) => setTrackExpiry(e.target.checked)}
                          />
                        }
                        label={<Typography variant="body2">Enable Expiry / Due Date Tracking</Typography>}
                      />

                      {trackExpiry && (
                        <TextField
                          label="Expiry Label"
                          size="small"
                          value={expiryLabel}
                          onChange={(e) => setExpiryLabel(e.target.value)}
                          sx={{ minWidth: 160 }}
                        />
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Paper>

              {/* Template Fields & Types Customization */}
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      Custom Fields ({fields.length})
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      You can change field types, labels, options, units, and requirements.
                    </Typography>
                  </Box>

                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddField}
                  >
                    Add Field
                  </Button>
                </Box>

                <Divider sx={{ mb: 2 }} />

                {fields.length === 0 ? (
                  <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
                    <Typography variant="body2">No custom fields defined yet.</Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddField}
                      sx={{ mt: 1 }}
                    >
                      Add First Field
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {fields.map((f, index) => (
                      <Paper
                        key={f.id}
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 1.5,
                          bgcolor: "action.hover",
                          borderLeft: `4px solid ${color}`,
                        }}
                      >
                        <Grid container spacing={1.5} sx={{ alignItems: "center" }}>
                          {/* Field Label */}
                          <Grid size={{ xs: 12, sm: 5 }}>
                            <TextField
                              size="small"
                              fullWidth
                              label={`Field #${index + 1} Label`}
                              placeholder="e.g. Voltage, Form, Dosage"
                              value={f.label}
                              onChange={(e) => handleUpdateField(f.id, { label: e.target.value })}
                              required
                            />
                          </Grid>

                          {/* Field Type Selector */}
                          <Grid size={{ xs: 12, sm: 5 }}>
                            <FormControl size="small" fullWidth>
                              <InputLabel>Field Type</InputLabel>
                              <Select
                                value={f.type}
                                label="Field Type"
                                onChange={(e) => handleUpdateField(f.id, { type: e.target.value })}
                              >
                                {FIELD_TYPES.map((t) => (
                                  <MenuItem key={t.value} value={t.value}>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {t.label}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.75rem" }}>
                                        {t.hint}
                                      </Typography>
                                    </Box>
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>

                          {/* Delete Action */}
                          <Grid size={{ xs: 12, sm: 2 }} sx={{ textAlign: "right" }}>
                            <Tooltip title="Remove Field">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveField(f.id)}
                              >
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Grid>

                          {/* Options Editor for Dropdown / Multiselect */}
                          {(f.type === "dropdown" || f.type === "multiselect") && (
                            <Grid size={{ xs: 12 }}>
                              <TextField
                                size="small"
                                fullWidth
                                label="Choices / Options (comma-separated)"
                                placeholder="e.g. Red, Blue, Green, Yellow"
                                value={f.options.join(", ")}
                                onChange={(e) =>
                                  handleUpdateField(f.id, {
                                    options: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  })
                                }
                                helperText="Type items separated by commas"
                              />
                              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                                {f.options.map((opt, i) => (
                                  <Chip
                                    key={i}
                                    size="small"
                                    label={opt}
                                    onDelete={() => {
                                      const next = [...f.options];
                                      next.splice(i, 1);
                                      handleUpdateField(f.id, { options: next });
                                    }}
                                  />
                                ))}
                              </Box>
                            </Grid>
                          )}

                          {/* Unit for Number */}
                          {f.type === "number" && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                              <TextField
                                size="small"
                                fullWidth
                                label="Measurement Unit (Optional)"
                                placeholder="e.g. kg, ml, mm, V, W, pcs"
                                value={f.unit || ""}
                                onChange={(e) => handleUpdateField(f.id, { unit: e.target.value })}
                              />
                            </Grid>
                          )}

                          {/* Toggles */}
                          <Grid size={{ xs: 12 }}>
                            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    size="small"
                                    checked={f.required}
                                    onChange={(e) => handleUpdateField(f.id, { required: e.target.checked })}
                                  />
                                }
                                label={<Typography variant="caption">Required Field</Typography>}
                              />
                              <FormControlLabel
                                control={
                                  <Switch
                                    size="small"
                                    checked={f.show_in_list}
                                    onChange={(e) => handleUpdateField(f.id, { show_in_list: e.target.checked })}
                                  />
                                }
                                label={<Typography variant="caption">Show in Item Table</Typography>}
                              />
                            </Box>
                          </Grid>
                        </Grid>
                      </Paper>
                    ))}
                  </Box>
                )}
              </Paper>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {mode === "customize_apply" && (
              <Button
                variant="outlined"
                startIcon={<BookmarkBorderIcon />}
                onClick={() => handleSaveOrApply(true)}
                disabled={submitting || loading}
              >
                Save as Reusable Template
              </Button>
            )}

            <Button
              variant="contained"
              startIcon={<CheckIcon />}
              onClick={() => handleSaveOrApply(false)}
              disabled={submitting || loading}
            >
              {submitting
                ? "Saving..."
                : mode === "customize_apply"
                ? "Create Category"
                : mode === "create_custom"
                ? "Create Template"
                : "Save Changes"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Icon Picker Dialog */}
      <IconPicker
        open={iconPickerOpen}
        selectedIcon={icon}
        onSelect={(newIcon) => setIcon(newIcon)}
        onClose={() => setIconPickerOpen(false)}
      />
    </>
  );
};
