import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
  List,
  ListItem,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import { useForm } from "react-hook-form";
import { api, ApiException, type ImportCsvResult } from "../../api/client";
import type { Category, FieldDef } from "../forms/types";
import { DynamicFields } from "../forms/DynamicFields";
import { LocationPicker } from "../locations/LocationPicker";

export type BulkAddTab = "list" | "csv";

interface BulkAddDialogProps {
  open: boolean;
  initialCategoryId?: number | null;
  initialLocationId?: number | null;
  initialTab?: BulkAddTab;
  onClose: () => void;
  onAdded: (createdCount: number, message?: string) => void;
}

const MAX_BULK_ITEMS = 500;

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getCsvHeadersForCategory(category: Category | null, fields: FieldDef[]): string[] {
  const headers = ["Name", "Location"];
  if (category?.track_expiry) {
    headers.push("Expiry Date");
  }
  headers.push("Notes");
  for (const field of fields) {
    if (!field.archived) {
      headers.push(field.label);
    }
  }
  return headers;
}

function downloadCategoryCsvTemplate(category: Category | null, fields: FieldDef[]): void {
  const headers = getCsvHeadersForCategory(category, fields);
  const csvContent = `${headers.map(escapeCsvCell).join(",")}\r\n`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const slug = (category?.name || "items")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `wherezy-${slug || "items"}-template.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const BulkAddDialog: React.FC<BulkAddDialogProps> = ({
  open,
  initialCategoryId,
  initialLocationId = null,
  initialTab = "list",
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
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<ImportCsvResult | null>(null);

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

  // Load categories & reset transient form state when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .getCategories()
      .then((cats) => {
        if (cancelled) return;
        setTab(initialTab);
        setErrorMsg(null);
        setCsvResult(null);
        setCsvFile(null);
        setRawNames("");
        setExpiryDate("");
        setNotes("");
        setSelectedLocationId(initialLocationId ?? null);
        reset({ values: {} });
        setCategories(cats);
        const preferred =
          initialCategoryId && cats.some((c: Category) => c.id === initialCategoryId)
            ? initialCategoryId
            : cats[0]?.id ?? "";
        setSelectedCategoryId(preferred);
      })
      .catch(() => {
        if (!cancelled) setErrorMsg("Failed to load categories");
      });

    return () => {
      cancelled = true;
    };
  }, [open, initialCategoryId, initialLocationId, initialTab, reset]);

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
        setCsvResult(null);
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

    setIsSubmitting(true);
    try {
      const res = await api.bulkCreate({
        category_id: Number(selectedCategoryId),
        location_id: selectedLocationId,
        expiry_date: activeCategory?.track_expiry ? expiryDate.trim() || null : null,
        notes: notes.trim() || null,
        values: formData.values || {},
        items: parsedNames.map((name) => ({ name })),
      });
      onAdded(
        res.created_count,
        `Added ${res.created_count} ${res.created_count === 1 ? "item" : "items"} to ${activeCategory?.name || "inventory"}`
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

  const handleSelectCsvFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] || null;
    event.target.value = "";
    setCsvFile(picked);
    setCsvResult(null);
    setErrorMsg(null);
  };

  const handleCsvAction = async (dryRun: boolean) => {
    setErrorMsg(null);
    if (!selectedCategoryId) {
      setErrorMsg("Please choose a category first.");
      return;
    }
    if (!csvFile) {
      setErrorMsg("Please select a CSV file to process.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.importCsv(Number(selectedCategoryId), csvFile, {
        dryRun,
        locationId: selectedLocationId,
      });
      setCsvResult(result);

      if (!dryRun && result.ok) {
        onAdded(
          result.imported_count,
          `Imported ${result.imported_count} ${result.imported_count === 1 ? "item" : "items"} from CSV`
        );
        onClose();
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to process CSV file.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const csvTemplateHeaders = getCsvHeadersForCategory(activeCategory, activeCategoryFields);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
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
            value="csv"
            label="Import CSV"
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

                  {activeCategory?.track_expiry && (
                    <Grid size={{ xs: 12, sm: 6 }}>
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

                  <Grid size={{ xs: 12, sm: activeCategory?.track_expiry ? 6 : 12 }}>
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
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel id="bulk-csv-category-label">Category</InputLabel>
                    <Select
                      labelId="bulk-csv-category-label"
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
                      CSV Columns for {activeCategory?.name || "Selected Category"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Use location names or full paths (e.g. <code>Kitchen &gt; Top Shelf</code>). Blank Location cells fall back to Default Location.
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DownloadOutlinedIcon />}
                    onClick={() => downloadCategoryCsvTemplate(activeCategory, activeCategoryFields)}
                    disabled={!activeCategory}
                  >
                    Download Template
                  </Button>
                </Box>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
                  {csvTemplateHeaders.map((header) => {
                    const matchedField = activeCategoryFields.find((f) => f.label === header);
                    const isRequired = header === "Name" || Boolean(matchedField?.required);
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
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  onChange={handleSelectCsvFile}
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
                      {csvFile ? csvFile.name : "Choose a UTF-8 .csv file to import"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {csvFile
                        ? `${Math.max(1, Math.round(csvFile.size / 1024))} KB • Click Preview / Validate before importing`
                        : "Required column: Name. Dates should use YYYY-MM-DD format."}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<UploadFileOutlinedIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    {csvFile ? "Change File" : "Select CSV File"}
                  </Button>
                </Paper>
              </Box>

              {csvResult && (
                <Alert severity={csvResult.ok ? "success" : "error"}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {csvResult.ok
                      ? csvResult.dry_run
                        ? `Preview passed: ${csvResult.imported_count} of ${csvResult.total_rows} rows ready to import.`
                        : `Imported ${csvResult.imported_count} items.`
                      : `Found ${csvResult.errors.length} ${csvResult.errors.length === 1 ? "issue" : "issues"} across ${csvResult.total_rows} rows (no items imported).`}
                  </Typography>
                  {csvResult.errors.length > 0 && (
                    <List dense disablePadding sx={{ maxHeight: 160, overflowY: "auto", mt: 1 }}>
                      {csvResult.errors.slice(0, 50).map((errText, idx) => (
                        <ListItem key={`${idx}-${errText}`} disableGutters sx={{ py: 0.25 }}>
                          <Typography variant="caption">{errText}</Typography>
                        </ListItem>
                      ))}
                      {csvResult.errors.length > 50 && (
                        <ListItem disableGutters sx={{ py: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            {`...and ${csvResult.errors.length - 50} more errors.`}
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
              onClick={() => handleCsvAction(true)}
              disabled={isSubmitting || !csvFile || !selectedCategoryId}
            >
              Preview / Validate
            </Button>
            <Button
              variant="contained"
              startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : <UploadFileOutlinedIcon />}
              onClick={() => handleCsvAction(false)}
              disabled={isSubmitting || !csvFile || !selectedCategoryId}
            >
              Import Items
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
