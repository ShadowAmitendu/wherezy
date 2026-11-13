import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  CardActions,
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
  Grid,
  Grow,
  Chip,
  Tabs,
  Tab,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import { PageHeader } from "../../components/shared/PageHeader";
import { EmptyState } from "../../components/shared/EmptyState";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { IconPicker } from "../../components/shared/IconPicker";
import { renderMuiIcon } from "../../components/shared/iconUtils";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { useUndo, useOnUndoRefresh } from "../../components/shared/UndoContext";
import { useAuth } from "../../auth/useAuth";
import { ColorSwatchPicker } from "../../components/shared/ColorSwatchPicker";
import { AICategoryDialog } from "./AICategoryDialog";
import { CategoryCard } from "./CategoryCard";
import { TemplateCustomizeDialog } from "./TemplateCustomizeDialog";
import { api, ApiException } from "../../api/client";
import { Category } from "./types";

export const CategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { currentProfile } = useAuth();
  const { showUndo } = useUndo();
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Template modal
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilterTab, setTemplateFilterTab] = useState<"all" | "starter" | "custom">("all");
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<any | null>(null);

  // Template customize / create / edit dialog
  const [customizeDialogOpen, setCustomizeDialogOpen] = useState(false);
  const [customizeMode, setCustomizeMode] = useState<"customize_apply" | "create_custom" | "edit_custom">("customize_apply");
  const [selectedTemplateSlug, setSelectedTemplateSlug] = useState<string | undefined>(undefined);

  // AI category dialog
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
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

  const handleOpenCustomizeApply = (slug: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTemplateSlug(slug);
    setCustomizeMode("customize_apply");
    setTemplateDialogOpen(false);
    setCustomizeDialogOpen(true);
  };

  const handleOpenCreateCustomTemplate = () => {
    setSelectedTemplateSlug(undefined);
    setCustomizeMode("create_custom");
    setTemplateDialogOpen(false);
    setCustomizeDialogOpen(true);
  };

  const handleOpenEditCustomTemplate = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTemplateSlug(slug);
    setCustomizeMode("edit_custom");
    setTemplateDialogOpen(false);
    setCustomizeDialogOpen(true);
  };

  const handleDeleteCustomTemplate = async () => {
    if (!deleteTemplateTarget) return;
    try {
      await api.deleteCustomTemplate(deleteTemplateTarget.slug);
      showUndo({
        message: `Deleted custom template "${deleteTemplateTarget.name}"`,
        onUndo: async () => {
          // Re-create from payload if available, or just refresh
          await loadTemplates();
        },
      });
      setDeleteTemplateTarget(null);
      await loadTemplates();
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([api.getCategories(), api.getTemplates()])
      .then(([cats, tpls]) => {
        if (!active) return;
        setCategories(cats);
        setTemplates(tpls);
      })
      .catch((err) => {
        if (active) console.error(err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
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
        const editedId = editingCategory.id;
        const prevSnapshot = {
          name: editingCategory.name,
          icon: editingCategory.icon,
          color: editingCategory.color,
          track_expiry: editingCategory.track_expiry,
          expiry_label: editingCategory.expiry_label || null,
        };
        const updated = await api.updateCategory(editedId, {
          name: name.trim(),
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || null,
        });
        showUndo({
          message: `Updated category "${updated.name}"`,
          onUndo: async () => {
            await api.updateCategory(editedId, prevSnapshot);
          },
        });
      } else {
        const created = await api.createCategory({
          name: name.trim(),
          icon,
          color,
          track_expiry: trackExpiry,
          expiry_label: expiryLabel.trim() || null,
        });
        if (created?.id) {
          showUndo({
            message: `Created category "${created.name}"`,
            onUndo: async () => {
              await api.deleteCategory(created.id);
            },
          });
        }
      }
      setCategoryDialogOpen(false);
      await loadCategories();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  };

  useOnUndoRefresh(() => {
    void loadCategories();
  });

  const closeTemplateDialog = () => {
    setTemplateDialogOpen(false);
    setTemplateSearch("");
  };

  const handleApplyTemplate = async (slug: string) => {
    try {
      setIsLoading(true);
      const created = await api.applyTemplate(slug);
      closeTemplateDialog();
      await loadCategories();
      if (created?.id) {
        showUndo({
          message: `Created "${created.name}" from template`,
          onUndo: async () => {
            await api.deleteCategory(created.id);
          },
        });
      }
      navigate(`/categories/${created.id}`);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    const deletedName = deleteTarget.name;
    try {
      await api.deleteCategory(deletedId);
      setDeleteTarget(null);
      await loadCategories();
      if (currentProfile?.role === "admin") {
        showUndo({
          message: `Deleted category "${deletedName}"`,
          onUndo: async () => {
            await api.restoreTrash("category", deletedId);
          },
        });
      }
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
        subtitle="Organize items and custom fields"
        icon={<CategoryOutlinedIcon />}
        action={
          <>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setAiDialogOpen(true)}
            >
              AI Create
            </Button>
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
          description={`Create your first category from ${Math.max(templates.filter((t) => t.slug !== "blank").length, 27)} ready-made starter templates, generate one with AI, or start from scratch!`}
          actionLabel="Start from Template"
          onAction={() => setTemplateDialogOpen(true)}
        />
      ) : (
        <Grid container spacing={2.5}>
          {categories.map((cat, idx) => (
            <Grid key={cat.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
              <Grow in={!isLoading} appear timeout={Math.min(200 + idx * 45, 480)}>
                <Box sx={{ width: "100%", display: "flex" }}>
                  <CategoryCard
                    category={cat}
                    onClick={(c) => navigate(`/categories/${c.id}`)}
                    onEdit={handleOpenEdit}
                    onDelete={(c) => setDeleteTarget(c)}
                  />
                </Box>
              </Grow>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Start From Template Dialog */}
      <Dialog
        open={templateDialogOpen}
        onClose={closeTemplateDialog}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Box>
            <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
              Category Templates
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Choose a starter template or build and customize your own reusable templates
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateCustomTemplate}
          >
            New Custom Template
          </Button>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
            <Tabs
              value={templateFilterTab}
              onChange={(_, val) => setTemplateFilterTab(val)}
              textColor="primary"
              indicatorColor="primary"
            >
              <Tab label={`All (${templates.length})`} value="all" />
              <Tab label={`Starter (${templates.filter((t) => !t.is_custom).length})`} value="starter" />
              <Tab label={`Custom (${templates.filter((t) => t.is_custom).length})`} value="custom" />
            </Tabs>
          </Box>

          <TextField
            size="small"
            fullWidth
            placeholder="Search templates (e.g. Festivals, Puja, Pantry, Sarees, Inverter)..."
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            sx={{ mb: 2 }}
          />

          {templates
            .filter((tpl) => {
              if (templateFilterTab === "starter" && tpl.is_custom) return false;
              if (templateFilterTab === "custom" && !tpl.is_custom) return false;
              const q = templateSearch.trim().toLowerCase();
              if (!q) return true;
              return (
                String(tpl.name || "").toLowerCase().includes(q) ||
                String(tpl.slug || "").toLowerCase().includes(q)
              );
            }).length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center" }}>
              <Typography variant="body1" color="text.secondary">
                No templates found matching your search.
              </Typography>
              {templateFilterTab === "custom" && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleOpenCreateCustomTemplate}
                  sx={{ mt: 1.5 }}
                >
                  Create Your First Custom Template
                </Button>
              )}
            </Box>
          ) : (
            <Grid container spacing={2}>
              {templates
                .filter((tpl) => {
                  if (templateFilterTab === "starter" && tpl.is_custom) return false;
                  if (templateFilterTab === "custom" && !tpl.is_custom) return false;
                  const q = templateSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    String(tpl.name || "").toLowerCase().includes(q) ||
                    String(tpl.slug || "").toLowerCase().includes(q)
                  );
                })
                .map((tpl) => (
                <Grid key={tpl.slug} size={{ xs: 12, sm: 6 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: (t) =>
                        t.transitions.create(["border-color", "background-color", "transform", "box-shadow"], {
                          duration: t.transitions.duration.shorter,
                          easing: t.transitions.easing.easeInOut,
                        }),
                      "&:hover": {
                        borderColor: tpl.color,
                        bgcolor: "action.hover",
                        boxShadow: 2,
                      },
                    }}
                  >
                    <CardContent sx={{ pb: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
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
                              flexShrink: 0,
                            }}
                          >
                            {renderMuiIcon(tpl.icon)}
                          </Box>
                          <Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                {tpl.name}
                              </Typography>
                              {tpl.is_custom && (
                                <Chip
                                  label="Custom"
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600 }}
                                />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {tpl.field_count} custom fields
                              {tpl.track_expiry ? " • Expiry tracking" : ""}
                            </Typography>
                          </Box>
                        </Box>

                        {tpl.is_custom && (
                          <Box sx={{ display: "flex", alignItems: "center" }}>
                            <Tooltip title="Edit Custom Template">
                              <IconButton
                                size="small"
                                onClick={(e) => handleOpenEditCustomTemplate(tpl.slug, e)}
                                aria-label="Edit template"
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Custom Template">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTemplateTarget(tpl);
                                }}
                                aria-label="Delete template"
                              >
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </Box>
                    </CardContent>

                    <CardActions sx={{ px: 2, pb: 1.5, pt: 0, display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<TuneIcon />}
                        onClick={() => handleOpenCustomizeApply(tpl.slug)}
                      >
                        Customize & Use
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<AutoFixHighIcon />}
                        onClick={() => handleApplyTemplate(tpl.slug)}
                      >
                        Quick Apply
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTemplateDialog}>Cancel</Button>
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
              <ColorSwatchPicker
                value={color}
                onChange={setColor}
                label="Accent Colour"
                size={26}
              />
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

      {/* AI Category Builder Dialog */}
      <AICategoryDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        onCreated={(created, optimizationSummary) => {
          setAiDialogOpen(false);
          void loadCategories();
          navigate(`/categories/${created.id}`, {
            state: optimizationSummary ? { aiSummary: optimizationSummary } : undefined,
          });
        }}
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

      {/* Delete Custom Template Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTemplateTarget)}
        title="Delete Custom Template"
        message={`Are you sure you want to delete the custom template '${deleteTemplateTarget?.name}'? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteCustomTemplate}
        onCancel={() => setDeleteTemplateTarget(null)}
      />

      {/* Template Customize / Create / Edit Dialog */}
      <TemplateCustomizeDialog
        open={customizeDialogOpen}
        mode={customizeMode}
        templateSlug={selectedTemplateSlug}
        onClose={() => {
          setCustomizeDialogOpen(false);
          setSelectedTemplateSlug(undefined);
        }}
        onSuccess={async (cat?: any) => {
          setCustomizeDialogOpen(false);
          setSelectedTemplateSlug(undefined);
          await loadTemplates();
          await loadCategories();
          if (cat?.id) {
            navigate(`/categories/${cat.id}`);
          }
        }}
      />
    </Box>
  );
};
