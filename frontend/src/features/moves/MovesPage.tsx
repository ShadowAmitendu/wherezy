import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Fade,
  Grow,
  useMediaQuery,
  useTheme,
  LinearProgress,
  Tabs,
  Tab,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Paper,
  InputAdornment,
  Avatar,
  Stack,
  alpha,
} from "@mui/material";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import AddIcon from "@mui/icons-material/Add";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import QrCodeOutlinedIcon from "@mui/icons-material/QrCodeOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ReplayIcon from "@mui/icons-material/Replay";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import CloseIcon from "@mui/icons-material/Close";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import QRCode from "qrcode";

import { api } from "../../api/client";
import { LocationPicker } from "../locations/LocationPicker";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { PageHeader } from "../../components/shared/PageHeader";
import { useUndo, useOnUndoRefresh } from "../../components/shared/UndoContext";

const BOX_PALETTE = [
  { name: "Ocean Blue", hex: "#1976d2" },
  { name: "Emerald Green", hex: "#2e7d32" },
  { name: "Warm Amber", hex: "#ed6c02" },
  { name: "Crimson Red", hex: "#d32f2f" },
  { name: "Royal Purple", hex: "#9c27b0" },
  { name: "Deep Teal", hex: "#00897b" },
  { name: "Slate Grey", hex: "#546e7a" },
  { name: "Berry Pink", hex: "#ec407a" },
];

