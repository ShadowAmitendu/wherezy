import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Chip,
  Tooltip,
  Divider,
  Switch,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import QrCodeOutlinedIcon from "@mui/icons-material/QrCodeOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import ShelvesIcon from "@mui/icons-material/Shelves";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { PageHeader } from "../../components/shared/PageHeader";
import { EmptyState } from "../../components/shared/EmptyState";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { LocationBreadcrumb } from "../../components/shared/LocationBreadcrumb";
import { PhotoManager } from "../photos/PhotoManager";
import { AILocationTreeDialog } from "./AILocationTreeDialog";
import { LocationPicker } from "./LocationPicker";
import { LocationIcon } from "./LocationIcon";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { useUndo, useOnUndoRefresh } from "../../components/shared/UndoContext";
import { useAuth } from "../../auth/useAuth";
import { api, ApiException } from "../../api/client";
import { formatTakenOutStatusLabel, getItemQuantity } from "../items/quantityUtils";
import {
  isRoomKind,
  ROOM_GROUP_KINDS,
  STORAGE_AREA_KINDS,
} from "./locationUtils";

interface DraftSubLocation {
  key: string;
  name: string;
  kind: string;
}

function findAncestorIds(nodes: any[], targetId: number, trail: number[] = []): number[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [...trail, node.id];
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findAncestorIds(node.children, targetId, [...trail, node.id]);
      if (found) return found;
    }
  }
  return null;
}

