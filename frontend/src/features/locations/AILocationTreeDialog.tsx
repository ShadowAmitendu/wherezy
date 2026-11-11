import React, { useEffect, useMemo, useState } from "react";
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
  IconButton,
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
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  AiLocationNodePlan,
  api,
  ApiException,
} from "../../api/client";
import { AiCapturePanel } from "../../components/shared/AiCapturePanel";
import { useAiMediaRecorder } from "../../components/shared/useAiMediaRecorder";
import { LocationPicker } from "./LocationPicker";
import { isRoomKind, SUGGESTED_LOCATION_KINDS } from "./locationUtils";

const LOCATION_EXAMPLES = [
  {
    label: "Rooms & shelves",
    prompt:
      "Kitchen with Upper Cupboard (Top Shelf, Mug Rack) and Pantry Storage Area; Bedroom with Wardrobe and Bedside Drawer; Store Room for spare luggage only",
  },
  {
    label: "Garage workshop",
    prompt:
      "Garage with Tool Workbench (Top Drawer, Power Tool Shelf), Camping Storage Area with Seasonal Bin A and Tent Bag",
  },
  {
    label: "Separate storage room",
    prompt:
      "Utility Storage Room (standalone storage space); Basement with Holiday Storage Area, Wall Rack Shelf 1, Wall Rack Shelf 2",
  },
];

interface OrderedLocationNode {
  node: AiLocationNodePlan;
  depth: number;
}

function buildOrderedTree(nodes: AiLocationNodePlan[]): OrderedLocationNode[] {
  const byParent = new Map<string, AiLocationNodePlan[]>();
  const knownIds = new Set(nodes.map((n) => n.temp_id));

  for (const node of nodes) {
    const parentKey =
      node.parent_temp_id && knownIds.has(node.parent_temp_id) && node.parent_temp_id !== node.temp_id
        ? node.parent_temp_id
        : "__root__";
    const list = byParent.get(parentKey) || [];
    list.push(node);
    byParent.set(parentKey, list);
  }

  const ordered: OrderedLocationNode[] = [];
  const visited = new Set<string>();

  const walk = (parentKey: string, depth: number) => {
    const children = byParent.get(parentKey) || [];
    for (const child of children) {
      if (visited.has(child.temp_id)) continue;
      visited.add(child.temp_id);
      ordered.push({ node: child, depth });
      walk(child.temp_id, depth + 1);
    }
  };

  walk("__root__", 0);
  // Any disconnected cycle remnants fall back to depth 0
  for (const node of nodes) {
    if (!visited.has(node.temp_id)) {
      ordered.push({ node, depth: 0 });
    }
  }
  return ordered;
}

function collectDescendantIds(
  rootId: string,
  nodes: AiLocationNodePlan[]
): Set<string> {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parent_temp_id && result.has(n.parent_temp_id) && !result.has(n.temp_id)) {
        result.add(n.temp_id);
        changed = true;
      }
    }
  }
  return result;
}

export interface AILocationTreeDialogProps {
  open: boolean;
  initialParentId?: number | null;
  onClose: () => void;
  onCreated: (createdCount: number, summary?: string) => void;
}

