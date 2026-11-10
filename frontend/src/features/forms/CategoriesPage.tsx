import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
  Snackbar,
  Tooltip,
  Grid,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { PageHeader } from "../../components/shared/PageHeader";
import { EmptyState } from "../../components/shared/EmptyState";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { IconPicker, renderMuiIcon } from "../../components/shared/IconPicker";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { api, ApiException } from "../../api/client";
import { Category } from "./types";

const COLOR_PRESETS = [
  "#1976d2",
  "#e53935",
  "#f57c00",
  "#388e3c",
  "#8e24aa",
  "#00897b",
  "#d81b60",
  "#3949ab",
  "#546e7a",
];

export const CategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Template modal
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  // Add/Edit dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("category");
  const [color, setColor] = useState("#1976d2");
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [expiryLabel, setExpiryLabel] = useState("Expiry date");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.getTemplates();
      setTemplates(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCategories();
    loadTemplates();
  }, []);

  const handleOpenAddCustom = () => {
    setEditingCategory(null);
    setName("");
    setIcon("category");
    setColor("#1976d2");
    setTrackExpiry(false);
    setExpiryLabel("Expiry date");
    setErrorMsg(null);
    setCategoryDialogOpen(true);
  };

  const handleOpenEdit = (cat: Category, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCategory(cat);
    setName(cat.name);
    setIcon(cat.icon);
    setColor(cat.color);
    setTrackExpiry(cat.track_expiry);
    setExpiryLabel(cat.expiry_label || "Expiry date");
    setErrorMsg(null);
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!name.trim()) {
      setErrorMsg("Category name is required");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          name: name.trim(),
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || null,
        });
      } else {
        await api.createCategory({
          name: name.trim(),
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || null,
        });
      }
      setCategoryDialogOpen(false);
      await loadCategories();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyTemplate = async (slug: string) => {
    try {
      setIsLoading(true);
      const created = await api.applyTemplate(slug);
      setTemplateDialogOpen(false);
      await loadCategories();
      navigate(`/categories/${created.id}`);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      await loadCategories();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError("Failed to delete category");
      }
    }
  };

  return (
    <Box>
      <PageHeader
        title="Categories"
        subtitle="Organize items and configure custom fields for each category"
        action={
          <>
            <Button
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={() => setTemplateDialogOpen(true)}
            >
              Start from Template
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAddCustom}
            >
              New Category
            </Button>
          </>
        }
      />

      <AlertDialog
        open={Boolean(deleteError)}
        onClose={() => setDeleteError(null)}
        title="Cannot Delete Category"
        message={deleteError}
        severity="error"
      />

      {categories.length === 0 && !isLoading ? (
        <EmptyState
          title="No Categories Yet"
          description="Create your first category from a starter template (Medicines, Lights, Tools, Documents) or start from scratch!"
          actionLabel="Start from Template"
          onAction={() => setTemplateDialogOpen(true)}
        />
      ) : (
        <Grid container spacing={2.5}>
          {categories.map((cat) => (
            <Grid key={cat.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
              <Card
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  borderLeft: `6px solid ${cat.color || "#1976d2"}`,
                  transition: "transform 0.15s, box-shadow 0.15s",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: 4,
                  },
                }}
              >
                <CardActionArea
                  onClick={() => navigate(`/categories/${cat.id}`)}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: "space-between",
                  }}
                >
                  <CardContent sx={{ p: 2, flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 110, "&:last-child": { pb: 2 } }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            bgcolor: `${cat.color}20`,
                            color: cat.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {renderMuiIcon(cat.icon, "medium")}
                        </Box>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
                            {cat.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {cat.items_count || 0} items
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex" }}>
                        <Tooltip title="Edit Category Details">
                          <IconButton size="small" onClick={(e) => handleOpenEdit(cat, e)}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Category">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(cat);
                            }}
                          >
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Box sx={{ mt: 1.5, minHeight: 24, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      {cat.track_expiry ? (
                        <Chip
                          label={cat.expiry_label || "Expiry date"}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      ) : (
                        <Box sx={{ height: 24 }} />
                      )}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Start From Template Dialog */}
      <Dialog
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Starter Templates</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose a starter template. All templates come with tailored custom fields that you can freely customize afterwards.
          </Typography>
          <Grid container spacing={2}>
            {templates.map((tpl) => (
              <Grid key={tpl.slug} size={{ xs: 12, sm: 6 }}>
                <Card
                  variant="outlined"
                  sx={{
                    cursor: "pointer",
                    transition: "border-color 0.2s, background-color 0.2s",
                    "&:hover": {
                      borderColor: tpl.color,
                      bgcolor: "action.hover",
                    },
                  }}
                  onClick={() => handleApplyTemplate(tpl.slug)}
                >
                  <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        bgcolor: `${tpl.color}20`,
                        color: tpl.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {renderMuiIcon(tpl.icon)}
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {tpl.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tpl.field_count} custom fields
                        {tpl.track_expiry ? " • Expiry tracking" : ""}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Create / Edit Category Dialog */}
      <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editingCategory ? "Edit Category" : "New Category"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "24px !important" }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Category Error"
            message={errorMsg}
            severity="error"
          />

          <TextField
            label="Category Name"
            placeholder="e.g. Medicines, Tools, Batteries"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
            sx={{ mt: 1 }}
          />

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Icon
              </Typography>
              <IconButton
                onClick={() => setIconPickerOpen(true)}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  color,
                  p: 1.5,
                }}
              >
                {renderMuiIcon(icon)}
              </IconButton>
            </Box>

            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Accent Colour
              </Typography>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                {COLOR_PRESETS.map((c) => (
                  <Box
                    key={c}
                    onClick={() => setColor(c)}
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      bgcolor: c,
                      cursor: "pointer",
                      border: color === c ? "2px solid #fff" : "none",
                      boxShadow: color === c ? "0 0 0 2px #000" : "none",
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={trackExpiry}
                onChange={(e) => setTrackExpiry(e.target.checked)}
              />
            }
            label="Track Expiry Dates for items in this category"
          />

          {trackExpiry && (
            <TextField
              label="Expiry Field Label"
              value={expiryLabel}
              onChange={(e) => setExpiryLabel(e.target.value)}
              helperText="E.g. 'Expiry date' for food/medicine, or 'Valid till' for documents/warranties"
              fullWidth
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryDialogOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveCategory} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Category"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Icon Picker Dialog */}
      <IconPicker
        open={iconPickerOpen}
        selectedIcon={icon}
        onSelect={(newIcon) => setIcon(newIcon)}
        onClose={() => setIconPickerOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Category"
        message={`Are you sure you want to delete '${deleteTarget?.name}'? This action cannot be completed if items are currently assigned to this category.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
};
