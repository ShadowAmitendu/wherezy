import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import { useForm } from "react-hook-form";
import {
  AiBulkItemDraft,
  api,
  ApiException,
  type ImportCsvResult,
  type ImportFormat,
} from "../../api/client";
import { AiCapturePanel } from "../../components/shared/AiCapturePanel";
import { useAiMediaRecorder } from "../../components/shared/useAiMediaRecorder";
import type { Category, FieldDef } from "../forms/types";
import { DynamicFields } from "../forms/DynamicFields";
import { LocationPicker } from "../locations/LocationPicker";
import {
  FlatLocationOption,
  flattenLocationTree,
} from "../locations/locationUtils";
import {
  DATA_FORMAT_OPTIONS,
  detectImportFormatFromFilename,
  getDataFormatOption,
} from "../../utils/exportImportFormats";
import { parsePositiveInt } from "./quantityUtils";

export type BulkAddTab = "list" | "ai" | "csv";

interface AiBulkEditableRow extends AiBulkItemDraft {
  _key: string;
  included: boolean;
}

const AI_BULK_EXAMPLES = [
  {
    label: "Pantry haul",
    prompt: "2x Olive Oil expiring 2027-03-01, 3 bags Basmati Rice 5kg, 1 jar Honey in Kitchen Pantry",
  },
  {
    label: "Hardware & tools",
    prompt: "Bosch cordless drill, 10mm wrench set, 50 M6 stainless screws in Garage Pegboard",
  },
  {
    label: "Receipt / shelf photo",
    prompt: "Extract every distinct item, quantity, expiry date, and spec from the attached photo",
  },
];

interface BulkAddDialogProps {
  open: boolean;
  initialCategoryId?: number | null;
  initialLocationId?: number | null;
  initialTab?: BulkAddTab;
  initialImportFormat?: ImportFormat;
  disablePortal?: boolean;
  onClose: () => void;
  onAdded: (createdCount: number, message?: string, batchId?: string | null) => void;
}

const MAX_BULK_ITEMS = 500;

function getImportHeadersForCategory(category: Category | null, fields: FieldDef[]): string[] {
  const hasCustomQtyField = fields.some(
    (f) => !f.archived && f.label.trim().toLowerCase() === "quantity"
  );
  const headers = ["Name"];
  if (!category) {
    headers.push("Category");
  }
  headers.push("Location");
  if (!hasCustomQtyField) {
    headers.push("Quantity");
  }
  headers.push("Notes");
  if (category?.track_expiry) {
    headers.push("Expiry Date");
  }
  for (const field of fields) {
    if (!field.archived) {
      headers.push(field.label);
    }
  }
  return headers;
}