export const AILocationTreeDialog: React.FC<AILocationTreeDialogProps> = ({
  open,
  initialParentId = null,
  onClose,
  onCreated,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [aiConfigured, setAiConfigured] = useState(true);
  const [rootParentId, setRootParentId] = useState<number | null>(initialParentId);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [reviewMode, setReviewMode] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<string | null>(null);
  const [reviewNodes, setReviewNodes] = useState<AiLocationNodePlan[]>([]);

  const media = useAiMediaRecorder(open && !reviewMode);
  const { resetAll: resetMedia } = media;

  const resetAllState = () => {
    resetMedia();
    setRootParentId(initialParentId);
    setIsWorking(false);
    setErrorMsg(null);
    setReviewMode(false);
    setReviewSummary(null);
    setReviewNodes([]);
  };

  useEffect(() => {
    if (!open) return;

    let active = true;
    api
      .getSettings()
      .then((s) => {
        if (!active) return;
        setAiConfigured(Boolean(s.ai_configured));
        setRootParentId(initialParentId);
      })
      .catch(() => {
        // Ignore transient status fetch failure
      });
    return () => {
      active = false;
    };
  }, [open, initialParentId]);

  const handleCloseDialog = () => {
    if (isWorking) return;
    resetAllState();
    onClose();
  };

  const orderedNodes = useMemo(() => buildOrderedTree(reviewNodes), [reviewNodes]);

  const handleRunAi = async (autoCreate: boolean) => {
    if (media.isRecording) {
      setErrorMsg("Please stop the active voice recording before continuing.");
      return;
    }
    if (!media.prompt.trim() && !media.audioDraft) {
      setErrorMsg("Describe your rooms/storage or record a voice message first.");
      return;
    }

    setIsWorking(true);
    setErrorMsg(null);
    try {
      const res = await api.generateLocationsWithAi({
        prompt: media.prompt,
        audio: media.audioDraft?.blob ?? null,
        audioFilename: media.audioDraft?.filename,
        rootParentId,
        create: autoCreate,
      });

      if (autoCreate && res.created && res.created_locations.length > 0) {
        const createdCount = res.created_locations.length;
        const summary =
          res.plan.summary || `Created ${createdCount} storage locations with AI.`;
        resetAllState();
        onCreated(createdCount, summary);
      } else {
        setReviewSummary(res.plan.summary || null);
        setReviewNodes(res.plan.nodes || []);
        setReviewMode(true);
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        if (err.error.code === "AI_NOT_CONFIGURED") {
          setAiConfigured(false);
        }
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to generate storage tree with AI.");
      }
    } finally {
      setIsWorking(false);
    }
  };

  const handleUpdateNode = (tempId: string, patch: Partial<AiLocationNodePlan>) => {
    setReviewNodes((prev) =>
      prev.map((n) => (n.temp_id === tempId ? { ...n, ...patch } : n))
    );
  };

  const handleAddNode = (parentTempId: string | null) => {
    const parentNode = reviewNodes.find((n) => n.temp_id === parentTempId);
    const defaultKind = parentNode
      ? isRoomKind(parentNode.kind)
        ? "Storage Area"
        : parentNode.kind === "Cupboard"
          ? "Shelf"
          : "Box"
      : "Room";
    setReviewNodes((prev) => [
      ...prev,
      {
        temp_id: `loc-${Date.now()}-${prev.length + 1}`,
        parent_temp_id: parentTempId,
        name: "",
        kind: defaultKind,
        storage_only: false,
        notes: null,
      },
    ]);
  };

  const handleRemoveNode = (tempId: string) => {
    const toRemove = collectDescendantIds(tempId, reviewNodes);
    setReviewNodes((prev) => prev.filter((n) => !toRemove.has(n.temp_id)));
  };

  const handleCommitReviewed = async () => {
    const cleaned = reviewNodes.map((n) => ({
      ...n,
      name: n.name.trim(),
      kind: n.kind.trim() || "Room",
      notes: n.notes?.trim() || null,
    }));
    if (cleaned.length === 0) {
      setErrorMsg("Add at least one location to create.");
      return;
    }
    if (cleaned.some((n) => !n.name)) {
      setErrorMsg("Every location row needs a non-empty name.");
      return;
    }

    setIsWorking(true);
    setErrorMsg(null);
    try {
      const res = await api.commitAiLocations({
        root_parent_id: rootParentId,
        nodes: cleaned,
      });
      const summary =
        reviewSummary ||
        `Created ${res.created_count} storage ${res.created_count === 1 ? "location" : "locations"}.`;
      resetAllState();
      onCreated(res.created_count, summary);
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg("Failed to create locations.");
      }
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleCloseDialog}
      maxWidth={reviewMode ? "md" : "sm"}
      fullWidth
      fullScreen={isMobile}
      aria-labelledby="ai-location-tree-dialog-title"
      slotProps={{
        transition: {
          onExited: resetAllState,
        },
      }}
    >
      <DialogTitle
        id="ai-location-tree-dialog-title"
        sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}
      >
        <AccountTreeOutlinedIcon color="primary" />
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {reviewMode ? "Review Storage Hierarchy" : "AI Storage Tree Setup"}
        </Typography>
      </DialogTitle>

      {isWorking && <LinearProgress />}

      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}>
        {errorMsg && (
          <Alert severity="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {!reviewMode ? (
          <Fade in>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Describe your rooms, storage areas, cupboards, shelves, or standalone storage rooms via
                voice or text. AI treats Rooms as higher grouping places above shelves and storage areas.
              </Typography>

              <LocationPicker
                value={rootParentId}
                onChange={setRootParentId}
                label="Attach Under Existing Location (Optional)"
                emptyLabel="Top Level (Whole Home / Root)"
                size="small"
              />

              <AiCapturePanel
                media={media}
                aiConfigured={aiConfigured}
                disabled={isWorking}
                promptLabel="Describe your rooms & storage spots"
                promptPlaceholder="e.g. Kitchen with Pantry (Top Shelf, Lower Drawer) and Fridge; Study with Bookshelf and Desk Drawer..."
                examples={LOCATION_EXAMPLES}
                allowImage={false}
                promptRows={3}
                autoFocusPrompt
                onNavigateSettings={handleCloseDialog}
              />
            </Stack>
          </Fade>
        ) : (
          <Fade in>
            <Stack spacing={2}>
              {reviewSummary && (
                <Alert icon={<AutoAwesomeIcon fontSize="inherit" />} severity="info">
                  {reviewSummary}
                </Alert>
              )}

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Planned Locations ({reviewNodes.length})
                  </Typography>
                  {rootParentId && (
                    <Chip
                      size="small"
                      label="Attached under selected parent"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </Box>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddNode(null)}
                  disabled={isWorking}
                >
                  Add Top-Level
                </Button>
              </Box>

              {orderedNodes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No locations remaining — click Add Top-Level or go Back to regenerate.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {orderedNodes.map(({ node, depth }) => {
                    const blockedParents = collectDescendantIds(node.temp_id, reviewNodes);
                    return (
                      <Paper
                        key={node.temp_id}
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          ml: { xs: Math.min(depth, 3) * 1.5, sm: Math.min(depth, 5) * 2.5 },
                          borderLeft: depth > 0 ? "3px solid" : undefined,
                          borderLeftColor: depth > 0 ? "primary.main" : undefined,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 1,
                            alignItems: "center",
                          }}
                        >
                          <TextField
                            size="small"
                            label="Name"
                            value={node.name}
                            onChange={(e) =>
                              handleUpdateNode(node.temp_id, { name: e.target.value })
                            }
                            sx={{ flex: "1 1 160px" }}
                            disabled={isWorking}
                            required
                          />
                          <Select
                            size="small"
                            value={
                              SUGGESTED_LOCATION_KINDS.includes(node.kind as any)
                                ? node.kind
                                : SUGGESTED_LOCATION_KINDS[0]
                            }
                            onChange={(e) => {
                              const nextKind = e.target.value;
                              const nextIsRoom = isRoomKind(nextKind);
                              const parentNode = reviewNodes.find(
                                (p) => p.temp_id === node.parent_temp_id
                              );
                              handleUpdateNode(node.temp_id, {
                                kind: nextKind,
                                storage_only: nextIsRoom ? Boolean(node.storage_only) : false,
                                parent_temp_id:
                                  nextIsRoom && parentNode && !isRoomKind(parentNode.kind)
                                    ? null
                                    : node.parent_temp_id,
                              });
                            }}
                            sx={{ minWidth: 130 }}
                            disabled={isWorking}
                          >
                            {SUGGESTED_LOCATION_KINDS.map((k) => (
                              <MenuItem key={k} value={k}>
                                {k}
                              </MenuItem>
                            ))}
                          </Select>
                          <Select
                            size="small"
                            displayEmpty
                            value={node.parent_temp_id || ""}
                            onChange={(e) =>
                              handleUpdateNode(node.temp_id, {
                                parent_temp_id: e.target.value || null,
                              })
                            }
                            sx={{ minWidth: 145 }}
                            disabled={isWorking}
                          >
                            <MenuItem value="">
                              <em>{rootParentId ? "Selected Anchor" : "Top Level"}</em>
                            </MenuItem>
                            {reviewNodes
                              .filter(
                                (cand) =>
                                  !blockedParents.has(cand.temp_id) &&
                                  (!isRoomKind(node.kind) || isRoomKind(cand.kind))
                              )
                              .map((cand) => (
                                <MenuItem key={cand.temp_id} value={cand.temp_id}>
                                  Inside: {cand.name || cand.temp_id}
                                </MenuItem>
                              ))}
                          </Select>
                          {isRoomKind(node.kind) &&
                            !reviewNodes.some((c) => c.parent_temp_id === node.temp_id) && (
                              <Chip
                                size="small"
                                label={node.storage_only ? "Storage-only place" : "Room group"}
                                color={node.storage_only ? "secondary" : "primary"}
                                variant={node.storage_only ? "filled" : "outlined"}
                                onClick={() =>
                                  handleUpdateNode(node.temp_id, {
                                    storage_only: !node.storage_only,
                                  })
                                }
                              />
                            )}
                          <TextField
                            size="small"
                            label="Notes"
                            value={node.notes || ""}
                            onChange={(e) =>
                              handleUpdateNode(node.temp_id, { notes: e.target.value || null })
                            }
                            sx={{ flex: "1 1 150px" }}
                            disabled={isWorking}
                          />
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                            <Tooltip title="Add sub-location inside this one">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleAddNode(node.temp_id)}
                                disabled={isWorking}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove location and its children">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRemoveNode(node.temp_id)}
                                disabled={isWorking}
                              >
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Fade>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1, flexWrap: "wrap", gap: 1 }}>
        {!reviewMode ? (
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
              Preview Tree
            </Button>
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => void handleRunAi(true)}
              disabled={isWorking || media.isRecording || (!media.prompt.trim() && !media.audioDraft)}
            >
              {isWorking ? "Building..." : "Generate & Create"}
            </Button>
          </>
        ) : (
          <>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={() => {
                setReviewMode(false);
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
              disabled={isWorking || reviewNodes.length === 0}
            >
              {isWorking
                ? "Creating..."
                : `Create ${reviewNodes.length} ${reviewNodes.length === 1 ? "Location" : "Locations"}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};
