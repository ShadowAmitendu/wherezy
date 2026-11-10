import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Snackbar,
  Divider,
  Switch,
  FormControlLabel,
  Grid,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import QrCodeOutlinedIcon from "@mui/icons-material/QrCodeOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { EmptyState } from "../../components/shared/EmptyState";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { LocationBreadcrumb } from "../../components/shared/LocationBreadcrumb";
import { PhotoManager } from "../photos/PhotoManager";
import { LocationPicker } from "./LocationPicker";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { api, ApiException } from "../../api/client";

const SUGGESTED_KINDS = [
  "Room",
  "Cupboard",
  "Shelf",
  "Drawer",
  "Box",
  "Bag",
  "Bin",
  "Rack",
  "Garage",
  "Shed",
  "Attic",
  "Basement",
];

export const LocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tree, setTree] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [locationItems, setLocationItems] = useState<any[]>([]);
  const [includeSub, setIncludeSub] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Add / Edit Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<any | null>(null);
  const [parentTargetId, setParentTargetId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Room");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Move Dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingLoc, setMovingLoc] = useState<any | null>(null);
  const [targetParentId, setTargetParentId] = useState<number | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadTree = async () => {
    try {
      setIsLoading(true);
      const data = await api.getLocationsTree();
      setTree(data);

      const initExpanded: Record<number, boolean> = {};
      data.forEach((n) => {
        initExpanded[n.id] = true;
      });
      setExpandedNodes((prev) => ({ ...initExpanded, ...prev }));

      if (!selectedLocationId && data.length > 0) {
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
      const detail = await api.getLocation(id);
      setSelectedDetail(detail);
      const items = await api.getLocationItems(id, includeSub);
      setLocationItems(items);
    } catch (err) {
      console.error(err);
      setSelectedDetail(null);
      setLocationItems([]);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  useEffect(() => {
    if (selectedLocationId) {
      loadDetail(selectedLocationId);
    }
  }, [selectedLocationId, includeSub]);

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAdd = (parentId: number | null = null) => {
    setEditingLoc(null);
    setParentTargetId(parentId);
    setName("");
    setKind(parentId ? "Cupboard" : "Room");
    setNotes("");
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (loc: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLoc(loc);
    setName(loc.name);
    setKind(loc.kind);
    setNotes(loc.notes || "");
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!name.trim()) {
      setErrorMsg("Location name is required");
      return;
    }

    try {
      if (editingLoc) {
        await api.updateLocation(editingLoc.id, {
          name: name.trim(),
          kind: kind.trim() || "Room",
          notes: notes.trim() || null,
        });
      } else {
        const created = await api.createLocation({
          name: name.trim(),
          kind: kind.trim() || "Room",
          notes: notes.trim() || null,
          parent_id: parentTargetId,
        });
        setSelectedLocationId(created.id);
      }
      setDialogOpen(false);
      await loadTree();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save location");
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
    try {
      await api.moveLocation(movingLoc.id, targetParentId);
      setMoveDialogOpen(false);
      await loadTree();
      if (selectedLocationId === movingLoc.id) {
        loadDetail(movingLoc.id);
      }
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Cannot move location");
    }
  };

  const handleDeleteLocation = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteLocation(deleteTarget.id);
      setDeleteTarget(null);
      if (selectedLocationId === deleteTarget.id) {
        setSelectedLocationId(null);
        setSelectedDetail(null);
      }
      await loadTree();
    } catch (err: any) {
      if (err instanceof ApiException) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError("Failed to delete location");
      }
    }
  };

  const renderTreeNode = (node: any, depth = 0) => {
    const isExpanded = Boolean(expandedNodes[node.id]);
    const isSelected = selectedLocationId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <React.Fragment key={node.id}>
        <ListItem
          disablePadding
          sx={{
            display: "block",
            mb: 0.5,
          }}
        >
          <ListItemButton
            selected={isSelected}
            onClick={() => setSelectedLocationId(node.id)}
            sx={{
              pl: 1 + depth * 2,
              borderRadius: 1,
              "&.Mui-selected": {
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? alpha(t.palette.primary.main, 0.16)
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
            <ListItemIcon sx={{ minWidth: 28 }} onClick={(e) => hasChildren && toggleExpand(node.id, e)}>
              {hasChildren ? (
                isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />
              ) : (
                <PlaceOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: isSelected ? 700 : 500 }} noWrap>
                    {node.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({node.kind})
                  </Typography>
                  {node.items_count > 0 && (
                    <Chip label={node.items_count} size="small" sx={{ height: 18, fontSize: "0.7rem" }} />
                  )}
                </Box>
              }
            />
            <Box sx={{ display: "flex", opacity: isSelected ? 1 : 0.6, "&:hover": { opacity: 1 } }}>
              <Tooltip title="Add sub-location">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenAdd(node.id);
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
            <List disablePadding>
              {node.children.map((child: any) => renderTreeNode(child, depth + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  return (
    <Box>
      <PageHeader
        title="Storage Locations"
        subtitle="Hierarchy of Rooms, Cupboards, Shelves, and Boxes in your home"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenAdd(null)}
          >
            New Root Location
          </Button>
        }
      />

      <AlertDialog
        open={Boolean(deleteError)}
        onClose={() => setDeleteError(null)}
        title="Cannot Delete Location"
        message={deleteError}
        severity="error"
      />

      {tree.length === 0 && !isLoading ? (
        <EmptyState
          title="No Storage Locations"
          description="Add your first room, cupboard, or shelf to organize where household items live."
          actionLabel="Add Root Location"
          onAction={() => handleOpenAdd(null)}
        />
      ) : (
        <Grid container spacing={3}>
          {/* Tree Pane */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Card>
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Location Tree
                  </Typography>
                  <Button size="small" onClick={() => handleOpenAdd(null)}>
                    + Add Root
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
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
                      <Box>
                        <LocationBreadcrumb breadcrumbs={selectedDetail.breadcrumbs} />
                        <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
                          {selectedDetail.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Kind: {selectedDetail.kind}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
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

                {/* Items in this location */}
                <Card>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Stored Items ({locationItems.length})
                        </Typography>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={includeSub}
                              onChange={(e) => setIncludeSub(e.target.checked)}
                              size="small"
                            />
                          }
                          label={<Typography variant="caption">Include Sub-locations</Typography>}
                        />
                      </Box>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => navigate(`/items?action=new&location_id=${selectedDetail.id}`)}
                      >
                        Add Item Here
                      </Button>
                    </Box>

                    {locationItems.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No items stored here.
                      </Typography>
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
                              secondary={`${it.category_name || "Uncategorized"}${it.location_path ? ` • ${it.location_path}` : ""}`}
                            />
                            {it.taken_out && (
                              <Chip label="Taken out" size="small" color="secondary" variant="outlined" />
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
                  Select a location from the tree to view its contents, photos, and print options.
                </Typography>
              </Card>
            )}
          </Grid>
        </Grid>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingLoc ? "Edit Location" : "New Location"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "24px !important" }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Location Error"
            message={errorMsg}
            severity="error"
          />

          <TextField
            label="Location Name"
            placeholder="e.g. Master Bedroom, Top Shelf, Tool Box A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            autoFocus
            sx={{ mt: 1 }}
          />

          <FormControl fullWidth>
            <InputLabel id="location-kind-label">Kind / Type</InputLabel>
            <Select
              labelId="location-kind-label"
              value={kind}
              label="Kind / Type"
              onChange={(e) => setKind(e.target.value)}
            >
              {SUGGESTED_KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveLocation}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="sm" fullWidth>
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
            label="New Parent Location"
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
    </Box>
  );
};