export const BulkAddDialog: React.FC<BulkAddDialogProps> = ({
  open,
  initialCategoryId,
  initialLocationId = null,
  initialTab = "list",
  initialImportFormat = "csv",
  disablePortal = false,
  onClose,
  onAdded,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<BulkAddTab>(initialTab);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "">("");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [categoryFields, setCategoryFields] = useState<FieldDef[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  // Quick List state
  const [rawNames, setRawNames] = useState("");
  const [quantityStr, setQuantityStr] = useState("1");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  // File Import state (CSV / JSON / Excel)
  const [importFormat, setImportFormat] = useState<ImportFormat>(initialImportFormat);
  const [importCategoryMode, setImportCategoryMode] = useState<"auto" | number>("auto");
  const [importPreviewCategory, setImportPreviewCategory] = useState<Category | null>(null);
  const [importPreviewFields, setImportPreviewFields] = useState<FieldDef[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportCsvResult | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // AI Extract state
  const [aiConfigured, setAiConfigured] = useState(true);
  const [aiCategoryMode, setAiCategoryMode] = useState<"auto" | number>("auto");
  const [aiDefaultLocationId, setAiDefaultLocationId] = useState<number | null>(null);
  const [locationOptions, setLocationOptions] = useState<FlatLocationOption[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiDrafts, setAiDrafts] = useState<AiBulkEditableRow[]>([]);
  const [aiExtracting, setAiExtracting] = useState(false);

  const aiMedia = useAiMediaRecorder(open && tab === "ai");
  const { resetAll: resetAiMedia } = aiMedia;

  // Shared status state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, reset } = useForm<{ values: Record<string, any> }>({
    defaultValues: { values: {} },
  });

  const parsedNames = useMemo(
    () =>
      rawNames
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [rawNames]
  );

  const activeCategoryFields = useMemo(
    () => categoryFields.filter((f) => !f.archived),
    [categoryFields]
  );

  const categoryById = useMemo(() => {
    const map = new Map<number, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const includedAiDrafts = useMemo(
    () => aiDrafts.filter((row) => row.included),
    [aiDrafts]
  );

  // Load categories, location options & reset transient form state when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      api.getCategories(),
      api.getLocationsTree().catch(() => []),
      api.getSettings().catch(() => null),
    ])
      .then(([cats, tree, settings]) => {
        if (cancelled) return;
        setTab(initialTab);
        setImportFormat(initialImportFormat);
        setErrorMsg(null);
        setImportResult(null);
        setImportFile(null);
        setRawNames("");
        setQuantityStr("1");
        setExpiryDate("");
        setNotes("");
        setSelectedLocationId(initialLocationId ?? null);
        setAiDefaultLocationId(initialLocationId ?? null);
        setAiCategoryMode("auto");
        setAiSummary(null);
        setAiDrafts([]);
        setAiExtracting(false);
        resetAiMedia();
        reset({ values: {} });
        setCategories(cats);
        setLocationOptions(flattenLocationTree(tree || []));
        if (settings) {
          setAiConfigured(Boolean(settings.ai_configured));
        }
        const preferred =
          initialCategoryId && cats.some((c: Category) => c.id === initialCategoryId)
            ? initialCategoryId
            : cats[0]?.id ?? "";
        setSelectedCategoryId(preferred);
        setImportCategoryMode(
          initialCategoryId && cats.some((c: Category) => c.id === initialCategoryId)
            ? initialCategoryId
            : "auto"
        );
      })
      .catch(() => {
        if (!cancelled) setErrorMsg("Failed to load categories");
      });

    return () => {
      cancelled = true;
    };
  }, [open, initialCategoryId, initialLocationId, initialTab, initialImportFormat, reset, resetAiMedia]);

  // Fetch active category schema when category selection changes
  useEffect(() => {
    if (!open || !selectedCategoryId) return;

    let cancelled = false;
    api
      .getCategory(Number(selectedCategoryId))
      .then((cat) => {
        if (cancelled) return;
        setActiveCategory(cat);
        setCategoryFields(cat.fields || []);
        reset({ values: {} });
      })
      .catch(() => {
        if (!cancelled) {
          setActiveCategory(null);
          setCategoryFields([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedCategoryId, reset]);

  // Fetch category schema preview for Import File fallback selection
  useEffect(() => {
    if (!open || importCategoryMode === "auto") {
      return;
    }

    let cancelled = false;
    api
      .getCategory(Number(importCategoryMode))
      .then((cat) => {
        if (cancelled) return;
        setImportPreviewCategory(cat);
        setImportPreviewFields(cat.fields || []);
      })
      .catch(() => {
        if (!cancelled) {
          setImportPreviewCategory(null);
          setImportPreviewFields([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, importCategoryMode]);

  const handleTabChange = (_event: React.SyntheticEvent, nextTab: BulkAddTab) => {
    setTab(nextTab);
    setErrorMsg(null);
  };

  const handleQuickListSubmit = async (formData: { values: Record<string, any> }) => {
    setErrorMsg(null);
    if (!selectedCategoryId) {
      setErrorMsg("Please choose a category first.");
      return;
    }
    if (parsedNames.length === 0) {
      setErrorMsg("Enter at least one item name (one per line).");
      return;
    }
    if (parsedNames.length > MAX_BULK_ITEMS) {
      setErrorMsg(`Maximum ${MAX_BULK_ITEMS} items can be added in one batch (currently ${parsedNames.length}).`);
      return;
    }
    const parsedQty = parsePositiveInt(quantityStr);
    if (parsedQty === null) {
      setErrorMsg("Default quantity must be a whole number of at least 1.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.bulkCreate({
        category_id: Number(selectedCategoryId),
        quantity: parsedQty,
        location_id: selectedLocationId,
        expiry_date: activeCategory?.track_expiry ? expiryDate.trim() || null : null,
        notes: notes.trim() || null,
        values: formData.values || {},
        items: parsedNames.map((name) => ({ name })),
      });
      onAdded(
        res.created_count,
        `Added ${res.created_count} ${res.created_count === 1 ? "item" : "items"} to ${activeCategory?.name || "inventory"}`,
        res.batch_id
      );
      onClose();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to create items in bulk.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtractWithAi = async () => {
    setErrorMsg(null);
    if (aiMedia.isRecording) {
      setErrorMsg("Please stop the active voice recording first.");
      return;
    }
    if (!aiMedia.prompt.trim() && !aiMedia.audioDraft && !aiMedia.imageDraft) {
      setErrorMsg("Paste a list, record a voice message, or attach a receipt/shelf photo first.");
      return;
    }
    if (categories.length === 0) {
      setErrorMsg("Create at least one category before extracting items.");
      return;
    }

    setAiExtracting(true);
    try {
      const res = await api.bulkExtractItemsWithAi({
        prompt: aiMedia.prompt,
        audio: aiMedia.audioDraft?.blob ?? null,
        audioFilename: aiMedia.audioDraft?.filename,
        image: aiMedia.imageDraft?.file ?? null,
        imageFilename: aiMedia.imageDraft?.file.name,
        preferredCategoryId:
          aiCategoryMode === "auto"
            ? selectedCategoryId
              ? Number(selectedCategoryId)
              : null
            : aiCategoryMode,
        preferredLocationId: aiDefaultLocationId,
        lockCategory: aiCategoryMode !== "auto",
      });
      setAiSummary(
        res.summary || `Extracted ${res.items.length} item${res.items.length === 1 ? "" : "s"}. Review before creating.`
      );
      setAiDrafts(
        res.items.map((item, idx) => ({
          ...item,
          _key: `ai-${Date.now()}-${idx}`,
          included: true,
        }))
      );
      if (res.items.length === 0) {
        setErrorMsg("AI did not find any distinct items in that input. Add more detail or try another file.");
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        if (err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        }
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to extract items with AI.");
      }
    } finally {
      setAiExtracting(false);
    }
  };

  const handleUpdateAiRow = (key: string, patch: Partial<AiBulkEditableRow>) => {
    setAiDrafts((prev) => prev.map((row) => (row._key === key ? { ...row, ...patch } : row)));
  };

  const handleRemoveAiRow = (key: string) => {
    setAiDrafts((prev) => prev.filter((row) => row._key !== key));
  };

  const handleAddBlankAiRow = () => {
    const fallbackCatId =
      aiCategoryMode !== "auto"
        ? aiCategoryMode
        : selectedCategoryId
          ? Number(selectedCategoryId)
          : categories[0]?.id || 0;
    const cat = categoryById.get(fallbackCatId);
    setAiDrafts((prev) => [
      ...prev,
      {
        _key: `manual-${Date.now()}-${prev.length}`,
        name: "",
        category_id: fallbackCatId,
        category_name: cat?.name || null,
        location_id: aiDefaultLocationId,
        location_path: null,
        quantity: 1,
        expiry_date: null,
        notes: null,
        values: {},
        included: true,
      },
    ]);
  };

  const handleCommitAiDrafts = async () => {
    setErrorMsg(null);
    if (includedAiDrafts.length === 0) {
      setErrorMsg("Select at least one extracted item to create.");
      return;
    }
    for (let i = 0; i < includedAiDrafts.length; i += 1) {
      const row = includedAiDrafts[i];
      if (!row.name.trim()) {
        setErrorMsg(`Row #${i + 1}: item name cannot be blank.`);
        return;
      }
      if (!row.category_id) {
        setErrorMsg(`"${row.name}": please choose a category.`);
        return;
      }
      if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 1) {
        setErrorMsg(`"${row.name}": quantity must be at least 1.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await api.bulkCommitAiItems(
        includedAiDrafts.map((row) => ({
          name: row.name.trim(),
          category_id: Number(row.category_id),
          location_id: row.location_id ?? null,
          quantity: Math.max(1, Math.floor(Number(row.quantity))),
          expiry_date: row.expiry_date?.trim() || null,
          notes: row.notes?.trim() || null,
          values: row.values || {},
        }))
      );
      onAdded(
        res.created_count,
        `Added ${res.created_count} ${res.created_count === 1 ? "item" : "items"} via AI Extract`,
        res.batch_id
      );
      onClose();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to save extracted items.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeImportFormatOption = getDataFormatOption(importFormat);

  const handleImportFormatChange = (nextFormat: ImportFormat) => {
    setImportFormat(nextFormat);
    setImportResult(null);
    setErrorMsg(null);
    if (importFile) {
      const detected = detectImportFormatFromFilename(importFile.name);
      if (detected && detected !== nextFormat) {
        setImportFile(null);
      }
    }
  };

  const handleSelectImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] || null;
    event.target.value = "";
    if (picked) {
      const detected = detectImportFormatFromFilename(picked.name);
      if (detected && detected !== importFormat) {
        setImportFormat(detected);
      }
    }
    setImportFile(picked);
    setImportResult(null);
    setErrorMsg(null);
  };

  const handleDownloadImportTemplate = async () => {
    setErrorMsg(null);
    setDownloadingTemplate(true);
    try {
      await api.downloadImportTemplate(
        importFormat,
        importCategoryMode === "auto" ? null : importCategoryMode
      );
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg(`Failed to download ${activeImportFormatOption.shortLabel} template.`);
      }
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImportAction = async (dryRun: boolean) => {
    setErrorMsg(null);
    if (!importFile) {
      setErrorMsg(`Please select a ${activeImportFormatOption.extension} file to process.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.importItems(importFormat, importFile, {
        categoryId: importCategoryMode === "auto" ? null : importCategoryMode,
        dryRun,
        locationId: selectedLocationId,
      });
      setImportResult(result);

      if (!dryRun && result.ok) {
        onAdded(
          result.imported_count,
          `Imported ${result.imported_count} ${result.imported_count === 1 ? "item" : "items"} from ${activeImportFormatOption.shortLabel}`,
          result.batch_id
        );
        onClose();
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg(`Failed to process ${activeImportFormatOption.shortLabel} file.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveImportPreviewCategory =
    importCategoryMode !== "auto" && importPreviewCategory?.id === importCategoryMode
      ? importPreviewCategory
      : null;
  const activeImportFields = useMemo(
    () => (effectiveImportPreviewCategory ? importPreviewFields.filter((f) => !f.archived) : []),
    [effectiveImportPreviewCategory, importPreviewFields]
  );
  const importTemplateHeaders = getImportHeadersForCategory(effectiveImportPreviewCategory, activeImportFields);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      disablePortal={disablePortal}
      maxWidth={tab === "ai" && aiDrafts.length > 0 ? "lg" : "md"}
      fullWidth
      fullScreen={isMobile}
      slotProps={{
        transition: {
          onExited: resetAiMedia,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: { xs: 2, sm: 3 },
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PlaylistAddIcon color="primary" />
          <span>Bulk Add Items</span>
        </Box>
        <IconButton onClick={onClose} size="small" edge="end" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: { xs: 2, sm: 3 } }}>
        <Tabs value={tab} onChange={handleTabChange}>
          <Tab
            value="list"
            label="Quick List"
            icon={<PlaylistAddIcon fontSize="small" />}
            iconPosition="start"
          />
          <Tab
            value="ai"
            label="AI Extract"
            icon={<AutoAwesomeIcon fontSize="small" />}
            iconPosition="start"
          />
          <Tab
            value="csv"
            label="Import File"
            icon={<UploadFileOutlinedIcon fontSize="small" />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {tab === "list" ? (
        <form
          onSubmit={handleSubmit(handleQuickListSubmit)}
          style={{ display: "flex", flexDirection: "column", flexGrow: 1, overflow: "hidden" }}
        >
          <DialogContent sx={{ pt: 2.5, px: { xs: 2, sm: 3 }, flexGrow: 1, overflowY: "auto" }}>
            {errorMsg && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
                {errorMsg}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
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
                  Shared Defaults for All Items
                </Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth required>
                      <InputLabel id="bulk-list-category-label">Category</InputLabel>
                      <Select
                        labelId="bulk-list-category-label"
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

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <LocationPicker
                      value={selectedLocationId}
                      onChange={setSelectedLocationId}
                      label="Storage Location (Optional)"
                      emptyLabel="Unspecified"
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Default Quantity"
                      type="number"
                      value={quantityStr}
                      onChange={(e) => setQuantityStr(e.target.value)}
                      fullWidth
                      slotProps={{
                        htmlInput: { min: 1, step: 1, style: { fontFamily: "var(--font-mono)" } },
                      }}
                      helperText="Applied to each item (min 1)"
                    />
                  </Grid>

                  {activeCategory?.track_expiry && (
                    <Grid size={{ xs: 12, sm: 8 }}>
                      <TextField
                        label={`${activeCategory.expiry_label || "Expiry Date"} (Optional)`}
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Grid>
                  )}

                  <Grid size={{ xs: 12, sm: activeCategory?.track_expiry ? 12 : 8 }}>
                    <TextField
                      label="Shared Notes (Optional)"
                      placeholder="e.g. Stocked from weekend grocery trip"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </Box>

              {activeCategoryFields.length > 0 && (
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
                    Shared {activeCategory?.name || "Category"} Details
                  </Typography>
                  <DynamicFields fields={activeCategoryFields} control={control} />
                </Box>
              )}

              <Box>
                <Divider sx={{ mb: 2 }} />
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 1,
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: "primary.main",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontSize: "0.75rem",
                    }}
                  >
                    Item Names (One Per Line)
                  </Typography>
                  <Chip
                    size="small"
                    color={parsedNames.length > MAX_BULK_ITEMS ? "error" : parsedNames.length > 0 ? "primary" : "default"}
                    label={`${parsedNames.length} ${parsedNames.length === 1 ? "item" : "items"}`}
                  />
                </Box>

                <TextField
                  multiline
                  minRows={6}
                  maxRows={12}
                  fullWidth
                  placeholder={"AA Batteries\nAAA Batteries\nUSB-C Cable\nHDMI Adapter"}
                  value={rawNames}
                  onChange={(e) => setRawNames(e.target.value)}
                  helperText={`Blank lines are ignored automatically (up to ${MAX_BULK_ITEMS} items per batch).`}
                  autoFocus
                />
              </Box>
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, borderTop: 1, borderColor: "divider" }}>
            <Button onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || parsedNames.length === 0 || parsedNames.length > MAX_BULK_ITEMS}
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : <PlaylistAddIcon />}
            >
              {isSubmitting
                ? "Adding..."
                : `Add ${parsedNames.length || ""} ${parsedNames.length === 1 ? "Item" : "Items"}`}
            </Button>
          </DialogActions>
        </form>
      ) : tab === "ai" ? (
        <>
          <DialogContent sx={{ pt: 2.5, px: { xs: 2, sm: 3 }, flexGrow: 1, overflowY: "auto" }}>
            {errorMsg && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
                {errorMsg}
              </Alert>
            )}

            <Stack spacing={2.25}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="bulk-ai-category-mode-label">Category Mode</InputLabel>
                    <Select
                      labelId="bulk-ai-category-mode-label"
                      value={aiCategoryMode === "auto" ? "auto" : String(aiCategoryMode)}
                      label="Category Mode"
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiCategoryMode(val === "auto" ? "auto" : Number(val));
                      }}
                      disabled={aiExtracting || isSubmitting}
                    >
                      <MenuItem value="auto">Auto-detect per item (mixed categories)</MenuItem>
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={String(c.id)}>
                          Always use: {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <LocationPicker
                    size="small"
                    value={aiDefaultLocationId}
                    onChange={setAiDefaultLocationId}
                    label="Default Location (Optional)"
                    emptyLabel="Auto-detect / Unspecified"
                  />
                </Grid>
              </Grid>

              {aiExtracting && <LinearProgress color="secondary" />}

              <AiCapturePanel
                media={aiMedia}
                aiConfigured={aiConfigured}
                disabled={aiExtracting || isSubmitting}
                promptLabel="Speak, paste a messy list, or snap a receipt / shelf photo"
                promptPlaceholder="e.g. 2x AA Battery packs, 1 USB-C hub, ibuprofen 400mg expiring 2027-06-01..."
                examples={AI_BULK_EXAMPLES}
                allowImage
                imageSectionTitle="Receipt / Shelf / Pantry Photo (Optional)"
                imageSectionSubtitle="Snap groceries, receipts, toolbox drawers, or shelves for multi-item extraction"
                promptRows={3}
                onNavigateSettings={onClose}
              />

              {aiSummary && (
                <Alert severity="success" onClose={() => setAiSummary(null)}>
                  {aiSummary}
                </Alert>
              )}

              {aiDrafts.length > 0 && (
                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 1,
                      mb: 1,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Review Extracted Items ({includedAiDrafts.length} of {aiDrafts.length} selected)
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddBlankAiRow}
                      disabled={isSubmitting || aiExtracting}
                    >
                      Add Row
                    </Button>
                  </Box>

                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 340 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={
                                aiDrafts.length > 0 && includedAiDrafts.length === aiDrafts.length
                              }
                              indeterminate={
                                includedAiDrafts.length > 0 &&
                                includedAiDrafts.length < aiDrafts.length
                              }
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setAiDrafts((prev) => prev.map((r) => ({ ...r, included: checked })));
                              }}
                              disabled={isSubmitting}
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 165 }}>Name</TableCell>
                          <TableCell sx={{ minWidth: 145 }}>Category</TableCell>
                          <TableCell sx={{ minWidth: 145 }}>Location</TableCell>
                          <TableCell sx={{ width: 82 }}>Qty</TableCell>
                          <TableCell sx={{ minWidth: 140 }}>Expiry</TableCell>
                          <TableCell sx={{ minWidth: 170 }}>Details / Notes</TableCell>
                          <TableCell align="right" sx={{ width: 48 }} />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {aiDrafts.map((row) => {
                          const rowCat = categoryById.get(Number(row.category_id));
                          const fieldPairs = Object.entries(row.values || {}).filter(
                            ([, val]) => val !== null && val !== undefined && val !== ""
                          );
                          return (
                            <TableRow key={row._key} hover selected={row.included}>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  size="small"
                                  checked={row.included}
                                  onChange={(e) =>
                                    handleUpdateAiRow(row._key, { included: e.target.checked })
                                  }
                                  disabled={isSubmitting}
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  size="small"
                                  fullWidth
                                  value={row.name}
                                  placeholder="Item name"
                                  onChange={(e) =>
                                    handleUpdateAiRow(row._key, { name: e.target.value })
                                  }
                                  disabled={isSubmitting}
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  size="small"
                                  fullWidth
                                  value={row.category_id ? String(row.category_id) : ""}
                                  onChange={(e) =>
                                    handleUpdateAiRow(row._key, {
                                      category_id: Number(e.target.value),
                                    })
                                  }
                                  disabled={isSubmitting || aiCategoryMode !== "auto"}
                                >
                                  {categories.map((c) => (
                                    <MenuItem key={c.id} value={String(c.id)}>
                                      {c.name}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select
                                  size="small"
                                  fullWidth
                                  displayEmpty
                                  value={row.location_id ? String(row.location_id) : ""}
                                  onChange={(e) =>
                                    handleUpdateAiRow(row._key, {
                                      location_id: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  disabled={isSubmitting}
                                >
                                  <MenuItem value="">
                                    <em>Unspecified</em>
                                  </MenuItem>
                                  {locationOptions.map((loc) => (
                                    <MenuItem key={loc.id} value={String(loc.id)}>
                                      {loc.path}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </TableCell>
                              <TableCell>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={row.quantity}
                                  onChange={(e) =>
                                    handleUpdateAiRow(row._key, {
                                      quantity: Math.max(1, Number(e.target.value) || 1),
                                    })
                                  }
                                  slotProps={{
                                    htmlInput: {
                                      min: 1,
                                      step: 1,
                                      style: { fontFamily: "var(--font-mono)" },
                                    },
                                  }}
                                  disabled={isSubmitting}
                                />
                              </TableCell>
                              <TableCell>
                                {rowCat?.track_expiry ? (
                                  <TextField
                                    size="small"
                                    type="date"
                                    value={row.expiry_date || ""}
                                    onChange={(e) =>
                                      handleUpdateAiRow(row._key, {
                                        expiry_date: e.target.value || null,
                                      })
                                    }
                                    slotProps={{ inputLabel: { shrink: true } }}
                                    disabled={isSubmitting}
                                  />
                                ) : (
                                  <Typography variant="caption" color="text.disabled">
                                    —
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                <Stack spacing={0.5}>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="Notes"
                                    value={row.notes || ""}
                                    onChange={(e) =>
                                      handleUpdateAiRow(row._key, {
                                        notes: e.target.value || null,
                                      })
                                    }
                                    disabled={isSubmitting}
                                  />
                                  {fieldPairs.length > 0 && (
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                      {fieldPairs.map(([key, val]) => (
                                        <Chip
                                          key={key}
                                          size="small"
                                          variant="outlined"
                                          label={`${key}: ${Array.isArray(val) ? val.join(", ") : String(val)}`}
                                          sx={{ height: 20, fontSize: "0.68rem" }}
                                        />
                                      ))}
                                    </Box>
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="Remove row">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleRemoveAiRow(row._key)}
                                    disabled={isSubmitting}
                                  >
                                    <DeleteOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Stack>
          </DialogContent>

          <DialogActions
            sx={{ px: { xs: 2, sm: 3 }, py: 2, borderTop: 1, borderColor: "divider", flexWrap: "wrap", gap: 1 }}
          >
            <Button onClick={onClose} disabled={isSubmitting || aiExtracting}>
              Cancel
            </Button>
            <Button
              variant={aiDrafts.length > 0 ? "outlined" : "contained"}
              color="secondary"
              startIcon={
                aiExtracting ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />
              }
              onClick={() => void handleExtractWithAi()}
              disabled={
                aiExtracting ||
                isSubmitting ||
                aiMedia.isRecording ||
                (!aiMedia.prompt.trim() && !aiMedia.audioDraft && !aiMedia.imageDraft)
              }
            >
              {aiExtracting
                ? "Extracting..."
                : aiDrafts.length > 0
                  ? "Re-extract"
                  : "Extract Items"}
            </Button>
            {aiDrafts.length > 0 && (
              <Button
                variant="contained"
                startIcon={
                  isSubmitting ? <CircularProgress size={16} color="inherit" /> : <PlaylistAddIcon />
                }
                onClick={() => void handleCommitAiDrafts()}
                disabled={isSubmitting || aiExtracting || includedAiDrafts.length === 0}
              >
                {isSubmitting
                  ? "Creating..."
                  : `Create ${includedAiDrafts.length} ${includedAiDrafts.length === 1 ? "Item" : "Items"}`}
              </Button>
            )}
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent sx={{ pt: 2.5, px: { xs: 2, sm: 3 }, flexGrow: 1, overflowY: "auto" }}>
            {errorMsg && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
                {errorMsg}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel id="bulk-import-format-label">Import Format</InputLabel>
                    <Select
                      labelId="bulk-import-format-label"
                      value={importFormat}
                      label="Import Format"
                      onChange={(e) => handleImportFormatChange(e.target.value as ImportFormat)}
                    >
                      {DATA_FORMAT_OPTIONS.map((opt) => (
                        <MenuItem key={opt.format} value={opt.format}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel id="bulk-import-category-label">Category (Fallback)</InputLabel>
                    <Select
                      labelId="bulk-import-category-label"
                      value={importCategoryMode === "auto" ? "auto" : String(importCategoryMode)}
                      label="Category (Fallback)"
                      onChange={(e) => {
                        const val = e.target.value;
                        setImportCategoryMode(val === "auto" ? "auto" : Number(val));
                        setImportResult(null);
                      }}
                    >
                      <MenuItem value="auto">Auto-detect from file</MenuItem>
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <LocationPicker
                    value={selectedLocationId}
                    onChange={setSelectedLocationId}
                    label="Default Location (Fallback)"
                    emptyLabel="Unspecified"
                  />
                </Grid>
              </Grid>

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1.5,
                    flexWrap: "wrap",
                    mb: 1,
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {activeImportFormatOption.label} Structure
                      {effectiveImportPreviewCategory ? ` for ${effectiveImportPreviewCategory.name}` : " (Multi-Category Supported)"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {importFormat === "json"
                        ? "Supports a Wherezy JSON export or array of item objects with name, category, location, quantity, notes, and values."
                        : importFormat === "xlsx"
                        ? "Supports single-sheet spreadsheets and full Wherezy Inventory Book (.xlsx) exports. Blank Location cells fall back to Default Location."
                        : "Use location names or full paths (e.g. Kitchen > Top Shelf). Blank Location cells fall back to Default Location."}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={downloadingTemplate ? <CircularProgress size={14} /> : <DownloadOutlinedIcon />}
                    onClick={() => void handleDownloadImportTemplate()}
                    disabled={downloadingTemplate}
                  >
                    Download {activeImportFormatOption.shortLabel} Template
                  </Button>
                </Box>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
                  {importTemplateHeaders.map((header) => {
                    const matchedField = activeImportFields.find((f) => f.label === header);
                    const isRequired =
                      header === "Name" ||
                      (header === "Category" && importCategoryMode === "auto") ||
                      Boolean(matchedField?.required);
                    return (
                      <Chip
                        key={header}
                        size="small"
                        variant={isRequired ? "filled" : "outlined"}
                        color={isRequired ? "primary" : "default"}
                        label={isRequired ? `${header} *` : header}
                      />
                    );
                  })}
                </Box>
              </Paper>

              <Box>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={activeImportFormatOption.accept}
                  style={{ display: "none" }}
                  onChange={handleSelectImportFile}
                />
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderStyle: "dashed",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {importFile
                        ? importFile.name
                        : `Choose a ${activeImportFormatOption.extension} file to import`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {importFile
                        ? `${Math.max(1, Math.round(importFile.size / 1024))} KB • Click Preview / Validate before importing`
                        : "Required: Name (and Category if Auto-detect is active). Dates should use YYYY-MM-DD."}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<UploadFileOutlinedIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    {importFile ? "Change File" : `Select ${activeImportFormatOption.shortLabel} File`}
                  </Button>
                </Paper>
              </Box>

              {importResult && (
                <Alert severity={importResult.ok ? "success" : "error"}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {importResult.ok
                      ? importResult.dry_run
                        ? `Preview passed: ${importResult.imported_count} of ${importResult.total_rows} rows ready to import.`
                        : `Imported ${importResult.imported_count} items.`
                      : `Found ${importResult.errors.length} ${importResult.errors.length === 1 ? "issue" : "issues"} across ${importResult.total_rows} rows (no items imported).`}
                  </Typography>
                  {importResult.errors.length > 0 && (
                    <List dense disablePadding sx={{ maxHeight: 160, overflowY: "auto", mt: 1 }}>
                      {importResult.errors.slice(0, 50).map((errText, idx) => (
                        <ListItem key={`${idx}-${errText}`} disableGutters sx={{ py: 0.25 }}>
                          <Typography variant="caption">{errText}</Typography>
                        </ListItem>
                      ))}
                      {importResult.errors.length > 50 && (
                        <ListItem disableGutters sx={{ py: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            {`...and ${importResult.errors.length - 50} more errors.`}
                          </Typography>
                        </ListItem>
                      )}
                    </List>
                  )}
                </Alert>
              )}
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, borderTop: 1, borderColor: "divider", flexWrap: "wrap", gap: 1 }}>
            <Button onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="outlined"
              startIcon={isSubmitting ? <CircularProgress size={16} /> : <FactCheckOutlinedIcon />}
              onClick={() => handleImportAction(true)}
              disabled={isSubmitting || !importFile}
            >
              Preview / Validate
            </Button>
            <Button
              variant="contained"
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : <UploadFileOutlinedIcon />}
              onClick={() => handleImportAction(false)}
              disabled={isSubmitting || !importFile}
            >
              Import Items
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