export const LocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedIdParam = searchParams.get("selected");
  const requestedSelectedId = requestedIdParam ? Number(requestedIdParam) : null;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { currentProfile } = useAuth();
  const { showUndo } = useUndo();
  const [tree, setTree] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    requestedSelectedId && !Number.isNaN(requestedSelectedId) ? requestedSelectedId : null
  );
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [locationItems, setLocationItems] = useState<any[]>([]);
  const [includeSub, setIncludeSub] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Add / Edit Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [editingLoc, setEditingLoc] = useState<any | null>(null);
  const [locationRole, setLocationRole] = useState<"room" | "area">("room");
  const [parentTargetId, setParentTargetId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Room");
  const [storageOnly, setStorageOnly] = useState(false);
  const [starterChildren, setStarterChildren] = useState<DraftSubLocation[]>([]);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Batch add shelves / storage areas modal state
  const [batchParent, setBatchParent] = useState<any | null>(null);
  const [batchRows, setBatchRows] = useState<DraftSubLocation[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);

  // Move Dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingLoc, setMovingLoc] = useState<any | null>(null);
  const [targetParentId, setTargetParentId] = useState<number | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const expandTreeDefaults = useCallback((data: any[], focusId?: number | null) => {
    const initExpanded: Record<number, boolean> = {};
    data.forEach((n) => {
      initExpanded[n.id] = true;
    });
    if (focusId) {
      const pathIds = findAncestorIds(data, focusId);
      if (pathIds) {
        pathIds.forEach((id) => {
          initExpanded[id] = true;
        });
      }
    }
    setExpandedNodes((prev) => ({ ...initExpanded, ...prev }));
  }, []);

  const loadTree = async (nextFocusId?: number | null) => {
    try {
      setIsLoading(true);
      const data = await api.getLocationsTree();
      setTree(data);
      const activeFocus = nextFocusId ?? selectedLocationId;
      expandTreeDefaults(data, activeFocus);

      if (nextFocusId) {
        setSelectedLocationId(nextFocusId);
      } else if (!selectedLocationId && data.length > 0) {
        setSelectedLocationId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    try {
      const [detail, items] = await Promise.all([
        api.getLocation(id),
        api.getLocationItems(id, includeSub),
      ]);
      setSelectedDetail(detail);
      setLocationItems(items);
    } catch (err) {
      console.error(err);
      setSelectedDetail(null);
      setLocationItems([]);
    }
  };

  useOnUndoRefresh(() => {
    void loadTree();
    if (selectedLocationId) {
      void loadDetail(selectedLocationId);
    }
  });

  useEffect(() => {
    let active = true;
    api
      .getLocationsTree()
      .then((data) => {
        if (!active) return;
        setTree(data);
        const preferredId =
          requestedSelectedId && !Number.isNaN(requestedSelectedId)
            ? requestedSelectedId
            : data[0]?.id ?? null;
        expandTreeDefaults(data, preferredId);
        if (preferredId) {
          setSelectedLocationId((prev) => prev ?? preferredId);
        }
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
  }, [expandTreeDefaults, requestedSelectedId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    let active = true;
    Promise.all([
      api.getLocation(selectedLocationId),
      api.getLocationItems(selectedLocationId, includeSub),
    ])
      .then(([detail, items]) => {
        if (!active) return;
        setSelectedDetail(detail);
        setLocationItems(items);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        setSelectedDetail(null);
        setLocationItems([]);
      });
    return () => {
      active = false;
    };
  }, [selectedLocationId, includeSub]);

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRoleSwitch = (nextRole: "room" | "area") => {
    setLocationRole(nextRole);
    if (nextRole === "room") {
      if (!isRoomKind(kind)) setKind("Room");
      if (!editingLoc) setParentTargetId(null);
    } else {
      if (isRoomKind(kind)) setKind("Storage Area");
      setStorageOnly(false);
    }
  };

  const handleOpenAdd = (
    parentId: number | null = null,
    preferredRole?: "room" | "area",
    preferredKind?: string
  ) => {
    const role: "room" | "area" = preferredRole || (parentId ? "area" : "room");
    setEditingLoc(null);
    setLocationRole(role);
    setParentTargetId(parentId);
    setName("");
    setKind(preferredKind || (role === "room" ? "Room" : "Storage Area"));
    setStorageOnly(false);
    setStarterChildren([]);
    setNotes("");
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (loc: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const role: "room" | "area" = isRoomKind(loc.kind) ? "room" : "area";
    setEditingLoc(loc);
    setLocationRole(role);
    setParentTargetId(loc.parent_id ?? null);
    setName(loc.name);
    setKind(loc.kind);
    setStorageOnly(Boolean(loc.storage_only));
    setStarterChildren([]);
    setNotes(loc.notes || "");
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleAddStarterChild = (childKind = "Shelf") => {
    setStarterChildren((prev) => [
      ...prev,
      { key: `sub-${Date.now()}-${prev.length + 1}`, name: "", kind: childKind },
    ]);
  };

  const handleSaveLocation = async (keepAdding = false) => {
    if (!name.trim()) {
      setErrorMsg("Location name is required");
      return;
    }
    const cleanChildren = starterChildren
      .map((c) => ({ name: c.name.trim(), kind: c.kind || "Shelf" }))
      .filter((c) => c.name.length > 0);

    setIsSaving(true);
    setErrorMsg(null);
    try {
      if (editingLoc) {
        const editedId = editingLoc.id;
        const prevSnapshot = {
          name: editingLoc.name,
          kind: editingLoc.kind || "Room",
          parent_id: editingLoc.parent_id ?? null,
          storage_only: Boolean(editingLoc.storage_only),
          notes: editingLoc.notes ?? null,
        };
        const updated = await api.updateLocation(editedId, {
          name: name.trim(),
          kind: kind.trim() || "Room",
          parent_id: parentTargetId,
          storage_only: locationRole === "room" ? storageOnly : false,
          notes: notes.trim() || null,
        });
        setDialogOpen(false);
        await loadTree(updated.id);
        await loadDetail(updated.id);
        showUndo({
          message: `Updated location "${updated.name}"`,
          onUndo: async () => {
            await api.updateLocation(editedId, prevSnapshot);
          },
        });
      } else {
        const created = await api.createLocation({
          name: name.trim(),
          kind: kind.trim() || "Room",
          storage_only: locationRole === "room" ? storageOnly && cleanChildren.length === 0 : false,
          notes: notes.trim() || null,
          parent_id: parentTargetId,
          children: locationRole === "room" && !storageOnly ? cleanChildren : [],
        });

        const createdId = created.id;
        const createdName = created.name;
        showUndo({
          message: `Created "${createdName}"`,
          onUndo: async () => {
            const detail = await api.getLocation(createdId).catch(() => null);
            const children: any[] = detail?.children || [];
            for (const child of [...children].reverse()) {
              await api.deleteLocation(child.id);
            }
            await api.deleteLocation(createdId);
          },
        });

        if (keepAdding && parentTargetId) {
          setName("");
          setNotes("");
          setErrorMsg(null);
          await loadTree(parentTargetId);
          await loadDetail(parentTargetId);
        } else {
          setDialogOpen(false);
          await loadTree(created.id);
          await loadDetail(created.id);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.error?.message || "Failed to save location");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenBatchChildren = (loc: any) => {
    setBatchParent(loc);
    const isRoom = isRoomKind(loc.kind);
    setBatchRows(
      isRoom
        ? [
            { key: `b-${Date.now()}-1`, name: "", kind: "Shelf" },
            { key: `b-${Date.now()}-2`, name: "", kind: "Storage Area" },
          ]
        : [
            { key: `b-${Date.now()}-1`, name: "", kind: "Box" },
            { key: `b-${Date.now()}-2`, name: "", kind: "Box" },
          ]
    );
    setBatchError(null);
  };

  const handleSaveBatchChildren = async () => {
    if (!batchParent) return;
    const cleaned = batchRows
      .map((r) => ({ name: r.name.trim(), kind: r.kind || "Shelf" }))
      .filter((r) => r.name.length > 0);
    if (cleaned.length === 0) {
      setBatchError("Enter at least one shelf or storage area name.");
      return;
    }

    setBatchSaving(true);
    setBatchError(null);
    try {
      const createdChildren = await api.addLocationChildren(batchParent.id, cleaned);
      const targetId = batchParent.id;
      const parentName = batchParent.name;
      setBatchParent(null);
      await loadTree(targetId);
      await loadDetail(targetId);
      if (Array.isArray(createdChildren) && createdChildren.length > 0) {
        const idsToDelete = [...createdChildren].reverse().map((c: any) => c.id);
        showUndo({
          message: `Added ${idsToDelete.length} shelf/storage ${idsToDelete.length === 1 ? "area" : "areas"} to "${parentName}"`,
          onUndo: async () => {
            for (const cid of idsToDelete) {
              await api.deleteLocation(cid);
            }
          },
        });
      }
    } catch (err: any) {
      setBatchError(err?.error?.message || "Failed to add shelves / storage areas");
    } finally {
      setBatchSaving(false);
    }
  };

  const handleOpenMove = (loc: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setMovingLoc(loc);
    setTargetParentId(loc.parent_id);
    setErrorMsg(null);
    setMoveDialogOpen(true);
  };

  const handleSaveMove = async () => {
    if (!movingLoc) return;
    const locId = movingLoc.id;
    const locName = movingLoc.name;
    const prevParentId = movingLoc.parent_id ?? null;
    try {
      await api.moveLocation(locId, targetParentId);
      setMoveDialogOpen(false);
      await loadTree();
      if (selectedLocationId === locId) {
        loadDetail(locId);
      }
      showUndo({
        message: `Moved location "${locName}"`,
        onUndo: async () => {
          await api.moveLocation(locId, prevParentId);
        },
      });
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Cannot move location");
    }
  };

  const handleDeleteLocation = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    const deletedName = deleteTarget.name;
    try {
      await api.deleteLocation(deletedId);
      setDeleteTarget(null);
      if (selectedLocationId === deletedId) {
        setSelectedLocationId(null);
        setSelectedDetail(null);
      }
      await loadTree();
      if (currentProfile?.role === "admin") {
        showUndo({
          message: `Deleted location "${deletedName}"`,
          onUndo: async () => {
            await api.restoreTrash("location", deletedId);
          },
        });
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError("Failed to delete location");
      }
    }
  };

  const groupedLocationItems = useMemo(() => {
    const groups = new Map<string, { label: string; locationId: number | null; items: any[] }>();
    for (const it of locationItems) {
      const locId = it.location_id ?? null;
      const isDirect = selectedDetail && locId === selectedDetail.id;
      const label = isDirect
        ? `Directly in ${selectedDetail.name}`
        : it.location_path || it.location_name || "Sub-location";
      const key = `${locId ?? "direct"}:${label}`;
      if (!groups.has(key)) {
        groups.set(key, { label, locationId: locId, items: [] });
      }
      groups.get(key)!.items.push(it);
    }
    return Array.from(groups.values());
  }, [locationItems, selectedDetail]);

  const renderTreeNode = (node: any, depth = 0) => {
    const isExpanded = Boolean(expandedNodes[node.id]);
    const isSelected = selectedLocationId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const nodeIsRoom = typeof node.is_room === "boolean" ? node.is_room : isRoomKind(node.kind);
    const totalCount =
      typeof node.total_items_count === "number" ? node.total_items_count : node.items_count || 0;
    const subCount =
      typeof node.children_count === "number"
        ? node.children_count
        : Array.isArray(node.children)
          ? node.children.length
          : 0;

    return (
      <React.Fragment key={node.id}>
        <ListItem
          disablePadding
          sx={{
            display: "block",
            mb: nodeIsRoom && depth === 0 ? 0.75 : 0.4,
          }}
        >
          <ListItemButton
            selected={isSelected}
            onClick={() => setSelectedLocationId(node.id)}
            sx={{
              pl: 1 + depth * 2,
              py: nodeIsRoom && depth === 0 ? 0.9 : 0.65,
              borderRadius: 1.5,
              bgcolor:
                nodeIsRoom && depth === 0 && !isSelected
                  ? (t) => alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.06 : 0.04)
                  : undefined,
              "&.Mui-selected": {
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? alpha(t.palette.primary.main, 0.18)
                    : alpha(t.palette.primary.main, 0.12),
                color: "primary.main",
                "& .MuiListItemIcon-root": {
                  color: "primary.main",
                },
                "&:hover": {
                  bgcolor: (t) =>
                    t.palette.mode === "dark"
                      ? alpha(t.palette.primary.main, 0.24)
                      : alpha(t.palette.primary.main, 0.18),
                },
              },
            }}
          >
            <ListItemIcon
              sx={{ minWidth: 32, display: "flex", alignItems: "center", gap: 0.25 }}
              onClick={(e) => hasChildren && toggleExpand(node.id, e)}
            >
              {hasChildren ? (
                isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />
              ) : (
                <LocationIcon kind={node.kind} fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flexWrap: "wrap" }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: nodeIsRoom || isSelected ? 700 : 500 }}
                    noWrap
                  >
                    {node.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({node.kind})
                  </Typography>
                  {nodeIsRoom && node.storage_only && subCount === 0 && (
                    <Chip
                      label="Storage-only"
                      size="small"
                      variant="outlined"
                      color="secondary"
                      sx={{ height: 18, fontSize: "0.65rem" }}
                    />
                  )}
                  {nodeIsRoom && subCount > 0 && (
                    <Chip
                      label={`${subCount} ${subCount === 1 ? "area" : "areas"}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: "0.65rem" }}
                    />
                  )}
                  {totalCount > 0 && (
                    <Chip
                      label={totalCount}
                      size="small"
                      color={nodeIsRoom ? "primary" : "default"}
                      sx={{ height: 18, fontSize: "0.7rem" }}
                    />
                  )}
                </Box>
              }
            />
            <Box sx={{ display: "flex", opacity: isSelected ? 1 : 0.65, "&:hover": { opacity: 1 } }}>
              <Tooltip title={nodeIsRoom ? "Add Shelf / Storage Area" : "Add sub-location"}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAdd(node.id, "area", nodeIsRoom ? "Storage Area" : "Box");
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={(e) => handleOpenEdit(node, e)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Move">
                <IconButton size="small" onClick={(e) => handleOpenMove(node, e)}>
                  <DriveFileMoveOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(node);
                  }}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </ListItemButton>
        </ListItem>

        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List disablePadding sx={{ borderLeft: "1px dashed", borderColor: "divider", ml: 1.5 + depth * 2 }}>
              {node.children.map((child: any) => renderTreeNode(child, depth + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  const selectedIsRoom = selectedDetail
    ? typeof selectedDetail.is_room === "boolean"
      ? selectedDetail.is_room
      : isRoomKind(selectedDetail.kind)
    : false;
  const selectedChildren = Array.isArray(selectedDetail?.children) ? selectedDetail.children : [];
  const selectedTotalCount = selectedDetail
    ? typeof selectedDetail.total_items_count === "number"
      ? selectedDetail.total_items_count
      : locationItems.length
    : 0;

  return (
    <Box>
      <PageHeader
        title="Rooms & Storage Locations"
        subtitle="Use Rooms to group shelves and storage areas, or as standalone storage-only places"
        icon={<PlaceOutlinedIcon />}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setAiDialogOpen(true)}
            >
              AI Setup Tree
            </Button>
            <Button
              variant="outlined"
              startIcon={<ShelvesIcon />}
              onClick={() => handleOpenAdd(selectedIsRoom ? selectedDetail?.id : selectedDetail?.room_id ?? null, "area", "Storage Area")}
              disabled={tree.length === 0}
            >
              Add Shelf / Area
            </Button>
            <Button
              variant="contained"
              startIcon={<MeetingRoomOutlinedIcon />}
              onClick={() => handleOpenAdd(null, "room", "Room")}
            >
              New Room / Place
            </Button>
          </Box>
        }
      />

      {aiNotice && (
        <Alert severity="success" sx={{ mb: 2.5 }} onClose={() => setAiNotice(null)}>
          {aiNotice}
        </Alert>
      )}

      <AlertDialog
        open={Boolean(deleteError)}
        onClose={() => setDeleteError(null)}
        title="Cannot Delete Location"
        message={deleteError}
        severity="error"
      />

      {tree.length === 0 && !isLoading ? (
        <EmptyState
          title="No Rooms or Storage Locations"
          description="Create a Room to group shelves and storage areas, or mark it as a standalone storage-only place."
          actionLabel="Add First Room"
          onAction={() => handleOpenAdd(null, "room", "Room")}
        />
      ) : (
        <Grid container spacing={3}>
          {/* Tree Pane */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Card>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Rooms & Hierarchy
                  </Typography>
                  <Button size="small" onClick={() => handleOpenAdd(null, "room", "Room")}>
                    + Add Room / Place
                  </Button>
                </Box>
                <Divider sx={{ mb: 1.5 }} />
                <List sx={{ width: "100%", maxHeight: "70vh", overflow: "auto" }}>
                  {tree.map((node) => renderTreeNode(node, 0))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Location Detail Pane */}
          <Grid size={{ xs: 12, md: 7 }}>
            {selectedDetail ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
                      <Box>
                        <LocationBreadcrumb
                          breadcrumbs={selectedDetail.breadcrumbs}
                          onSelect={(id) => setSelectedLocationId(id)}
                        />
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1, flexWrap: "wrap" }}>
                          <LocationIcon kind={selectedDetail.kind} fontSize="medium" />
                          <Typography variant="h5" sx={{ fontWeight: 700 }}>
                            {selectedDetail.name}
                          </Typography>
                          {selectedIsRoom ? (
                            selectedDetail.storage_only && selectedChildren.length === 0 ? (
                              <Chip
                                size="small"
                                color="secondary"
                                label="Separate Storage-Only Place"
                              />
                            ) : (
                              <Chip
                                size="small"
                                color="primary"
                                variant="outlined"
                                label={`Higher Grouping Room (${selectedChildren.length} ${selectedChildren.length === 1 ? "sub-area" : "sub-areas"})`}
                              />
                            )
                          ) : (
                            <Chip size="small" variant="outlined" label={selectedDetail.kind} />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Type: {selectedDetail.kind} • {selectedTotalCount} total{" "}
                          {selectedTotalCount === 1 ? "item" : "items"}
                          {selectedChildren.length > 0 && selectedDetail.items_count > 0
                            ? ` (${selectedDetail.items_count} directly here)`
                            : ""}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => handleOpenBatchChildren(selectedDetail)}
                        >
                          {selectedIsRoom ? "Add Shelves / Areas" : "Add Sub-locations / Boxes"}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<PrintOutlinedIcon />}
                          onClick={() => navigate(`/print/location/${selectedDetail.id}`)}
                        >
                          Print Shelf List
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<QrCodeOutlinedIcon />}
                          onClick={() => navigate(`/labels?location_id=${selectedDetail.id}`)}
                        >
                          Print Label
                        </Button>
                      </Box>
                    </Box>

                    {selectedIsRoom && selectedDetail.storage_only && selectedChildren.length === 0 && (
                      <Alert
                        severity="info"
                        sx={{ my: 1.5 }}
                        action={
                          <Button
                            size="small"
                            color="inherit"
                            onClick={() => handleOpenBatchChildren(selectedDetail)}
                          >
                            Add Shelves Instead
                          </Button>
                        }
                      >
                        This Room acts as a standalone storage-only place — assign items directly to{" "}
                        <strong>{selectedDetail.name}</strong> without sub-shelves.
                      </Alert>
                    )}

                    {selectedDetail.notes && (
                      <Typography variant="body2" sx={{ my: 1.5, p: 1.5, bgcolor: "action.hover", borderRadius: 1.5 }}>
                        {selectedDetail.notes}
                      </Typography>
                    )}

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                      Location Photos
                    </Typography>
                    <PhotoManager ownerType="location" ownerId={selectedDetail.id} />
                  </CardContent>
                </Card>

                {/* Shelves & Storage Areas Card */}
                {(selectedIsRoom || selectedChildren.length > 0) &&
                  !(selectedDetail.storage_only && selectedChildren.length === 0) && (
                    <Card>
                      <CardContent>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                            mb: 1.5,
                          }}
                        >
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {selectedIsRoom ? "Shelves & Storage Areas" : "Boxes & Containers"} ({selectedChildren.length})
                          </Typography>
                          <Button
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() => handleOpenBatchChildren(selectedDetail)}
                          >
                            {selectedIsRoom ? "Add Shelves / Areas" : "Add Sub-locations / Boxes"}
                          </Button>
                        </Box>

                        {selectedChildren.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No shelves or storage areas inside {selectedDetail.name} yet. Add one above, or store items
                            directly in this room.
                          </Typography>
                        ) : (
                          <Grid container spacing={1.5}>
                            {selectedChildren.map((child: any) => {
                              const childTotal =
                                typeof child.total_items_count === "number"
                                  ? child.total_items_count
                                  : child.items_count || 0;
                              return (
                                <Grid key={child.id} size={{ xs: 12, sm: 6 }}>
                                  <Paper
                                    variant="outlined"
                                    onClick={() => setSelectedLocationId(child.id)}
                                    sx={{
                                      p: 1.5,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 1,
                                      transition: (t) =>
                                        t.transitions.create(["border-color", "background-color"], {
                                          duration: t.transitions.duration.shortest,
                                        }),
                                      "&:hover": {
                                        borderColor: "primary.main",
                                        bgcolor: "action.hover",
                                      },
                                    }}
                                  >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                      <LocationIcon kind={child.kind} fontSize="small" />
                                      <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                                          {child.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                          {child.kind}
                                          {child.children_count > 0
                                            ? ` • ${child.children_count} nested`
                                            : ""}
                                        </Typography>
                                      </Box>
                                    </Box>
                                    <Chip
                                      size="small"
                                      label={`${childTotal} ${childTotal === 1 ? "item" : "items"}`}
                                      variant="outlined"
                                    />
                                  </Paper>
                                </Grid>
                              );
                            })}
                          </Grid>
                        )}
                      </CardContent>
                    </Card>
                  )}

                {/* Items in this location */}
                <Card>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Stored Items ({locationItems.length})
                        </Typography>
                        {selectedChildren.length > 0 && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={includeSub}
                                onChange={(e) => setIncludeSub(e.target.checked)}
                                size="small"
                              />
                            }
                            label={
                              <Typography variant="caption">
                                Include Shelves & Storage Areas
                              </Typography>
                            }
                          />
                        )}
                      </Box>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          endIcon={<OpenInNewIcon fontSize="small" />}
                          onClick={() => navigate(`/items?location_id=${selectedDetail.id}`)}
                        >
                          View in Items
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => navigate(`/items?action=new&location_id=${selectedDetail.id}`)}
                        >
                          Add Item Here
                        </Button>
                      </Box>
                    </Box>

                    {locationItems.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No items stored here yet.
                      </Typography>
                    ) : includeSub && selectedChildren.length > 0 ? (
                      <Stack spacing={2}>
                        {groupedLocationItems.map((group) => (
                          <Box key={group.label}>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                px: 1,
                                py: 0.5,
                                mb: 0.5,
                                borderRadius: 1,
                                bgcolor: "action.hover",
                                cursor:
                                  group.locationId && group.locationId !== selectedDetail.id
                                    ? "pointer"
                                    : "default",
                              }}
                              onClick={() => {
                                if (group.locationId && group.locationId !== selectedDetail.id) {
                                  setSelectedLocationId(group.locationId);
                                }
                              }}
                            >
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                {group.label}
                              </Typography>
                              <Chip label={group.items.length} size="small" sx={{ height: 18, fontSize: "0.7rem" }} />
                            </Box>
                            <List disablePadding>
                              {group.items.map((it) => (
                                <ListItem
                                  key={it.id}
                                  divider
                                  sx={{
                                    px: 1,
                                    cursor: "pointer",
                                    "&:hover": { bgcolor: "action.hover" },
                                  }}
                                  onClick={() => navigate(`/items?selected=${it.id}`)}
                                >
                                  <ListItemIcon sx={{ minWidth: 36 }}>
                                    <Inventory2OutlinedIcon fontSize="small" color="primary" />
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={it.name}
                                    secondary={`${it.category_name || "Uncategorized"}${
                                      getItemQuantity(it) > 1 ? ` • Qty: ${getItemQuantity(it)}` : ""
                                    }`}
                                  />
                                  {it.taken_out && (
                                    <Chip
                                      label={formatTakenOutStatusLabel(it)}
                                      size="small"
                                      color="secondary"
                                      variant="outlined"
                                    />
                                  )}
                                </ListItem>
                              ))}
                            </List>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <List disablePadding>
                        {locationItems.map((it) => (
                          <ListItem
                            key={it.id}
                            divider
                            sx={{
                              px: 1,
                              cursor: "pointer",
                              "&:hover": { bgcolor: "action.hover" },
                            }}
                            onClick={() => navigate(`/items?selected=${it.id}`)}
                          >
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Inventory2OutlinedIcon fontSize="small" color="primary" />
                            </ListItemIcon>
                            <ListItemText
                              primary={it.name}
                              secondary={`${it.category_name || "Uncategorized"}${
                                it.location_path ? ` • ${it.location_path}` : ""
                              }${getItemQuantity(it) > 1 ? ` • Qty: ${getItemQuantity(it)}` : ""}`}
                            />
                            {it.taken_out && (
                              <Chip
                                label={formatTakenOutStatusLabel(it)}
                                size="small"
                                color="secondary"
                                variant="outlined"
                              />
                            )}
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </CardContent>
                </Card>
              </Box>
            ) : (
              <Card sx={{ p: 4, textAlign: "center" }}>
                <Typography variant="body1" color="text.secondary">
                  Select a room or storage area from the tree to inspect its shelves, items, and print labels.
                </Typography>
              </Card>
            )}
          </Grid>
        </Grid>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {editingLoc
            ? "Edit Location"
            : locationRole === "room"
              ? "New Room / Storage Place"
              : "New Shelf / Storage Area"}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.25, pt: "16px !important" }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Location Error"
            message={errorMsg}
            severity="error"
          />

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
              Hierarchy Tier
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={locationRole}
              onChange={(_, val) => {
                if (val) handleRoleSwitch(val);
              }}
            >
              <ToggleButton value="room">
                <MeetingRoomOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />
                Room / Separate Place
              </ToggleButton>
              <ToggleButton value="area">
                <ShelvesIcon fontSize="small" sx={{ mr: 0.75 }} />
                Shelf / Storage Area
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            label={locationRole === "room" ? "Room / Place Name" : "Shelf / Storage Area Name"}
            placeholder={
              locationRole === "room"
                ? "e.g. Kitchen, Garage, Spare Store Room"
                : "e.g. Top Shelf, Corner Storage Area, Tool Drawer"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />

          <FormControl fullWidth>
            <InputLabel id="location-kind-label">Kind / Type</InputLabel>
            <Select
              labelId="location-kind-label"
              value={kind}
              label="Kind / Type"
              onChange={(e) => setKind(e.target.value)}
            >
              {(locationRole === "room" ? ROOM_GROUP_KINDS : STORAGE_AREA_KINDS).map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <LocationPicker
            value={parentTargetId}
            onChange={(val) => setParentTargetId(val)}
            excludeId={editingLoc?.id}
            roomsOnly={locationRole === "room"}
            label={
              locationRole === "room"
                ? "Parent Grouping Space (Optional)"
                : "Inside Room / Parent Location"
            }
            emptyLabel={
              locationRole === "room"
                ? "Top Level (Primary Room / Place)"
                : "None (Standalone Container)"
            }
            helperText={
              locationRole === "room"
                ? "Rooms stay at the top grouping tier above shelves and storage areas."
                : "Assign this shelf or storage area inside a Room so items roll up under it."
            }
          />

          {locationRole === "room" && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={storageOnly}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setStorageOnly(next);
                      if (next) setStarterChildren([]);
                    }}
                    disabled={Boolean(editingLoc?.children_count > 0)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Separate storage-only place (no sub-shelves needed)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Store items directly inside this room without subdividing it into shelves.
                    </Typography>
                  </Box>
                }
              />

              {!editingLoc && !storageOnly && (
                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                      mb: starterChildren.length > 0 ? 1 : 0,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      Starter Shelves / Storage Areas (Optional)
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.75 }}>
                      <Button size="small" onClick={() => handleAddStarterChild("Shelf")}>
                        + Shelf
                      </Button>
                      <Button size="small" onClick={() => handleAddStarterChild("Storage Area")}>
                        + Storage Area
                      </Button>
                    </Box>
                  </Box>

                  {starterChildren.length > 0 && (
                    <Stack spacing={1}>
                      {starterChildren.map((row, idx) => (
                        <Box key={row.key} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                          <TextField
                            size="small"
                            placeholder={`Shelf / Area ${idx + 1} name`}
                            value={row.name}
                            onChange={(e) =>
                              setStarterChildren((prev) =>
                                prev.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r))
                              )
                            }
                            sx={{ flex: 1 }}
                          />
                          <Select
                            size="small"
                            value={row.kind}
                            onChange={(e) =>
                              setStarterChildren((prev) =>
                                prev.map((r) => (r.key === row.key ? { ...r, kind: e.target.value } : r))
                              )
                            }
                            sx={{ minWidth: 130 }}
                          >
                            {STORAGE_AREA_KINDS.map((k) => (
                              <MenuItem key={k} value={k}>
                                {k}
                              </MenuItem>
                            ))}
                          </Select>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() =>
                              setStarterChildren((prev) => prev.filter((r) => r.key !== row.key))
                            }
                          >
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              )}
            </Paper>
          )}

          <TextField
            label="Notes (Optional)"
            placeholder="e.g. Key to cupboard is in drawer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          {!editingLoc && locationRole === "area" && parentTargetId && (
            <Button
              variant="outlined"
              onClick={() => void handleSaveLocation(true)}
              disabled={isSaving}
            >
              Save & Add Another
            </Button>
          )}
          <Button variant="contained" onClick={() => void handleSaveLocation(false)} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Add Shelves / Storage Areas Modal */}
      <Dialog
        open={Boolean(batchParent)}
        onClose={() => !batchSaving && setBatchParent(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {isRoomKind(batchParent?.kind) ? "Add Shelves & Storage Areas in " : "Add Boxes & Containers in "}
          {batchParent?.name}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "16px !important" }}>
          {batchError && (
            <Alert severity="error" onClose={() => setBatchError(null)}>
              {batchError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            {isRoomKind(batchParent?.kind)
              ? `Add one or multiple shelves, storage areas, cupboards, or racks grouped under ${batchParent?.name}.`
              : `Add one or multiple storage boxes, bins, or containers grouped under ${batchParent?.name}.`}
          </Typography>
          <Stack spacing={1.25}>
            {batchRows.map((row, idx) => (
              <Box key={row.key} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <TextField
                  size="small"
                  autoFocus={idx === 0}
                  placeholder={
                    isRoomKind(batchParent?.kind)
                      ? `e.g. Shelf ${idx + 1} or North Storage Area`
                      : `e.g. Box ${idx + 1} or Cable Bin`
                  }
                  value={row.name}
                  onChange={(e) =>
                    setBatchRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r))
                    )
                  }
                  sx={{ flex: 1 }}
                />
                <Select
                  size="small"
                  value={row.kind}
                  onChange={(e) =>
                    setBatchRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, kind: e.target.value } : r))
                    )
                  }
                  sx={{ minWidth: 135 }}
                >
                  {STORAGE_AREA_KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </Select>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setBatchRows((prev) => prev.filter((r) => r.key !== row.key))}
                  disabled={batchRows.length <= 1}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                setBatchRows((prev) => [
                  ...prev,
                  { key: `b-${Date.now()}-${prev.length + 1}`, name: "", kind: "Box" },
                ])
              }
            >
              Add Box Row
            </Button>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                setBatchRows((prev) => [
                  ...prev,
                  { key: `b-${Date.now()}-${prev.length + 1}`, name: "", kind: "Shelf" },
                ])
              }
            >
              Add Shelf Row
            </Button>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                setBatchRows((prev) => [
                  ...prev,
                  { key: `b-${Date.now()}-${prev.length + 1}`, name: "", kind: "Storage Area" },
                ])
              }
            >
              Add Storage Area Row
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchParent(null)} disabled={batchSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleSaveBatchChildren()} disabled={batchSaving}>
            {batchSaving ? "Adding..." : "Save Shelves / Areas"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Move Location</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "24px !important" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Select a new parent location for &quot;{movingLoc?.name}&quot;:
          </Typography>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Move Location Error"
            message={errorMsg}
            severity="error"
          />
          <LocationPicker
            value={targetParentId}
            onChange={(newParent) => setTargetParentId(newParent)}
            excludeId={movingLoc?.id}
            roomsOnly={isRoomKind(movingLoc?.kind)}
            label={isRoomKind(movingLoc?.kind) ? "New Parent Grouping Space" : "New Parent Room / Location"}
            emptyLabel={
              isRoomKind(movingLoc?.kind)
                ? "Top Level (Primary Room / Place)"
                : "None / Top Level"
            }
            helperText={
              isRoomKind(movingLoc?.kind)
                ? "Rooms are higher grouping spaces and cannot be nested under shelves or boxes."
                : undefined
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveMove}>
            Move
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Location"
        message={`Are you sure you want to delete '${deleteTarget?.name}'? Deletion will be rejected if this location contains sub-locations or items.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteLocation}
        onCancel={() => setDeleteTarget(null)}
      />

      <AILocationTreeDialog
        open={aiDialogOpen}
        initialParentId={null}
        onClose={() => setAiDialogOpen(false)}
        onCreated={async (createdCount, summary, createdLocations) => {
          setAiDialogOpen(false);
          setAiNotice(
            summary || `AI created ${createdCount} storage ${createdCount === 1 ? "location" : "locations"}.`
          );
          if (createdLocations && createdLocations.length > 0) {
            const idsReverse = [...createdLocations].reverse().map((loc) => loc.id);
            showUndo({
              message: `AI created ${createdCount} ${createdCount === 1 ? "location" : "locations"}`,
              onUndo: async () => {
                for (const id of idsReverse) {
                  await api.deleteLocation(id);
                }
                setAiNotice(null);
              },
            });
          }
          await loadTree();
        }}
      />
    </Box>
  );
};
