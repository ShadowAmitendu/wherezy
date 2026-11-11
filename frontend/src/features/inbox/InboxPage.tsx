import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  FormControl,
  Grid,
  Grow,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { useForm } from "react-hook-form";
import { AiItemSuggestion, api, ApiException } from "../../api/client";
import { AiCapturePanel } from "../../components/shared/AiCapturePanel";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { PageHeader } from "../../components/shared/PageHeader";
import { PhotoCaptureButtons } from "../../components/shared/PhotoCaptureButtons";
import { useAiMediaRecorder } from "../../components/shared/useAiMediaRecorder";
import { DynamicFields } from "../forms/DynamicFields";
import { FieldDef } from "../forms/types";
import { parsePositiveInt } from "../items/quantityUtils";
import { LocationPicker } from "../locations/LocationPicker";

export const InboxPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [defaultLocationId, setDefaultLocationId] = useState<number | null>(null);

  // Batch & per-card AI suggestions
  const [aiConfigured, setAiConfigured] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState<Record<number, AiItemSuggestion>>({});
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Record<number, boolean>>({});
  const [quickSavingId, setQuickSavingId] = useState<number | null>(null);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  // Sort modal state
  const [sortingItem, setSortingItem] = useState<any | null>(null);
  const [sortName, setSortName] = useState("");
  const [sortCatId, setSortCatId] = useState<number | "">("");
  const [sortCatFields, setSortCatFields] = useState<FieldDef[]>([]);
  const [sortLocId, setSortLocId] = useState<number | null>(null);
  const [sortQtyStr, setSortQtyStr] = useState("1");
  const [sortExpiryDate, setSortExpiryDate] = useState("");
  const [sortNotes, setSortNotes] = useState("");
  const [sortAiHintOpen, setSortAiHintOpen] = useState(false);
  const [sortAiAnalyzing, setSortAiAnalyzing] = useState(false);
  const [sortAiSummary, setSortAiSummary] = useState<string | null>(null);
  const [sortAiError, setSortAiError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pendingSortValuesRef = useRef<Record<string, any> | null>(null);

  const { control, reset, getValues } = useForm();
  const sortAiMedia = useAiMediaRecorder(Boolean(sortingItem) && sortAiHintOpen);
  const { resetAll: resetSortAiMedia } = sortAiMedia;

  const loadData = async () => {
    setLoading(true);
    try {
      const [items, cats] = await Promise.all([
        api.getInboxItems(),
        api.getCategories(),
      ]);
      setInboxItems(items);
      setCategories(cats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([api.getInboxItems(), api.getCategories(), api.getSettings().catch(() => null)])
      .then(([items, cats, settings]) => {
        if (!active) return;
        setInboxItems(items);
        setCategories(cats);
        if (settings) {
          setAiConfigured(Boolean(settings.ai_configured));
        }
      })
      .catch((err) => {
        if (active) console.error(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve(
      sortingItem && sortCatId ? api.getCategory(Number(sortCatId)) : null
    )
      .then((cat) => {
        if (!active) return;
        setSortCatFields(cat?.fields || []);
        if (pendingSortValuesRef.current) {
          reset({ values: pendingSortValuesRef.current });
          pendingSortValuesRef.current = null;
        }
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [sortingItem, sortCatId, reset]);

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      await api.quickCapture(files, undefined, defaultLocationId);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const applySuggestionToSortDialog = (item: any, suggestion: AiItemSuggestion) => {
    if (suggestion.name) setSortName(suggestion.name);
    if (suggestion.location_id !== null && suggestion.location_id !== undefined) {
      setSortLocId(suggestion.location_id);
    }
    if (suggestion.quantity && suggestion.quantity >= 1) {
      setSortQtyStr(String(suggestion.quantity));
    }
    setSortExpiryDate(suggestion.expiry_date || "");
    if (suggestion.notes !== null && suggestion.notes !== undefined) {
      setSortNotes(suggestion.notes);
    }

    const nextValues = suggestion.values || {};
    const nextCatId = suggestion.category_id || (sortCatId || categories[0]?.id || "");
    if (nextCatId && nextCatId !== sortCatId) {
      pendingSortValuesRef.current = nextValues;
      setSortCatId(nextCatId);
    } else {
      reset({ values: nextValues });
    }
    setSortAiSummary(
      suggestion.summary || `AI extracted details for ${item.name}. Review and save when ready.`
    );
  };

  const handleOpenSort = (item: any) => {
    resetSortAiMedia();
    setSortAiHintOpen(false);
    setSortAiAnalyzing(false);
    setSortAiError(null);
    setSortAiSummary(null);
    setErrorMsg(null);
    pendingSortValuesRef.current = null;

    const cached = aiSuggestions[item.id];
    const initialCatId = cached?.category_id || categories[0]?.id || "";
    setSortingItem(item);
    setSortName(
      cached?.name || (item.name.startsWith("Untitled") ? "" : item.name)
    );
    setSortCatId(initialCatId);
    setSortLocId(cached?.location_id ?? item.location_id ?? defaultLocationId);
    setSortQtyStr(String(cached?.quantity && cached.quantity >= 1 ? cached.quantity : 1));
    setSortExpiryDate(cached?.expiry_date || "");
    setSortNotes(cached?.notes || "");
    if (cached?.values) {
      pendingSortValuesRef.current = cached.values;
      reset({ values: cached.values });
    } else {
      reset({ values: {} });
    }
    if (cached?.summary) {
      setSortAiSummary(cached.summary);
    }
  };

  const handleCloseSort = () => {
    if (sortAiAnalyzing) return;
    resetSortAiMedia();
    pendingSortValuesRef.current = null;
    setSortingItem(null);
  };

  const handleAnalyzeSortingItem = async () => {
    if (!sortingItem) return;
    if (sortAiMedia.isRecording) {
      setSortAiError("Please stop the active voice recording first.");
      return;
    }
    setSortAiAnalyzing(true);
    setSortAiError(null);
    try {
      const res = await api.analyzeInboxItemWithAi(sortingItem.id, {
        prompt: sortAiMedia.prompt,
        audio: sortAiMedia.audioDraft?.blob ?? null,
        audioFilename: sortAiMedia.audioDraft?.filename,
      });
      setAiSuggestions((prev) => ({ ...prev, [sortingItem.id]: res.suggestion }));
      applySuggestionToSortDialog(sortingItem, res.suggestion);
    } catch (err: any) {
      if (err instanceof ApiException) {
        if (err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        }
        setSortAiError(err.error.message);
      } else {
        setSortAiError("Failed to analyze captured photo with AI.");
      }
    } finally {
      setSortAiAnalyzing(false);
    }
  };

  const handleAnalyzeSingleCard = async (item: any) => {
    setBatchNotice(null);
    setAnalyzingIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await api.analyzeInboxItemWithAi(item.id, {});
      setAiSuggestions((prev) => ({ ...prev, [item.id]: res.suggestion }));
    } catch (err: any) {
      if (err instanceof ApiException) {
        if (err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        }
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg(`Failed to analyze ${item.name} with AI.`);
      }
    } finally {
      setAnalyzingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleAnalyzeAll = async () => {
    const withPhotos = inboxItems.filter((it) => it.photos && it.photos.length > 0);
    if (withPhotos.length === 0) {
      setBatchNotice("No captured photos found in the inbox yet.");
      return;
    }
    const pending = withPhotos.filter((it) => !aiSuggestions[it.id]);
    const targets = pending.length > 0 ? pending : withPhotos;

    setAnalyzingAll(true);
    setBatchNotice(null);
    let completed = 0;
    let firstError: string | null = null;

    for (const item of targets) {
      setAnalyzingIds((prev) => ({ ...prev, [item.id]: true }));
      try {
        const res = await api.analyzeInboxItemWithAi(item.id, {});
        setAiSuggestions((prev) => ({ ...prev, [item.id]: res.suggestion }));
        completed += 1;
      } catch (err: any) {
        const msg =
          err instanceof ApiException
            ? err.error.message
            : `Failed to analyze ${item.name}`;
        firstError = firstError || msg;
        if (err instanceof ApiException && err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
          setAnalyzingIds((prev) => ({ ...prev, [item.id]: false }));
          break;
        }
      } finally {
        setAnalyzingIds((prev) => ({ ...prev, [item.id]: false }));
      }
    }

    setAnalyzingAll(false);
    if (firstError && completed === 0) {
      setErrorMsg(firstError);
    } else if (completed > 0) {
      setBatchNotice(
        `AI analyzed ${completed} of ${targets.length} inbox photo${targets.length === 1 ? "" : "s"}. Review any card or click Quick Save.`
      );
    }
  };

  const handleQuickSaveCard = async (item: any) => {
    const suggestion = aiSuggestions[item.id];
    if (!suggestion) return;
    const catId = suggestion.category_id || categories[0]?.id;
    const itemName = (suggestion.name || "").trim() || (item.name.startsWith("Untitled") ? "" : item.name);
    if (!catId || !itemName) {
      handleOpenSort(item);
      return;
    }

    setQuickSavingId(item.id);
    setErrorMsg(null);
    try {
      await api.sortInboxItem(item.id, {
        name: itemName,
        category_id: Number(catId),
        location_id: suggestion.location_id ?? item.location_id ?? defaultLocationId,
        quantity: Math.max(1, suggestion.quantity || 1),
        expiry_date: suggestion.expiry_date || undefined,
        notes: suggestion.notes || undefined,
        values: suggestion.values || {},
      });
      setAiSuggestions((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await loadData();
    } catch (err: any) {
      setErrorMsg(
        err instanceof ApiException ? err.error.message : err.message || "Failed to quick-save item"
      );
    } finally {
      setQuickSavingId(null);
    }
  };

  const handleSaveSort = async () => {
    if (!sortingItem || !sortCatId || !sortName.trim()) {
      setErrorMsg("Please provide an item name and category.");
      return;
    }
    const parsedQty = parsePositiveInt(sortQtyStr);
    if (parsedQty === null) {
      setErrorMsg("Quantity must be a whole number of at least 1.");
      return;
    }

    try {
      await api.sortInboxItem(sortingItem.id, {
        name: sortName.trim(),
        category_id: Number(sortCatId),
        location_id: sortLocId,
        quantity: parsedQty,
        expiry_date: sortExpiryDate.trim() || undefined,
        notes: sortNotes.trim() || undefined,
        values: getValues("values") || {},
      });
      setAiSuggestions((prev) => {
        const next = { ...prev };
        delete next[sortingItem.id];
        return next;
      });
      handleCloseSort();
      await loadData();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiException ? err.error.message : err.message || "Failed to sort item");
    }
  };

  const handleDiscard = async (itemId: number) => {
    try {
      await api.deleteInboxItem(itemId);
      setAiSuggestions((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const activeSortCategory = categories.find((c) => c.id === sortCatId);

  return (
    <Box sx={{ width: "100%" }}>
      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Inbox Sort Error"
        message={errorMsg}
        severity="error"
      />

      <PageHeader
        title="Quick Capture Inbox"
        subtitle="Snap photos now, organize later"
        icon={<MoveToInboxIcon />}
        action={
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            {inboxItems.length > 0 && (
              <Button
                variant="outlined"
                color="secondary"
                size="large"
                startIcon={
                  analyzingAll ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <AutoAwesomeIcon />
                  )
                }
                onClick={() => void handleAnalyzeAll()}
                disabled={analyzingAll || uploading || Boolean(quickSavingId)}
              >
                {analyzingAll ? "Analyzing..." : "AI Analyze All"}
              </Button>
            )}
            <PhotoCaptureButtons
              onFilesSelected={handleFilesSelected}
              loading={uploading}
              size="large"
              cameraLabel="Snap Photo"
              uploadLabel="Upload Photo"
              loadingLabel="Uploading..."
              cameraVariant="contained"
              uploadVariant="outlined"
            />
          </Box>
        }
      />

      {batchNotice && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setBatchNotice(null)}>
          {batchNotice}
        </Alert>
      )}

      {/* Sticky location option */}
      <Card sx={{ p: 2, mb: 3, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          I&apos;m currently unpacking at:
        </Typography>
        <Box sx={{ minWidth: 260 }}>
          <LocationPicker
            value={defaultLocationId}
            onChange={(loc) => setDefaultLocationId(loc)}
            label="Default Capture Location"
          />
        </Box>
      </Card>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : inboxItems.length === 0 ? (
        <Fade in appear timeout={250}>
          <Card sx={{ p: 6, textAlign: "center" }}>
            <CheckIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
            <Typography variant="h6">Inbox is Clear</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Snap a photo with your camera or upload images from your device to capture items straight into this inbox.
            </Typography>
            <PhotoCaptureButtons
              onFilesSelected={handleFilesSelected}
              loading={uploading}
              cameraLabel="Snap Photo"
              uploadLabel="Upload Photo"
              loadingLabel="Uploading..."
              cameraVariant="outlined"
              uploadVariant="outlined"
              sx={{ justifyContent: "center" }}
            />
          </Card>
        </Fade>
      ) : (
        <Grid container spacing={2.5}>
          {inboxItems.map((item, idx) => {
            const suggestion = aiSuggestions[item.id];
            const isCardAnalyzing = Boolean(analyzingIds[item.id]);
            const isQuickSaving = quickSavingId === item.id;
            const hasPhoto = Boolean(item.photos && item.photos.length > 0);
            return (
              <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Grow in appear timeout={Math.min(200 + idx * 45, 480)}>
                  <Card
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      transition: (t) =>
                        t.transitions.create(["transform", "box-shadow"], {
                          duration: t.transitions.duration.shorter,
                          easing: t.transitions.easing.easeInOut,
                        }),
                      "&:hover": {
                        transform: "translateY(-2px)",
                        boxShadow: 4,
                      },
                    }}
                  >
                    {hasPhoto ? (
                      <CardMedia
                        component="img"
                        height="180"
                        image={item.photos[0].thumb_url}
                        alt={item.name}
                        sx={{ objectFit: "cover", bgcolor: "black" }}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: 180,
                          bgcolor: "action.hover",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <PhotoCameraIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                      </Box>
                    )}
                    {isCardAnalyzing && <LinearProgress color="secondary" />}
                    <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Captured: {item.captured_at ? item.captured_at.substring(0, 16).replace("T", " ") : "Recently"}
                      </Typography>
                      {item.location_name && (
                        <Chip label={item.location_name} size="small" sx={{ mt: 1, height: 20, fontSize: "0.7rem" }} />
                      )}

                      {suggestion && (
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 1,
                            mt: 1.25,
                            borderRadius: 1.5,
                            borderColor: "secondary.main",
                            bgcolor: "action.hover",
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="secondary.main"
                            sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5 }}
                          >
                            <AutoAwesomeIcon sx={{ fontSize: 13 }} /> AI Suggestion
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.25 }} noWrap>
                            {suggestion.name || item.name}
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                            {suggestion.category_name && (
                              <Chip
                                size="small"
                                label={suggestion.category_name}
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                            {suggestion.location_path && (
                              <Chip
                                size="small"
                                label={suggestion.location_path}
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                            {suggestion.quantity > 1 && (
                              <Chip
                                size="small"
                                label={`Qty ${suggestion.quantity}`}
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                            {suggestion.expiry_date && (
                              <Chip
                                size="small"
                                label={`Exp ${suggestion.expiry_date}`}
                                color="warning"
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                          </Box>
                          <Button
                            size="small"
                            variant="contained"
                            color="secondary"
                            fullWidth
                            startIcon={<CheckIcon />}
                            sx={{ mt: 1 }}
                            onClick={() => void handleQuickSaveCard(item)}
                            disabled={isQuickSaving || analyzingAll}
                          >
                            {isQuickSaving ? "Saving..." : "Quick Save"}
                          </Button>
                        </Paper>
                      )}
                    </CardContent>
                    <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 1.5 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Button
                          size="small"
                          variant={suggestion ? "outlined" : "contained"}
                          color="primary"
                          onClick={() => handleOpenSort(item)}
                        >
                          Sort Item
                        </Button>
                        {hasPhoto && (
                          <Tooltip title="Analyze photo with AI">
                            <span>
                              <IconButton
                                size="small"
                                color="secondary"
                                aria-label={`Analyze ${item.name} with AI`}
                                onClick={() => void handleAnalyzeSingleCard(item)}
                                disabled={isCardAnalyzing || analyzingAll || isQuickSaving}
                              >
                                {isCardAnalyzing ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <AutoAwesomeIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteOutlinedIcon />}
                        onClick={() => void handleDiscard(item.id)}
                        disabled={isQuickSaving}
                      >
                        Discard
                      </Button>
                    </CardActions>
                  </Card>
                </Grow>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Sort Item Dialog */}
      <Dialog
        open={Boolean(sortingItem)}
        onClose={handleCloseSort}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Sort Item into Inventory</span>
          {isMobile && (
            <IconButton onClick={handleCloseSort} size="small" edge="end" disabled={sortAiAnalyzing}>
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.25, pt: "16px !important" }}>
          {sortingItem && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.75,
                borderRadius: 2,
                borderColor: "secondary.main",
                bgcolor: "action.hover",
              }}
            >
              <Stack spacing={1.25}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {sortingItem.photos && sortingItem.photos.length > 0 && (
                      <Box
                        component="img"
                        src={sortingItem.photos[0].thumb_url}
                        alt={sortingItem.name}
                        sx={{
                          width: 48,
                          height: 48,
                          objectFit: "cover",
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      />
                    )}
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5 }}>
                        <AutoAwesomeIcon color="secondary" fontSize="small" /> AI Photo Assistant
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Reads the captured photo + optional voice or text hint
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSortAiHintOpen((prev) => !prev)}
                      disabled={sortAiAnalyzing}
                    >
                      {sortAiHintOpen ? "Hide Hint" : "Add Voice / Hint"}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      startIcon={<AutoAwesomeIcon />}
                      onClick={() => void handleAnalyzeSortingItem()}
                      disabled={
                        sortAiAnalyzing ||
                        sortAiMedia.isRecording ||
                        ((!sortingItem.photos || sortingItem.photos.length === 0) &&
                          !sortAiMedia.prompt.trim() &&
                          !sortAiMedia.audioDraft)
                      }
                    >
                      {sortAiAnalyzing ? "Analyzing..." : "Analyze Photo"}
                    </Button>
                  </Box>
                </Box>

                {sortAiAnalyzing && <LinearProgress color="secondary" />}

                {sortAiError && (
                  <Alert severity="error" onClose={() => setSortAiError(null)}>
                    {sortAiError}
                  </Alert>
                )}

                {sortAiSummary && (
                  <Alert severity="success" onClose={() => setSortAiSummary(null)}>
                    {sortAiSummary}
                  </Alert>
                )}

                <Collapse in={sortAiHintOpen} unmountOnExit>
                  <AiCapturePanel
                    media={sortAiMedia}
                    aiConfigured={aiConfigured}
                    disabled={sortAiAnalyzing}
                    promptLabel="Optional voice/text hint for AI"
                    promptPlaceholder="e.g. Pack of 3, stored in Kitchen Top Shelf..."
                    allowImage={false}
                    promptRows={2}
                    onNavigateSettings={handleCloseSort}
                  />
                </Collapse>
              </Stack>
            </Paper>
          )}

          <Box sx={{ pt: 0.5, display: "flex", flexDirection: "column", gap: 2.25 }}>
            <TextField
              label="Item Name"
              placeholder="e.g. Philips Steam Iron"
              value={sortName}
              onChange={(e) => setSortName(e.target.value)}
              fullWidth
              required
              autoFocus
            />

            <FormControl fullWidth required>
              <InputLabel id="sort-category-label">Category</InputLabel>
              <Select
                labelId="sort-category-label"
                value={sortCatId}
                label="Category"
                onChange={(e) => setSortCatId(e.target.value as number)}
              >
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <LocationPicker
              value={sortLocId}
              onChange={(loc) => setSortLocId(loc)}
              label="Storage Location"
            />

            <TextField
              label="Quantity"
              type="number"
              required
              value={sortQtyStr}
              onChange={(e) => setSortQtyStr(e.target.value)}
              fullWidth
              slotProps={{
                htmlInput: { min: 1, step: 1, style: { fontFamily: "var(--font-mono)" } },
              }}
              helperText="How many units of this item (min 1)"
            />

            {activeSortCategory?.track_expiry && (
              <TextField
                label={activeSortCategory.expiry_label || "Expiry Date"}
                type="date"
                value={sortExpiryDate}
                onChange={(e) => setSortExpiryDate(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}

            {sortCatFields.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  color="primary.main"
                  sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", mb: 1.25 }}
                >
                  {activeSortCategory?.name ? `${activeSortCategory.name} Attributes` : "Category Fields"}
                </Typography>
                <DynamicFields fields={sortCatFields} control={control} />
              </Box>
            )}

            <TextField
              label="Notes"
              value={sortNotes}
              onChange={(e) => setSortNotes(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSort} disabled={sortAiAnalyzing}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSort} disabled={sortAiAnalyzing}>
            Save to Inventory
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
