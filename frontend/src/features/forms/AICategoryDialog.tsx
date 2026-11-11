import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  api,
  ApiException,
  AiCategoryFieldPlan,
  AiCategoryPlan,
} from "../../api/client";
import { AiCapturePanel } from "../../components/shared/AiCapturePanel";
import { ColorSwatchPicker } from "../../components/shared/ColorSwatchPicker";
import { IconPicker } from "../../components/shared/IconPicker";
import { renderMuiIcon } from "../../components/shared/iconUtils";
import { useAiMediaRecorder } from "../../components/shared/useAiMediaRecorder";
import { Category } from "./types";

const EXAMPLE_PROMPTS = [
  "Kitchen spices with origin, heat level, organic flag & best before",
  "Camera gear & lenses with brand, mount, focal length & serial number",
  "Prescription & OTC medicines with dosage, form & expiry warning",
  "Board games with player count, play duration, age rating & condition",
];

const EXAMPLE_OPTIONS = EXAMPLE_PROMPTS.map((example) => ({
  label: example.split(" with ")[0],
  prompt: example,
}));

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Short Text",
  longtext: "Long Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  multiselect: "Multi-Select",
  checkbox: "Checkbox",
};

export interface AICategoryDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (category: Category, optimizationSummary?: string) => void;
}

