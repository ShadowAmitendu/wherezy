import React, { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Tooltip,
  Alert,
  Paper,
  Grid,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useForm } from "react-hook-form";
import { FieldDef, FieldType } from "./types";
import { DynamicFields } from "./DynamicFields";
import { api } from "../../api/client";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

interface FormBuilderProps {
  categoryId: number;
  fields: FieldDef[];
  onFieldsChanged: () => void;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short Text" },
  { value: "longtext", label: "Long Text (Multi-line)" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown (Single Select)" },
  { value: "multiselect", label: "Multiple Choice" },
  { value: "checkbox", label: "Checkbox (Yes/No)" },
];

interface SortableFieldItemProps {
  field: FieldDef;
  onEdit: (field: FieldDef) => void;
  onArchive: (field: FieldDef) => void;
}

const SortableFieldItem: React.FC<SortableFieldItemProps> = ({ field, onEdit, onArchive }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        mb: 1.5,
        bgcolor: "background.paper",
      }}
    >
      <ListItemIcon sx={{ cursor: "grab", minWidth: 36 }} {...attributes} {...listeners}>
        <DragIndicatorIcon color="action" />
      </ListItemIcon>
      <ListItemText
        primary={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {field.label}
            </Typography>
            {field.required && <Chip label="Required" size="small" color="error" variant="outlined" />}
            {field.show_in_list && <Chip label="Table Column" size="small" color="primary" variant="outlined" />}
          </Box>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            Type: {field.type}
            {field.unit ? ` • Unit: ${field.unit}` : ""}
            {field.options && field.options.length > 0 ? ` • Options: ${field.options.join(", ")}` : ""}
          </Typography>
        }
      />
      <ListItemSecondaryAction>
        <Tooltip title="Edit field">
          <IconButton size="small" onClick={() => onEdit(field)}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Archive field">
          <IconButton size="small" color="error" onClick={() => onArchive(field)}>
            <ArchiveOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ListItemSecondaryAction>
    </ListItem>
  );
};

export const FormBuilder: React.FC<FormBuilderProps> = ({
  categoryId,
  fields,
  onFieldsChanged,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDef | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FieldDef | null>(null);

  // Form state for add/edit dialog
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [required, setRequired] = useState(false);
  const [unit, setUnit] = useState("");
  const [hint, setHint] = useState("");
  const [optionsStr, setOptionsStr] = useState("");
  const [showInList, setShowInList] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview form control
  const { control: previewControl } = useForm();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeFields = fields.filter((f) => !f.archived);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = activeFields.findIndex((f) => f.id === active.id);
      const newIndex = activeFields.findIndex((f) => f.id === over.id);
      const newOrder = arrayMove(activeFields, oldIndex, newIndex);
      try {
        await api.reorderFields(
          categoryId,
          newOrder.map((f) => f.id)
        );
        onFieldsChanged();
      } catch (err) {
        console.error("Reorder failed", err);
      }
    }
  };

  const handleOpenAdd = () => {
    setEditingField(null);
    setLabel("");
    setType("text");
    setRequired(false);
    setUnit("");
    setHint("");
    setOptionsStr("");
    setShowInList(false);
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (field: FieldDef) => {
    setEditingField(field);
    setLabel(field.label);
    setType(field.type);
    setRequired(field.required);
    setUnit(field.unit || "");
    setHint(field.hint || "");
    setOptionsStr(field.options ? field.options.join(", ") : "");
    setShowInList(field.show_in_list);
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleSaveField = async () => {
    if (!label.trim()) {
      setErrorMsg("Field label is required");
      return;
    }

    let parsedOptions: string[] | undefined = undefined;
    if (type === "dropdown" || type === "multiselect") {
      parsedOptions = optionsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parsedOptions.length === 0) {
        setErrorMsg("Please specify at least one option (comma separated)");
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (editingField) {
        await api.updateField(editingField.id, {
          label: label.trim(),
          type,
          required,
          unit: unit.trim() || null,
          hint: hint.trim() || null,
          options: parsedOptions,
          show_in_list: showInList,
        });
      } else {
        await api.createField(categoryId, {
          label: label.trim(),
          type,
          required,
          unit: unit.trim() || null,
          hint: hint.trim() || null,
          options: parsedOptions,
          show_in_list: showInList,
        });
      }
      setDialogOpen(false);
      onFieldsChanged();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save field");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await api.deleteField(archiveTarget.id);
      setArchiveTarget(null);
      onFieldsChanged();
    } catch (err: any) {
      console.error("Archive failed", err);
    }
  };

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Field List & Builder */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Form Fields
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Drag to reorder how fields appear when adding items
                  </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
                  Add Field
                </Button>
              </Box>

              {activeFields.length === 0 ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No custom fields defined yet. Standard fields (Name, Location, Expiry, Notes, Photos) are always available.
                </Alert>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                    <List sx={{ pt: 1 }}>
                      {activeFields.map((field) => (
                        <SortableFieldItem
                          key={field.id}
                          field={field}
                          onEdit={handleOpenEdit}
                          onArchive={setArchiveTarget}
                        />
                      ))}
                    </List>
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Live Preview Pane */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ bgcolor: "background.paper", border: "1px dashed", borderColor: "divider" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <VisibilityOutlinedIcon color="primary" />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Live Form Preview
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                This is exactly how your custom form will look to users:
              </Typography>

              <Paper elevation={0} sx={{ p: 2, bgcolor: "background.default", borderRadius: 2 }}>
                <TextField label="Name" fullWidth required placeholder="e.g. Paracetamol" sx={{ mb: 2.5 }} disabled />
                <DynamicFields fields={activeFields} control={previewControl} />
              </Paper>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingField ? "Edit Field" : "Add Custom Field"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {errorMsg && <Alert severity="error">{errorMsg}</Alert>}

          <TextField
            label="Field Label"
            placeholder="e.g. Dosage, Wattage, Brand"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
            required
            autoFocus
          />

          <FormControl fullWidth>
            <InputLabel id="field-type-label">Field Type</InputLabel>
            <Select
              labelId="field-type-label"
              value={type}
              label="Field Type"
              onChange={(e) => setType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {(type === "dropdown" || type === "multiselect") && (
            <TextField
              label="Options (comma-separated)"
              placeholder="e.g. Tablet, Capsule, Syrup, Injection"
              value={optionsStr}
              onChange={(e) => setOptionsStr(e.target.value)}
              helperText="Separate multiple choices with commas"
              fullWidth
              required
            />
          )}

          {type === "number" && (
            <TextField
              label="Unit of Measurement (Optional)"
              placeholder="e.g. W, lm, V, mg, kg"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              fullWidth
            />
          )}

          <TextField
            label="Help Text / Hint (Optional)"
            placeholder="e.g. Look at the label on the bottom"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            fullWidth
          />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <FormControlLabel
              control={<Switch checked={required} onChange={(e) => setRequired(e.target.checked)} />}
              label="Mandatory field (Required to save item)"
            />
            <FormControlLabel
              control={<Switch checked={showInList} onChange={(e) => setShowInList(e.target.checked)} />}
              label="Show in Items Table (max 4 per category)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveField} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Field"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive Field"
        message={`Are you sure you want to archive '${archiveTarget?.label}'? Existing items will keep their data, but this field will no longer appear on new or edited items.`}
        confirmLabel="Archive"
        confirmColor="error"
        onConfirm={handleConfirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />
    </Box>
  );
};