export const MovesPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { showUndo } = useUndo();
  const [searchParams] = useSearchParams();

  // All moves & active move
  const [allMoves, setAllMoves] = useState<any[]>([]);
  const [activeMove, setActiveMove] = useState<any | null>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [boxFilterTab, setBoxFilterTab] = useState<"all" | "packing" | "packed" | "unpacked">("all");
  const [boxSearchQuery, setBoxSearchQuery] = useState("");

  // Start / Edit Move Dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [isEditingMove, setIsEditingMove] = useState(false);
  const [moveName, setMoveName] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // Finish & Delete Move Confirm Dialogs
  const [finishMoveConfirm, setFinishMoveConfirm] = useState(false);
  const [deleteMoveConfirm, setDeleteMoveConfirm] = useState(false);

  // Add / Edit Box Dialog
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<any | null>(null);
  const [boxLabel, setBoxLabel] = useState("");
  const [boxDestination, setBoxDestination] = useState("");
  const [boxDestLocId, setBoxDestLocId] = useState<number | null>(null);
  const [boxColour, setBoxColour] = useState(BOX_PALETTE[0].hex);
  const [boxNotes, setBoxNotes] = useState("");

  // Delete Box Confirm Dialog
  const [boxToDelete, setBoxToDelete] = useState<any | null>(null);

  // Box Contents & Packing Modal
  const [selectedBox, setSelectedBox] = useState<any | null>(null);
  const [boxItems, setBoxItems] = useState<any[]>([]);
  const [loadingBoxItems, setLoadingBoxItems] = useState(false);
  const [packingTab, setPackingTab] = useState<"search" | "room">("search");

  // Search items in pack modal
  const [itemQuery, setItemQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Room items in pack modal
  const [packSourceLocId, setPackSourceLocId] = useState<number | null>(null);
  const [roomItems, setRoomItems] = useState<any[]>([]);
  const [loadingRoomItems, setLoadingRoomItems] = useState(false);

  // Safe Unpack Dialog
  const [unpackTargetBox, setUnpackTargetBox] = useState<any | null>(null);
  const [unpackTargetLocationId, setUnpackTargetLocationId] = useState<number | null>(null);
  const [unpackSpecificItemIds, setUnpackSpecificItemIds] = useState<number[] | null>(null);
  const [isUnpacking, setIsUnpacking] = useState(false);

  // Print Box Label / Manifest Modal
  const [printBoxTarget, setPrintBoxTarget] = useState<any | null>(null);
  const [printQrDataUrl, setPrintQrDataUrl] = useState<string>("");
  const printContentRef = useRef<HTMLDivElement>(null);

  const loadMoveData = async (preferredMoveId?: number) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const moves = await api.getMoves();
      setAllMoves(moves);
      let targetMove: any = null;
      if (preferredMoveId) {
        targetMove = moves.find((m: any) => m.id === preferredMoveId);
      }
      if (!targetMove) {
        targetMove = moves.find((m: any) => m.status === "planning") || moves[0] || null;
      }
      setActiveMove(targetMove);
      if (targetMove && targetMove.id) {
        const boxList = await api.getBoxes(targetMove.id);
        setBoxes(boxList);
      } else {
        setBoxes([]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.error?.message || "Failed to load move data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const moves = await api.getMoves();
        if (!active) return;
        setAllMoves(moves);

        // Check if query param specifies a box
        const targetBoxParam = searchParams.get("box");
        let initialMove = moves.find((m: any) => m.status === "planning") || moves[0] || null;

        if (targetBoxParam) {
          try {
            const b = await api.getBox(Number(targetBoxParam));
            if (b && b.move_id) {
              const matchingMove = moves.find((m: any) => m.id === b.move_id);
              if (matchingMove) initialMove = matchingMove;
            }
          } catch (e) {
            console.error("Could not preload box from query param", e);
          }
        }

        setActiveMove(initialMove);
        if (initialMove && initialMove.id) {
          const boxList = await api.getBoxes(initialMove.id);
          if (active) setBoxes(boxList);

          if (targetBoxParam) {
            const foundBox = boxList.find((bx: any) => bx.id === Number(targetBoxParam));
            if (foundBox && active) {
              handleOpenBoxDetails(foundBox);
            }
          }
        } else {
          setBoxes([]);
        }
      } catch (err: any) {
        if (!active) return;
        console.error(err);
        setErrorMsg(err.error?.message || "Failed to load move data");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useOnUndoRefresh(() => {
    void loadMoveData(activeMove?.id);
  });

  // Filtered Boxes
  const filteredBoxes = useMemo(() => {
    let result = boxes;
    if (boxFilterTab !== "all") {
      result = result.filter((b) => b.status === boxFilterTab);
    }
    if (boxSearchQuery.trim()) {
      const q = boxSearchQuery.trim().toLowerCase();
      result = result.filter(
        (b) =>
          String(b.number).includes(q) ||
          (b.label || "").toLowerCase().includes(q) ||
          (b.destination || "").toLowerCase().includes(q) ||
          (b.notes || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [boxes, boxFilterTab, boxSearchQuery]);

  const packingBoxesCount = useMemo(() => boxes.filter((b) => b.status === "packing").length, [boxes]);
  const packedBoxesCount = useMemo(() => boxes.filter((b) => b.status === "packed").length, [boxes]);
  const unpackedBoxesCount = useMemo(() => boxes.filter((b) => b.status === "unpacked").length, [boxes]);

  // Handle Move Creation or Update
  const handleOpenCreateMove = () => {
    setIsEditingMove(false);
    setMoveName("");
    setTargetDate("");
    setMoveDialogOpen(true);
  };

  const handleOpenEditMove = () => {
    if (!activeMove) return;
    setIsEditingMove(true);
    setMoveName(activeMove.name || "");
    setTargetDate(activeMove.target_date || "");
    setMoveDialogOpen(true);
  };

  const handleSaveMove = async () => {
    if (!moveName.trim()) {
      setErrorMsg("Move name is required");
      return;
    }
    try {
      if (isEditingMove && activeMove) {
        await api.updateMove(activeMove.id, {
          name: moveName.trim(),
          target_date: targetDate || undefined,
        });
        setSuccessMsg(`Updated move "${moveName.trim()}"`);
      } else {
        const created = await api.createMove({
          name: moveName.trim(),
          target_date: targetDate || undefined,
        });
        setSuccessMsg("Moving house project started!");
        await loadMoveData(created.id);
        setMoveDialogOpen(false);
        return;
      }
      setMoveDialogOpen(false);
      await loadMoveData(activeMove?.id);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save move");
    }
  };

  const handleFinishMove = async () => {
    if (!activeMove) return;
    try {
      await api.finishMove(activeMove.id);
      setSuccessMsg(`Completed move "${activeMove.name}"!`);
      setFinishMoveConfirm(false);
      await loadMoveData(activeMove.id);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to complete move");
    }
  };

  const handleReopenMove = async () => {
    if (!activeMove) return;
    try {
      await api.reopenMove(activeMove.id);
      setSuccessMsg(`Reopened move "${activeMove.name}"!`);
      await loadMoveData(activeMove.id);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to reopen move");
    }
  };

  const handleDeleteMove = async () => {
    if (!activeMove) return;
    try {
      await api.deleteMove(activeMove.id);
      setSuccessMsg(`Deleted move "${activeMove.name}"`);
      setDeleteMoveConfirm(false);
      await loadMoveData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to delete move");
    }
  };

  // Box Add / Edit
  const handleOpenCreateBox = () => {
    setEditingBox(null);
    setBoxLabel("");
    setBoxDestination("");
    setBoxDestLocId(null);
    setBoxColour(BOX_PALETTE[boxes.length % BOX_PALETTE.length].hex);
    setBoxNotes("");
    setBoxDialogOpen(true);
  };

  const handleOpenEditBox = (box: any) => {
    setEditingBox(box);
    setBoxLabel(box.label || "");
    setBoxDestination(box.destination || "");
    setBoxDestLocId(box.destination_location_id || null);
    setBoxColour(box.colour || BOX_PALETTE[0].hex);
    setBoxNotes(box.notes || "");
    setBoxDialogOpen(true);
  };

  const handleSaveBox = async () => {
    if (!activeMove) return;
    if (!boxLabel.trim()) {
      setErrorMsg("Box label is required");
      return;
    }
    try {
      if (editingBox) {
        await api.updateBox(editingBox.id, {
          label: boxLabel.trim(),
          destination: boxDestination.trim() || undefined,
          destination_location_id: boxDestLocId,
          colour: boxColour.trim() || undefined,
          notes: boxNotes.trim() || undefined,
        });
        setSuccessMsg(`Updated Box #${editingBox.number}`);
      } else {
        await api.createBox(activeMove.id, {
          label: boxLabel.trim(),
          destination: boxDestination.trim() || undefined,
          destination_location_id: boxDestLocId,
          colour: boxColour.trim() || undefined,
          notes: boxNotes.trim() || undefined,
        });
        setSuccessMsg("Box created");
      }
      setBoxDialogOpen(false);
      await loadMoveData(activeMove.id);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to save box");
    }
  };

  const handleDeleteBox = async () => {
    if (!boxToDelete) return;
    try {
      await api.deleteBox(boxToDelete.id);
      setSuccessMsg(`Deleted Box #${boxToDelete.number}`);
      setBoxToDelete(null);
      if (selectedBox && selectedBox.id === boxToDelete.id) {
        setSelectedBox(null);
      }
      await loadMoveData(activeMove?.id);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to delete box");
    }
  };

  const handleToggleBoxPackStatus = async (box: any) => {
    try {
      const nextStatus = box.status === "packed" ? "packing" : "packed";
      if (nextStatus === "packed") {
        await api.packBox(box.id);
      } else {
        await api.updateBox(box.id, { status: "packing" });
      }
      setSuccessMsg(`Marked Box #${box.number} as ${nextStatus}`);
      await loadMoveData(activeMove?.id);
      if (selectedBox && selectedBox.id === box.id) {
        setSelectedBox({ ...selectedBox, status: nextStatus });
      }
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to update box status");
    }
  };

  // Box Contents Modal
  const handleOpenBoxDetails = async (box: any) => {
    setSelectedBox(box);
    setLoadingBoxItems(true);
    setItemQuery("");
    setSearchResults([]);
    setPackingTab("search");
    try {
      const b = await api.getBox(box.id);
      setBoxItems(b.items || []);
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to load items in box");
    } finally {
      setLoadingBoxItems(false);
    }
  };

  const handleSearchItems = async (q: string) => {
    setItemQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.quickSearch(q.trim());
      setSearchResults((res.results || []).filter((r: any) => r.type === "item"));
    } catch (err) {
      console.error(err);
    }
  };

  const handlePackItem = async (itemId: number) => {
    if (!selectedBox) return;
    const boxId = selectedBox.id;
    const boxNum = selectedBox.number;
    const packedName =
      searchResults.find((it: any) => it.id === itemId)?.title ||
      roomItems.find((it: any) => it.id === itemId)?.name;
    try {
      await api.addItemsToBox(boxId, [itemId]);
      setItemQuery("");
      setSearchResults([]);
      const updated = await api.getBox(boxId);
      setBoxItems(updated.items || []);
      await loadMoveData(activeMove?.id);

      // Refresh room items if in room tab
      if (packSourceLocId) {
        await loadRoomItems(packSourceLocId);
      }

      showUndo({
        message: packedName ? `Packed "${packedName}" into Box #${boxNum}` : `Packed item into Box #${boxNum}`,
        onUndo: async () => {
          await api.removeItemFromBox(boxId, itemId);
          setBoxItems((prev) => prev.filter((it: any) => it.id !== itemId));
          await loadMoveData(activeMove?.id);
        },
      });
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to pack item into box");
    }
  };

  const handleRemoveItemFromBox = async (itemId: number) => {
    if (!selectedBox) return;
    const boxId = selectedBox.id;
    const removedItem = boxItems.find((it) => it.id === itemId);
    try {
      await api.removeItemFromBox(boxId, itemId);
      setBoxItems((prev) => prev.filter((it) => it.id !== itemId));
      await loadMoveData(activeMove?.id);
      showUndo({
        message: `Removed "${removedItem?.name || "Item"}" from Box #${selectedBox.number}`,
        onUndo: async () => {
          await api.addItemsToBox(boxId, [itemId]);
          const updated = await api.getBox(boxId);
          setBoxItems(updated.items || []);
          await loadMoveData(activeMove?.id);
        },
      });
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to remove item from box");
    }
  };

  // Pack by Location / Room
  const loadRoomItems = async (locId: number | null) => {
    setPackSourceLocId(locId);
    if (!locId) {
      setRoomItems([]);
      return;
    }
    setLoadingRoomItems(true);
    try {
      const res = await api.getItems({ location_id: locId, per_page: 100 });
      setRoomItems(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRoomItems(false);
    }
  };

  // Safe Unpack Dialog
  const handleOpenUnpackDialog = (box: any, specificItemIds?: number[]) => {
    setUnpackTargetBox(box);
    setUnpackSpecificItemIds(specificItemIds || null);
    setUnpackTargetLocationId(box.destination_location_id || null);
  };

  const handleConfirmUnpack = async () => {
    if (!unpackTargetBox || !unpackTargetLocationId) {
      setErrorMsg("Please select a target destination location to unpack into.");
      return;
    }
    const boxId = unpackTargetBox.id;
    const destLocId = unpackTargetLocationId;
    setIsUnpacking(true);
    try {
      const b = await api.getBox(boxId);
      const itemIdsToUnpack =
        unpackSpecificItemIds && unpackSpecificItemIds.length > 0
          ? unpackSpecificItemIds
          : (b.items || []).map((i: any) => i.id);

      const res = await api.unpackBox(boxId, itemIdsToUnpack, destLocId);
      setUnpackTargetBox(null);
      setUnpackSpecificItemIds(null);

      // Refresh box details if open
      if (selectedBox && selectedBox.id === boxId) {
        const updated = await api.getBox(boxId);
        setBoxItems(updated.items || []);
      }

      await loadMoveData(activeMove?.id);
      showUndo({
        message: `Unpacked ${itemIdsToUnpack.length} ${itemIdsToUnpack.length === 1 ? "item" : "items"} from Box #${b.number}`,
        onUndo: async () => {
          await api.undoUnpackBox(boxId, {
            batch_id: res.batch_id,
            item_ids: res.unpacked_item_ids || itemIdsToUnpack,
            previous_status: res.previous_status || "packed",
          });
          await loadMoveData(activeMove?.id);
        },
      });
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to unpack box");
    } finally {
      setIsUnpacking(false);
    }
  };

  // Print Box Label / Manifest
  const handleOpenPrintLabel = async (box: any) => {
    setPrintBoxTarget(box);
    try {
      const qrPayload = `${window.location.origin}/#/moves?box=${box.id}`;
      const qrData = await QRCode.toDataURL(qrPayload, { width: 220, margin: 1 });
      setPrintQrDataUrl(qrData);
    } catch (e) {
      console.error("Failed to generate QR code", e);
    }
  };

  const handlePrintManifest = () => {
    window.print();
  };

  return (
    <Box sx={{ width: "100%", pb: 6 }}>
      {/* Page Header */}
      <PageHeader
        title="Moving House Mode"
        subtitle="Pack numbered boxes, assign rooms, and safely unpack into your new home"
        icon={<LocalShippingOutlinedIcon />}
        action={
          <Box sx={{ display: "flex", gap: 1 }}>
            {activeMove && activeMove.status === "planning" && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateBox}>
                New Box
              </Button>
            )}
            <Button
              variant={activeMove ? "outlined" : "contained"}
              startIcon={<AddIcon />}
              onClick={handleOpenCreateMove}
            >
              Start New Move
            </Button>
          </Box>
        }
      />

      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Move Notice"
        message={errorMsg}
        severity="error"
      />

      <AlertDialog
        open={Boolean(successMsg)}
        onClose={() => setSuccessMsg(null)}
        title="Success"
        message={successMsg}
        severity="success"
      />

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !activeMove ? (
        <Fade in appear timeout={250}>
          <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 2 }}>
            <LocalShippingOutlinedIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              No Active Move
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: "auto" }}>
              Start a moving house project to organize your move: number your boxes, assign destination rooms,
              pack items, and print labels.
            </Typography>
            <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={handleOpenCreateMove}>
              Start Moving Project
            </Button>
          </Card>
        </Fade>
      ) : (
        <Fade in appear timeout={250}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Move Selector & Active Move Overview Card */}
            <Card variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                      {activeMove.name}
                    </Typography>
                    <Chip
                      label={activeMove.status === "planning" ? "In Progress" : "Completed"}
                      color={activeMove.status === "planning" ? "primary" : "success"}
                      size="small"
                      sx={{ fontWeight: 700, textTransform: "capitalize" }}
                    />
                  </Box>
                  {activeMove.target_date && (
                    <Typography variant="body2" color="text.secondary">
                      Target Move Date: <strong>{activeMove.target_date}</strong>
                    </Typography>
                  )}
                  {activeMove.finished_at && (
                    <Typography variant="caption" color="text.secondary">
                      Finished on: {new Date(activeMove.finished_at).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>

                {/* Move Switcher & Move Actions */}
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  {allMoves.length > 1 && (
                    <Select
                      size="small"
                      value={activeMove.id}
                      onChange={(e) => loadMoveData(Number(e.target.value))}
                      sx={{ minWidth: 160 }}
                    >
                      {allMoves.map((m) => (
                        <MenuItem key={m.id} value={m.id}>
                          {m.name} ({m.status})
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                  <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={handleOpenEditMove}>
                    Edit Move
                  </Button>
                  {activeMove.status === "planning" ? (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircleOutlinedIcon />}
                      onClick={() => setFinishMoveConfirm(true)}
                    >
                      Complete Move
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      startIcon={<ReplayIcon />}
                      onClick={handleReopenMove}
                    >
                      Reopen Move
                    </Button>
                  )}
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlinedIcon />}
                    onClick={() => setDeleteMoveConfirm(true)}
                  >
                    Delete
                  </Button>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Progress and Stats */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Move Progress: {boxes.length > 0 ? Math.round(((packedBoxesCount + unpackedBoxesCount) / boxes.length) * 100) : 0}% Packed
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {packedBoxesCount + unpackedBoxesCount} of {boxes.length} boxes packed
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={boxes.length > 0 ? ((packedBoxesCount + unpackedBoxesCount) / boxes.length) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4 }}
                />

                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                  <Chip label={`${boxes.length} Total Boxes`} size="small" variant="outlined" />
                  <Chip label={`${packingBoxesCount} Packing`} size="small" color="primary" variant="outlined" />
                  <Chip label={`${packedBoxesCount} Packed`} size="small" color="success" variant="outlined" />
                  <Chip label={`${unpackedBoxesCount} Unpacked`} size="small" color="default" variant="outlined" />
                  <Chip
                    label={`${activeMove.packed_items || 0} Items Packed`}
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                </Box>
              </Box>
            </Card>

            {/* Boxes Filter Toolbar */}
            <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                <Tabs
                  value={boxFilterTab}
                  onChange={(_, val) => setBoxFilterTab(val)}
                  textColor="primary"
                  indicatorColor="primary"
                >
                  <Tab label={`All (${boxes.length})`} value="all" />
                  <Tab label={`Packing (${packingBoxesCount})`} value="packing" />
                  <Tab label={`Packed (${packedBoxesCount})`} value="packed" />
                  <Tab label={`Unpacked (${unpackedBoxesCount})`} value="unpacked" />
                </Tabs>

                <TextField
                  size="small"
                  placeholder="Search boxes by #, label, or room..."
                  value={boxSearchQuery}
                  onChange={(e) => setBoxSearchQuery(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: boxSearchQuery ? (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setBoxSearchQuery("")}>
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ) : null,
                    },
                  }}
                  sx={{ minWidth: 260 }}
                />
              </Box>
            </Card>

            {/* Boxes Grid */}
            {filteredBoxes.length === 0 ? (
              <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 2 }}>
                <Inventory2OutlinedIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {boxes.length === 0 ? "No Boxes Created Yet" : "No Matching Boxes Found"}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {boxes.length === 0
                    ? "Add your first numbered box to begin packing items."
                    : "Try adjusting your filter or search query."}
                </Typography>
                {boxes.length === 0 && activeMove.status === "planning" && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateBox}>
                    Add Box
                  </Button>
                )}
              </Card>
            ) : (
              <Grid container spacing={2.5}>
                {filteredBoxes.map((box, idx) => (
                  <Grid key={box.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Grow in appear timeout={Math.min(200 + idx * 40, 500)}>
                      <Card
                        variant="outlined"
                        sx={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          borderRadius: 2,
                          borderLeft: `6px solid ${box.colour || theme.palette.primary.main}`,
                          transition: (t) =>
                            t.transitions.create(["transform", "box-shadow", "border-color"], {
                              duration: t.transitions.duration.shorter,
                            }),
                          "&:hover": {
                            transform: "translateY(-3px)",
                            boxShadow: 3,
                          },
                        }}
                      >
                        <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1.5 }}>
                            <Box sx={{ minWidth: 0, pr: 1 }}>
                              <Typography variant="caption" sx={{ fontWeight: 800, color: box.colour || "primary.main" }}>
                                BOX #{box.number}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
                                {box.label}
                              </Typography>
                            </Box>
                            <Chip
                              label={box.status}
                              size="small"
                              color={box.status === "packed" ? "success" : box.status === "unpacked" ? "default" : "primary"}
                              sx={{ textTransform: "capitalize", fontWeight: 700 }}
                            />
                          </Box>

                          {box.destination && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                              <PlaceOutlinedIcon fontSize="small" color="action" />
                              <Typography variant="body2" color="text.secondary" noWrap>
                                Room: <strong>{box.destination}</strong>
                              </Typography>
                            </Box>
                          )}

                          {box.destination_location_name && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                              <CategoryOutlinedIcon fontSize="small" color="action" />
                              <Typography variant="caption" color="text.secondary" noWrap>
                                Target Inventory: {box.destination_location_name}
                              </Typography>
                            </Box>
                          )}

                          {box.notes && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                fontStyle: "italic",
                                mt: 0.5,
                              }}
                            >
                              &quot;{box.notes}&quot;
                            </Typography>
                          )}

                          <Box sx={{ mt: 1.5 }}>
                            <Chip
                              label={`${box.items_count || 0} ${box.items_count === 1 ? "item" : "items"} packed`}
                              size="small"
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          </Box>
                        </CardContent>

                        <Divider />

                        <CardActions sx={{ justifyContent: "space-between", px: 1.5, py: 1 }}>
                          <Button size="small" onClick={() => handleOpenBoxDetails(box)}>
                            Contents & Pack
                          </Button>

                          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                            {box.status !== "unpacked" && (
                              <Tooltip title={box.status === "packed" ? "Mark Packing" : "Mark Packed"}>
                                <IconButton size="small" onClick={() => handleToggleBoxPackStatus(box)}>
                                  {box.status === "packed" ? (
                                    <ArchiveOutlinedIcon fontSize="small" color="action" />
                                  ) : (
                                    <CheckCircleOutlinedIcon fontSize="small" color="success" />
                                  )}
                                </IconButton>
                              </Tooltip>
                            )}

                            {box.status !== "unpacked" && (
                              <Tooltip title="Unpack Box">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() => handleOpenUnpackDialog(box)}
                                >
                                  <UnarchiveOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}

                            <Tooltip title="Print Box Label & QR">
                              <IconButton size="small" onClick={() => handleOpenPrintLabel(box)}>
                                <PrintOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Edit Box">
                              <IconButton size="small" onClick={() => handleOpenEditBox(box)}>
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Delete Box">
                              <IconButton size="small" color="error" onClick={() => setBoxToDelete(box)}>
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </CardActions>
                      </Card>
                    </Grow>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </Fade>
      )}

      {/* Start / Edit Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{isEditingMove ? "Edit Move" : "Start Moving House Project"}</DialogTitle>
        <DialogContent sx={{ pt: "24px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField
            label="Move Name"
            placeholder="e.g. Move to Maple Street"
            value={moveName}
            onChange={(e) => setMoveName(e.target.value)}
            fullWidth
            required
            autoFocus
            sx={{ mt: 1 }}
          />
          <TextField
            label="Target Move Date (Optional)"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveMove}>
            {isEditingMove ? "Save Changes" : "Start Move"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Finish Move Confirm Dialog */}
      <ConfirmDialog
        open={finishMoveConfirm}
        title="Complete Move?"
        message={`Mark "${activeMove?.name}" as completed? You can reopen it at any time.`}
        confirmLabel="Complete Move"
        confirmColor="primary"
        onConfirm={handleFinishMove}
        onCancel={() => setFinishMoveConfirm(false)}
      />

      {/* Delete Move Confirm Dialog */}
      <ConfirmDialog
        open={deleteMoveConfirm}
        title="Delete Move Project?"
        message={`Permanently delete "${activeMove?.name}" and all of its ${boxes.length} boxes? This action cannot be undone.`}
        confirmLabel="Delete Move"
        confirmColor="error"
        onConfirm={handleDeleteMove}
        onCancel={() => setDeleteMoveConfirm(false)}
      />

      {/* Add / Edit Box Dialog */}
      <Dialog open={boxDialogOpen} onClose={() => setBoxDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editingBox ? `Edit Box #${editingBox.number}` : "Add New Moving Box"}</DialogTitle>
        <DialogContent sx={{ pt: "24px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          <TextField
            label="Box Label"
            placeholder="e.g. Kitchen Cookware, Master Bedroom Books"
            value={boxLabel}
            onChange={(e) => setBoxLabel(e.target.value)}
            fullWidth
            required
            autoFocus
            sx={{ mt: 1 }}
          />
          <TextField
            label="Destination Room Name"
            placeholder="e.g. New Kitchen, Attic Storage, Kid's Bedroom"
            value={boxDestination}
            onChange={(e) => setBoxDestination(e.target.value)}
            fullWidth
            helperText="The physical room or area where this box should be unloaded."
          />
          <LocationPicker
            value={boxDestLocId}
            onChange={(id) => setBoxDestLocId(id)}
            label="Target Inventory Location (Optional)"
            helperText="When unpacking, items can automatically be moved into this inventory location."
          />

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Box Identification Color
            </Typography>
            <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap", alignItems: "center" }}>
              {BOX_PALETTE.map((c) => (
                <Tooltip key={c.hex} title={c.name}>
                  <Box
                    onClick={() => setBoxColour(c.hex)}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      bgcolor: c.hex,
                      cursor: "pointer",
                      border: boxColour === c.hex ? "3px solid" : "2px solid transparent",
                      borderColor: boxColour === c.hex ? "text.primary" : "transparent",
                      boxShadow: boxColour === c.hex ? 2 : 0,
                      transition: "all 0.15s ease",
                      "&:hover": { transform: "scale(1.15)" },
                    }}
                  />
                </Tooltip>
              ))}
            </Box>
          </Box>

          <TextField
            label="Notes (Optional)"
            placeholder="e.g. Fragile glassware, keep right side up, heavy"
            value={boxNotes}
            onChange={(e) => setBoxNotes(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBoxDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveBox}>
            {editingBox ? "Save Box" : "Create Box"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Box Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(boxToDelete)}
        title="Delete Box?"
        message={`Delete Box #${boxToDelete?.number} ("${boxToDelete?.label}")? Items inside will remain in the inventory.`}
        confirmLabel="Delete Box"
        confirmColor="error"
        onConfirm={handleDeleteBox}
        onCancel={() => setBoxToDelete(null)}
      />

      {/* Box Contents & Packing Modal */}
      <Dialog open={Boolean(selectedBox)} onClose={() => setSelectedBox(null)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                bgcolor: selectedBox?.colour || theme.palette.primary.main,
              }}
            />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Box #{selectedBox?.number}: {selectedBox?.label}
            </Typography>
            <Chip
              label={selectedBox?.status}
              size="small"
              color={selectedBox?.status === "packed" ? "success" : selectedBox?.status === "unpacked" ? "default" : "primary"}
              sx={{ textTransform: "capitalize", fontWeight: 700 }}
            />
          </Box>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrintOutlinedIcon />}
              onClick={() => selectedBox && handleOpenPrintLabel(selectedBox)}
            >
              Print Label
            </Button>
            {selectedBox?.status !== "unpacked" && (
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                startIcon={<UnarchiveOutlinedIcon />}
                onClick={() => selectedBox && handleOpenUnpackDialog(selectedBox)}
              >
                Unpack Box
              </Button>
            )}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: "16px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          {selectedBox?.destination && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Destination: <strong>{selectedBox.destination}</strong>
                {selectedBox.destination_location_name ? ` (Mapped to: ${selectedBox.destination_location_name})` : ""}
              </Typography>
            </Paper>
          )}

          {/* Packing Options: Quick Search vs Pack from Room */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Tabs
              value={packingTab}
              onChange={(_, val) => setPackingTab(val)}
              textColor="primary"
              indicatorColor="primary"
              sx={{ mb: 2 }}
            >
              <Tab label="Search Items to Pack" value="search" />
              <Tab label="Pack from Room / Location" value="room" />
            </Tabs>

            {packingTab === "search" ? (
              <Box>
                <TextField
                  fullWidth
                  placeholder="Search item by name or code to pack..."
                  value={itemQuery}
                  onChange={(e) => handleSearchItems(e.target.value)}
                  size="small"
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                {searchResults.length > 0 && (
                  <List sx={{ mt: 1, maxHeight: 180, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
                    {searchResults.map((r, i) => (
                      <ListItem
                        key={i}
                        secondaryAction={
                          <Button size="small" variant="contained" onClick={() => handlePackItem(r.id)}>
                            Pack into Box
                          </Button>
                        }
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Inventory2OutlinedIcon fontSize="small" color="primary" />
                        </ListItemIcon>
                        <ListItemText primary={r.title} secondary={r.subtitle} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <LocationPicker
                  value={packSourceLocId}
                  onChange={(id) => loadRoomItems(id)}
                  label="Select Room / Shelf to Pack From"
                  size="small"
                />

                {loadingRoomItems ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : roomItems.length > 0 ? (
                  <List sx={{ maxHeight: 180, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
                    {roomItems.map((it) => (
                      <ListItem
                        key={it.id}
                        secondaryAction={
                          <Button size="small" variant="contained" onClick={() => handlePackItem(it.id)}>
                            Pack
                          </Button>
                        }
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Inventory2OutlinedIcon fontSize="small" color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={it.name}
                          secondary={`Qty: ${it.quantity || 1} • ${it.category_name || "Uncategorized"}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : packSourceLocId ? (
                  <Typography variant="body2" color="text.secondary">
                    No items in this location.
                  </Typography>
                ) : null}
              </Box>
            )}
          </Paper>

          {/* Current Box Items */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Items Packed in Box ({boxItems.length}):
              </Typography>
            </Box>

            {loadingBoxItems ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : boxItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                This box is currently empty. Use the search or room picker above to pack items.
              </Typography>
            ) : (
              <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {boxItems.map((it) => (
                  <ListItem
                    key={it.id}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.5,
                      px: 2,
                      py: 1,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 44 }}>
                      {it.photo_url ? (
                        <Avatar
                          src={it.photo_url}
                          variant="rounded"
                          sx={{ width: 36, height: 36, border: "1px solid", borderColor: "divider" }}
                        />
                      ) : (
                        <Inventory2OutlinedIcon color="primary" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          {it.code && (
                            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                              {it.code}
                            </Typography>
                          )}
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {it.name}
                          </Typography>
                          {it.quantity > 1 && (
                            <Chip label={`x${it.quantity}`} size="small" sx={{ height: 18, fontSize: "0.65rem" }} />
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {it.category_name || "Uncategorized"} • Location: {it.location_path || "Unassigned"}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Unpack this item">
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => selectedBox && handleOpenUnpackDialog(selectedBox, [it.id])}
                        >
                          <UnarchiveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove item from box">
                        <IconButton size="small" color="error" onClick={() => handleRemoveItemFromBox(it.id)}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedBox(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Safe Unpack Dialog */}
      <Dialog open={Boolean(unpackTargetBox)} onClose={() => setUnpackTargetBox(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Unpack Box #{unpackTargetBox?.number}: {unpackTargetBox?.label}
        </DialogTitle>
        <DialogContent sx={{ pt: "20px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            Select the destination inventory location where the unpacked items will be assigned.
          </Typography>

          <LocationPicker
            value={unpackTargetLocationId}
            onChange={(id) => setUnpackTargetLocationId(id)}
            label="Destination Location"
            required
            helperText="All items unpacked from this box will have their inventory location updated to this place."
          />

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5, bgcolor: "action.hover" }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
              Items to be unpacked:
            </Typography>
            <Typography variant="body2">
              {unpackSpecificItemIds
                ? `${unpackSpecificItemIds.length} selected item(s)`
                : `All items in Box #${unpackTargetBox?.number}`}
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnpackTargetBox(null)} disabled={isUnpacking}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmUnpack}
            disabled={!unpackTargetLocationId || isUnpacking}
          >
            {isUnpacking ? "Unpacking..." : "Confirm & Unpack"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Box Label & Manifest Modal */}
      <Dialog open={Boolean(printBoxTarget)} onClose={() => setPrintBoxTarget(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Print Box #{printBoxTarget?.number} Label</span>
          <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={handlePrintManifest}>
            Print
          </Button>
        </DialogTitle>
        <DialogContent sx={{ pt: "16px !important" }}>
          {/* Printable Container */}
          <Paper
            ref={printContentRef}
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 2,
              border: `4px solid ${printBoxTarget?.colour || theme.palette.primary.main}`,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Box>
                <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 1.5, color: "text.secondary" }}>
                  {activeMove?.name || "WHEREZY MOVE"}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, color: printBoxTarget?.colour || "primary.main" }}>
                  BOX #{printBoxTarget?.number}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {printBoxTarget?.label}
                </Typography>
              </Box>

              {printQrDataUrl && (
                <Box sx={{ textAlign: "center" }}>
                  <img src={printQrDataUrl} alt="Box QR" style={{ width: 110, height: 110, borderRadius: 8 }} />
                  <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                    Scan to Open Box
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider />

            {printBoxTarget?.destination && (
              <Box sx={{ p: 1.5, bgcolor: alpha(printBoxTarget.colour || theme.palette.primary.main, 0.12), borderRadius: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  DESTINATION ROOM
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  {printBoxTarget.destination}
                </Typography>
              </Box>
            )}

            {printBoxTarget?.notes && (
              <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>
                Notes: &quot;{printBoxTarget.notes}&quot;
              </Typography>
            )}

            <Divider />

            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              Packed Contents Checklist:
            </Typography>
            <List dense disablePadding>
              {(printBoxTarget?.items || boxItems || []).map((it: any) => (
                <ListItem key={it.id} disableGutters sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <CheckBoxOutlineBlankIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {it.name} {it.quantity > 1 ? `(x${it.quantity})` : ""}
                      </Typography>
                    }
                    secondary={it.category_name ? `${it.category_name}` : undefined}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintBoxTarget(null)}>Close</Button>
          <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={handlePrintManifest}>
            Print Now
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