export const AICategoryDialog: React.FC<AICategoryDialogProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [aiConfigured, setAiConfigured] = useState<boolean>(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview/review state (when user clicks "Preview First")
  const [reviewPlan, setReviewPlan] = useState<AiCategoryPlan | null>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewIcon, setReviewIcon] = useState("category");
  const [reviewColor, setReviewColor] = useState("#1976d2");
  const [reviewTrackExpiry, setReviewTrackExpiry] = useState(false);
  const [reviewExpiryLabel, setReviewExpiryLabel] = useState("Expiry date");
  const [reviewFields, setReviewFields] = useState<AiCategoryFieldPlan[]>([]);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const media = useAiMediaRecorder(open && !reviewPlan);

  const resetAllState = () => {
    media.resetAll();
    setErrorMsg(null);
    setIsWorking(false);
    setReviewPlan(null);
    setReviewFields([]);
    setIconPickerOpen(false);
  };

  useEffect(() => {
    if (!open) return;

    let active = true;
    api
      .getSettings()
      .then((s) => {
        if (active) {
          setAiConfigured(Boolean(s.ai_configured));
        }
      })
      .catch(() => {
        // Ignore transient status fetch failure; submit handles authoritative error
      });
    return () => {
      active = false;
    };
  }, [open]);

  const handleCloseDialog = () => {
    if (isWorking) return;
    resetAllState();
    onClose();
  };

  const applyPlanToReview = (plan: AiCategoryPlan) => {
    setReviewPlan(plan);
    setReviewName(plan.name);
    setReviewIcon(plan.icon);
    setReviewColor(plan.color);
    setReviewTrackExpiry(plan.track_expiry);
    setReviewExpiryLabel(plan.expiry_label || "Expiry date");
    setReviewFields(plan.fields);
  };

  const handleRunAi = async (autoCreate: boolean) => {
    if (media.isRecording) {
      setErrorMsg("Please stop the active voice recording before continuing.");
      return;
    }
    if (!media.prompt.trim() && !media.audioDraft) {
      setErrorMsg("Enter a description or record/upload a voice message first.");
      return;
    }

    setIsWorking(true);
    setErrorMsg(null);
    try {
      const res = await api.generateCategoryWithAi({
        prompt: media.prompt,
        audio: media.audioDraft?.blob ?? null,
        audioFilename: media.audioDraft?.filename,
        create: autoCreate,
      });

      if (autoCreate && res.category) {
        const created = res.category;
        const summary = res.plan.optimization_summary;
        resetAllState();
        onCreated(created, summary);
      } else {
        applyPlanToReview(res.plan);
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        if (err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        }
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to generate category with AI.");
      }
    } finally {
      setIsWorking(false);
    }
  };

  const handleCommitReviewed = async () => {
    if (!reviewName.trim()) {
      setErrorMsg("Category name is required.");
      return;
    }
    setIsWorking(true);
    setErrorMsg(null);
    try {
      const created = await api.commitAiCategory({
        name: reviewName.trim(),
        icon: reviewIcon,
        color: reviewColor,
        track_expiry: reviewTrackExpiry,
        expiry_label: reviewTrackExpiry ? reviewExpiryLabel.trim() || "Expiry date" : null,
        fields: reviewFields,
      });
      const summary = reviewPlan?.optimization_summary;
      resetAllState();
      onCreated(created, summary);
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to create category.");
      }
    } finally {
      setIsWorking(false);
    }
  };

  const inReview = Boolean(reviewPlan);

  return (
    <Dialog
      open={open}
      onClose={handleCloseDialog}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      aria-labelledby="ai-category-dialog-title"
      slotProps={{
        transition: {
          onExited: resetAllState,
        },
      }}
    >
      <DialogTitle
        id="ai-category-dialog-title"
        sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}
      >
        <AutoAwesomeIcon color="primary" />
        <Box>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            {inReview ? "Review AI-Optimized Category" : "Create Category with AI"}
          </Typography>
        </Box>
      </DialogTitle>

      {isWorking && <LinearProgress />}

      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}>
        {errorMsg && (
          <Alert severity="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {!inReview ? (
          <Fade in>
            <Stack spacing={2.25}>
              <Typography variant="body2" color="text.secondary">
                Describe what items belong in this category or leave a voice message. Wherezy AI will
                choose the optimal icon, colour, expiry tracking, and tailored custom fields automatically.
              </Typography>

              <AiCapturePanel
                media={media}
                aiConfigured={aiConfigured}
                disabled={isWorking}
                promptLabel="Describe your category"
                promptPlaceholder="e.g. Camping gear with weight, season rating, waterproof flag and condition..."
                examples={EXAMPLE_OPTIONS}
                allowImage={false}
                promptRows={3}
                autoFocusPrompt
                onNavigateSettings={handleCloseDialog}
              />
            </Stack>
          </Fade>
        ) : (
          <Fade in>
            <Stack spacing={2.25}>
              {reviewPlan?.optimization_summary && (
                <Alert icon={<AutoAwesomeIcon fontSize="inherit" />} severity="info">
                  {reviewPlan.optimization_summary}
                </Alert>
              )}

              <TextField
                label="Category Name"
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
                fullWidth
                required
                disabled={isWorking}
              />

              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    Icon
                  </Typography>
                  <IconButton
                    onClick={() => setIconPickerOpen(true)}
                    disabled={isWorking}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      color: reviewColor,
                      p: 1.5,
                    }}
                  >
                    {renderMuiIcon(reviewIcon)}
                  </IconButton>
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  <ColorSwatchPicker
                    value={reviewColor}
                    onChange={setReviewColor}
                    label="Accent Colour"
                    size={24}
                  />
                </Box>
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    checked={reviewTrackExpiry}
                    onChange={(e) => setReviewTrackExpiry(e.target.checked)}
                    disabled={isWorking}
                  />
                }
                label="Track Expiry Dates"
              />

              {reviewTrackExpiry && (
                <TextField
                  label="Expiry Field Label"
                  value={reviewExpiryLabel}
                  onChange={(e) => setReviewExpiryLabel(e.target.value)}
                  fullWidth
                  size="small"
                  disabled={isWorking}
                />
              )}

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Optimized Custom Fields ({reviewFields.length})
                </Typography>
                {reviewFields.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No custom fields remaining — you can still create this category and add fields later.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {reviewFields.map((field, index) => (
                      <Paper
                        key={`${field.label}-${index}`}
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 1,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {field.label}
                            </Typography>
                            <Chip
                              size="small"
                              label={FIELD_TYPE_LABELS[field.type] || field.type}
                              variant="outlined"
                            />
                            {field.unit && (
                              <Chip size="small" label={`Unit: ${field.unit}`} />
                            )}
                            {field.required && (
                              <Chip size="small" label="Required" color="warning" variant="outlined" />
                            )}
                            {field.show_in_list && (
                              <Chip size="small" label="List column" color="primary" variant="outlined" />
                            )}
                          </Box>
                          {field.hint && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                              {field.hint}
                            </Typography>
                          )}
                          {field.options && field.options.length > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                              Options: {field.options.join(", ")}
                            </Typography>
                          )}
                        </Box>
                        <Tooltip title="Remove field">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Remove ${field.label}`}
                            disabled={isWorking}
                            onClick={() =>
                              setReviewFields((prev) => prev.filter((_, i) => i !== index))
                            }
                          >
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          </Fade>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1, flexWrap: "wrap", gap: 1 }}>
        {!inReview ? (
          <>
            <Button onClick={handleCloseDialog} disabled={isWorking}>
              Cancel
            </Button>
            <Button
              variant="outlined"
              startIcon={<VisibilityOutlinedIcon />}
              onClick={() => void handleRunAi(false)}
              disabled={isWorking || media.isRecording || (!media.prompt.trim() && !media.audioDraft)}
            >
              Preview First
            </Button>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => void handleRunAi(true)}
              disabled={isWorking || media.isRecording || (!media.prompt.trim() && !media.audioDraft)}
            >
              {isWorking ? "Optimizing..." : "Optimize & Create"}
            </Button>
          </>
        ) : (
          <>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => {
                setReviewPlan(null);
                setErrorMsg(null);
              }}
              disabled={isWorking}
            >
              Back
            </Button>
            <Button onClick={handleCloseDialog} disabled={isWorking}>
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => void handleCommitReviewed()}
              disabled={isWorking || !reviewName.trim()}
            >
              {isWorking ? "Creating..." : "Create Category"}
            </Button>
          </>
        )}
      </DialogActions>

      <IconPicker
        open={iconPickerOpen}
        selectedIcon={reviewIcon}
        onSelect={(newIcon) => setReviewIcon(newIcon)}
        onClose={() => setIconPickerOpen(false)}
      />
    </Dialog>
  );
};
