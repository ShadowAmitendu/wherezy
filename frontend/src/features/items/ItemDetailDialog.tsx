import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  TextField,
  Grid,
  Tabs,
  Tab,
  List,
  ListItem,
  CircularProgress,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Card,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { Item } from "./types";
import {
  clampTakenOutQuantity,
  getItemAvailableQuantity,
  getItemQuantity,
  getItemTakenOutQuantity,
} from "./quantityUtils";
import { formatItemCode } from "./itemCodeUtils";
import { PhotoManager } from "../photos/PhotoManager";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { LocationBreadcrumb } from "../../components/shared/LocationBreadcrumb";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { useUndo, useOnUndoRefresh } from "../../components/shared/UndoContext";
import { api } from "../../api/client";

interface ItemDetailDialogProps {
  itemId: number | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (item: Item) => void;
  onDelete?: (item: Item) => void;
  onMove?: (item: Item) => void;
  onItemUpdated?: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

export const ItemDetailDialog: React.FC<ItemDetailDialogProps> = ({
  itemId,
  open,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onItemUpdated,
  onUpdated,
  onDeleted,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { showUndo } = useUndo();
  const [item, setItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [qrUrl, setQrUrl] = useState<string>("");
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Taken out state
  const [takenOut, setTakenOut] = useState(false);
  const [takenBy, setTakenBy] = useState("");
  const [editingTakenBy, setEditingTakenBy] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activity history state
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Retire dialog state
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [retireReason, setRetireReason] = useState("sold");
  const [retireDate, setRetireDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [retireNote, setRetireNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<number | null>(null);
  const [deleteItemConfirmOpen, setDeleteItemConfirmOpen] = useState(false);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  const openKey = open ? itemId : null;
  const [prevOpenKey, setPrevOpenKey] = useState<number | null>(openKey);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      setTabIndex(0);
    }
  }

  const notifyChange = () => {
    if (onItemUpdated) onItemUpdated();
    if (onUpdated) onUpdated();
  };

  const loadItem = useCallback(async () => {
    if (!itemId) return;
    try {
      setIsLoading(true);
      const data = await api.getItem(itemId);
      setItem(data);
      setTakenOut(data.taken_out);
      setTakenBy(data.taken_by || "");
      setAttachments(data.attachments || []);

      // QR Code
      const qrTarget = `${window.location.origin}/#/i/${data.id}`;
      const q = await QRCode.toDataURL(qrTarget, { width: 120, margin: 1 });
      setQrUrl(q);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (!open || !itemId) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return null;
        setIsLoading(true);
        return api.getItem(itemId);
      })
      .then(async (data) => {
        if (!active || !data) return;
        setItem(data);
        setTakenOut(data.taken_out);
        setTakenBy(data.taken_by || "");
        setAttachments(data.attachments || []);
        const qrTarget = `${window.location.origin}/#/i/${data.id}`;
        const q = await QRCode.toDataURL(qrTarget, { width: 120, margin: 1 });
        if (active) setQrUrl(q);
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
  }, [open, itemId]);

  useEffect(() => {
    if (tabIndex !== 2 || !itemId) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return null;
        setLoadingActivity(true);
        return api.getItemActivity(itemId);
      })
      .then((acts) => {
        if (active && acts) setActivityEvents(acts);
      })
      .catch((err) => {
        if (active) console.error(err);
      })
      .finally(() => {
        if (active) setLoadingActivity(false);
      });
    return () => {
      active = false;
    };
  }, [tabIndex, itemId]);

  useEffect(() => {
    if (item && barcodeCanvasRef.current && tabIndex === 0) {
      try {
        JsBarcode(barcodeCanvasRef.current, formatItemCode(item.id), {
          format: "CODE128",
          width: 1.4,
          height: 32,
          displayValue: true,
          fontSize: 12,
          font: "JetBrains Mono",
          margin: 4,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (err) {
        console.error("Barcode generation failed", err);
      }
    }
  }, [item, tabIndex]);

  const handleSetTakenOutQty = async (nextQty: number) => {
    if (!item) return;
    const itemIdVal = item.id;
    const itemName = item.name;
    const prevQty = getItemTakenOutQuantity(item);
    const prevBy = item.taken_by ?? null;
    const prevDue = item.taken_due ?? null;
    const prevProfileId = item.taken_by_profile_id ?? null;
    const prevContactId = item.taken_by_contact_id ?? null;
    const clamped = clampTakenOutQuantity(nextQty, getItemQuantity(item));
    try {
      const updated = await api.toggleTaken(itemIdVal, {
        taken_out_quantity: clamped,
        taken_by: clamped > 0 ? takenBy.trim() || null : null,
      });
      setItem(updated);
      setTakenOut(updated.taken_out);
      if (clamped === 0) setEditingTakenBy(false);
      notifyChange();
      showUndo({
        message:
          clamped === 0
            ? `Marked "${itemName}" as returned`
            : `Updated taken-out (${clamped}) for "${itemName}"`,
        onUndo: async () => {
          await api.toggleTaken(itemIdVal, {
            taken_out_quantity: prevQty,
            taken_by: prevBy,
            taken_due: prevDue,
            taken_by_profile_id: prevProfileId,
            taken_by_contact_id: prevContactId,
          });
        },
      });
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to update taken out status");
    }
  };

  useOnUndoRefresh(() => {
    if (open && itemId) {
      void loadItem();
    }
  });

  const handleToggleTaken = async (checked: boolean) => {
    await handleSetTakenOutQty(checked ? 1 : 0);
  };

  const handleSaveTakenBy = async () => {
    if (!item) return;
    const itemIdVal = item.id;
    const itemName = item.name;
    const currentOut = Math.max(1, getItemTakenOutQuantity(item));
    const prevBy = item.taken_by ?? null;
    try {
      const updated = await api.toggleTaken(itemIdVal, {
        taken_out_quantity: currentOut,
        taken_by: takenBy.trim() || null,
      });
      setItem(updated);
      setEditingTakenBy(false);
      notifyChange();
      showUndo({
        message: `Updated borrower for "${itemName}"`,
        onUndo: async () => {
          await api.toggleTaken(itemIdVal, {
            taken_out_quantity: currentOut,
            taken_by: prevBy,
          });
        },
      });
    } catch (err) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to update borrower");
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    const itemName = item.name;
    try {
      const dup = await api.duplicateItem(item.id);
      notifyChange();
      if (dup?.id) {
        const dupId = dup.id;
        showUndo({
          message: `Duplicated "${itemName}"`,
          onUndo: async () => {
            await api.deleteItem(dupId);
          },
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !item) return;
    setUploadingAttachment(true);
    try {
      await api.uploadAttachment(item.id, files[0]);
      await loadItem();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to upload file");
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = (attachmentId: number) => {
    setDeleteAttachmentId(attachmentId);
  };

  const handleConfirmDeleteAttachment = async () => {
    if (deleteAttachmentId === null) return;
    setIsConfirmingAction(true);
    try {
      await api.deleteAttachment(deleteAttachmentId);
      setDeleteAttachmentId(null);
      await loadItem();
    } catch (err: any) {
      setDeleteAttachmentId(null);
      setErrorMsg(err.error?.message || "Failed to delete attachment");
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const handleRetire = async () => {
    if (!item) return;
    const itemIdVal = item.id;
    const itemName = item.name;
    try {
      await api.retireItem(itemIdVal, retireReason, retireDate, retireNote.trim() || undefined);
      setRetireDialogOpen(false);
      notifyChange();
      await loadItem();
      showUndo({
        message: `Retired "${itemName}"`,
        onUndo: async () => {
          await api.unretireItem(itemIdVal);
        },
      });
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to retire item");
    }
  };

  const handleBringBack = async () => {
    if (!item) return;
    const itemIdVal = item.id;
    const itemName = item.name;
    const prevReason = item.retired_reason || "broken";
    const prevDate = item.retired_on || new Date().toISOString().slice(0, 10);
    const prevNote = item.retired_note || undefined;
    try {
      await api.unretireItem(itemIdVal);
      notifyChange();
      await loadItem();
      showUndo({
        message: `Brought "${itemName}" back to inventory`,
        onUndo: async () => {
          await api.retireItem(itemIdVal, prevReason, prevDate, prevNote);
        },
      });
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to return item to inventory");
    }
  };

  const handleDelete = () => {
    if (!item) return;
    if (onDelete) {
      onDelete(item);
    } else {
      setDeleteItemConfirmOpen(true);
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!item) return;
    const deletedId = item.id;
    const deletedName = item.name;
    setIsConfirmingAction(true);
    try {
      await api.deleteItem(deletedId);
      setDeleteItemConfirmOpen(false);
      if (onDeleted) onDeleted();
      notifyChange();
      showUndo({
        message: `Deleted "${deletedName}"`,
        onUndo: async () => {
          await api.restoreItem(deletedId);
        },
      });
      onClose();
    } catch (err: any) {
      setDeleteItemConfirmOpen(false);
      setErrorMsg(err.error?.message || "Failed to move item to trash");
    } finally {
      setIsConfirmingAction(false);
    }
  };

  if (!item && !isLoading) return null;

  const totalQty = item ? getItemQuantity(item) : 1;
  const outQty = item ? getItemTakenOutQuantity(item) : 0;
  const availQty = item ? getItemAvailableQuantity(item) : 1;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", pb: 1.5 }}>
          <Box sx={{ minWidth: 0, pr: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75, flexWrap: "wrap" }}>
              <Chip
                label={formatItemCode(item?.id)}
                size="small"
                sx={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}
                color="primary"
                variant="outlined"
              />
              {item && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={totalQty > 1 ? `Qty: ${availQty}/${totalQty} in place` : "Qty: 1"}
                  sx={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
                />
              )}
              {item?.category_name && (
                <Chip
                  label={item.category_name}
                  size="small"
                  sx={{
                    bgcolor: `${item.category_color}20`,
                    color: item.category_color || "text.primary",
                    fontWeight: 600,
                  }}
                />
              )}
              {item?.tags && item.tags.map((t: any) => (
                <Chip key={t.id} label={`#${t.name}`} size="small" variant="outlined" />
              ))}
              <ExpiryChip status={item?.expiry_status} dateStr={item?.expiry_date} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {item?.name}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        {/* Retired Banner */}
        {item?.status === "retired" && (
          <Box
            sx={{
              mx: 3,
              my: 1,
              p: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              bgcolor: "warning.main",
              color: "warning.contrastText",
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Retired: {item.retired_reason ? item.retired_reason.toUpperCase() : "RETIRED"} on {item.retired_on || "N/A"}
              {item.retired_note ? ` — "${item.retired_note}"` : ""}
            </Typography>
            <Button color="inherit" size="small" variant="outlined" onClick={handleBringBack} sx={{ ml: 2, borderColor: "currentColor", flexShrink: 0 }}>
              Bring Back
            </Button>
          </Box>
        )}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: "divider", px: { xs: 1, sm: 3 } }}>
          <Tabs
            value={tabIndex}
            onChange={(_, val) => setTabIndex(val)}
            textColor="primary"
            indicatorColor="primary"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab icon={<InfoOutlinedIcon />} iconPosition="start" label="Details" sx={{ fontWeight: 600, minHeight: 48 }} />
            <Tab
              icon={<AttachFileIcon />}
              iconPosition="start"
              label={`Attachments (${attachments.length})`}
              sx={{ fontWeight: 600, minHeight: 48 }}
            />
            <Tab icon={<HistoryOutlinedIcon />} iconPosition="start" label="History" sx={{ fontWeight: 600, minHeight: 48 }} />
          </Tabs>
        </Box>

        <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Item Action Error"
            message={errorMsg}
            severity="error"
          />

          {/* TAB 0: DETAILS */}
          {tabIndex === 0 && (
            <Grid container spacing={3}>
              {/* Left Column: Location, Taken Out, Properties, Notes */}
              <Grid size={{ xs: 12, md: 7 }} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                {/* Location Breadcrumb & Status */}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: "action.hover",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1.5,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, mb: 0.5 }}>
                    Location
                  </Typography>
                  <LocationBreadcrumb breadcrumbs={item?.breadcrumbs} />
                </Box>

                {/* Taken Out Status Bar */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    p: 2,
                    border: "1px solid",
                    borderColor: takenOut ? "secondary.main" : "divider",
                    borderRadius: 1.5,
                    bgcolor: takenOut ? "action.selected" : "action.hover",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1.5,
                    }}
                  >
                    <FormControlLabel
                      sx={{ m: 0, "& .MuiFormControlLabel-label": { ml: 1 } }}
                      control={
                        <Switch
                          checked={takenOut}
                          onChange={(e) => handleToggleTaken(e.target.checked)}
                          color="secondary"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {totalQty > 1
                              ? outQty > 0
                                ? `${outQty} of ${totalQty} Taken Out (${availQty} in place)`
                                : `All ${totalQty} in Storage Location`
                              : takenOut
                              ? "Currently Taken Out"
                              : "In Storage Location"}
                          </Typography>
                          {takenOut && item?.taken_at && (
                            <Typography variant="caption" color="text.secondary">
                              Taken {new Date(item.taken_at).toLocaleDateString()}
                              {item.taken_by ? ` by ${item.taken_by}` : ""}
                              {item.taken_due ? ` • Due: ${item.taken_due}` : ""}
                            </Typography>
                          )}
                        </Box>
                      }
                    />

                    {takenOut && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {editingTakenBy ? (
                          <>
                            <TextField
                              size="small"
                              placeholder="Who took it?"
                              value={takenBy}
                              onChange={(e) => setTakenBy(e.target.value)}
                            />
                            <Button size="small" variant="contained" onClick={handleSaveTakenBy}>
                              Save
                            </Button>
                          </>
                        ) : (
                          <Button size="small" onClick={() => setEditingTakenBy(true)}>
                            {takenBy ? `Change: ${takenBy}` : "+ Add Who Took It"}
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>

                  {totalQty > 1 && (
                    <Box
                      sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 1,
                        pt: 1,
                        borderTop: "1px dashed",
                        borderColor: "divider",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                        Taken out count:
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Decrease taken out quantity"
                        disabled={outQty <= 0}
                        onClick={() => handleSetTakenOutQty(outQty - 1)}
                        sx={{ border: 1, borderColor: "divider" }}
                      >
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          minWidth: 52,
                          textAlign: "center",
                        }}
                      >
                        {outQty} / {totalQty}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Increase taken out quantity"
                        disabled={outQty >= totalQty}
                        onClick={() => handleSetTakenOutQty(outQty + 1)}
                        sx={{ border: 1, borderColor: "divider" }}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                      {outQty < totalQty && (
                        <Button size="small" variant="outlined" onClick={() => handleSetTakenOutQty(totalQty)}>
                          Take All ({totalQty})
                        </Button>
                      )}
                      {outQty > 0 && (
                        <Button size="small" variant="outlined" onClick={() => handleSetTakenOutQty(0)}>
                          Return All
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>

                {/* Item Specific Properties & Notes */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: "0.01em" }}>
                    {item?.category_name ? `${item.category_name} Attributes` : "Item Attributes"}
                  </Typography>

                  <Grid container spacing={1.5}>
                    {item?.field_defs && item.field_defs.length > 0 ? (
                      item.field_defs.map((field) => {
                        const val = item.values?.[field.key];
                        let displayVal = "—";
                        if (val !== undefined && val !== null && val !== "") {
                          if (field.type === "checkbox") {
                            displayVal = val ? "Yes" : "No";
                          } else if (Array.isArray(val)) {
                            displayVal = val.join(", ");
                          } else {
                            displayVal = `${val}${field.unit ? ` ${field.unit}` : ""}`;
                          }
                        }

                        return (
                          <Grid
                            key={field.key}
                            size={{ xs: 12, sm: item.field_defs!.length === 1 ? 12 : 6 }}
                          >
                            <Box
                              sx={{
                                p: 1.5,
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 1.5,
                                height: "100%",
                              }}
                            >
                              <Typography variant="caption" color="text.secondary">
                                {field.label}
                              </Typography>
                              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                {displayVal}
                              </Typography>
                            </Box>
                          </Grid>
                        );
                      })
                    ) : (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="body2" color="text.secondary">
                          No specific properties defined for this category.
                        </Typography>
                      </Grid>
                    )}
                  </Grid>

                  {item?.notes && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: "action.hover", border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, mb: 0.5 }}>
                        Notes
                      </Typography>
                      <Typography variant="body2">{item.notes}</Typography>
                    </Box>
                  )}
                </Box>
              </Grid>

              {/* Right Column: Photos, QR and Barcodes */}
              <Grid size={{ xs: 12, md: 5 }} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, letterSpacing: "0.01em" }}>
                    Photos
                  </Typography>
                  {item && <PhotoManager ownerType="item" ownerId={item.id} />}
                </Box>

                <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    QR Code & Barcode
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        bgcolor: "#ffffff",
                        borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 1.25,
                      }}
                    >
                      {qrUrl && <img src={qrUrl} alt="QR Code" style={{ width: 112, height: 112, display: "block" }} />}
                      <canvas ref={barcodeCanvasRef} style={{ maxWidth: "100%", display: "block" }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" align="center">
                      Scan code with mobile camera to open this item, or type <code>{formatItemCode(item?.id)}</code> in search/scan.
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          )}

          {/* TAB 1: ATTACHMENTS */}
          {tabIndex === 1 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Manuals, Warranties & PDFs
                </Typography>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                  accept=".pdf,image/*"
                />
                <Button
                  variant="contained"
                  startIcon={<UploadFileOutlinedIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAttachment}
                >
                  Upload File
                </Button>
              </Box>

              {attachments.length === 0 ? (
                <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 1 }}>
                  <PictureAsPdfOutlinedIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1.5 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    No Attachments
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Upload instruction manuals, warranty certificates, or receipt PDFs for this item.
                  </Typography>
                  <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
                    Select File
                  </Button>
                </Card>
              ) : (
                <List disablePadding>
                  {attachments.map((att) => (
                    <ListItem
                      key={att.id}
                      sx={{
                        mb: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 2,
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <PictureAsPdfOutlinedIcon color="error" sx={{ fontSize: 32 }} />
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {att.file_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {(att.bytes / 1024).toFixed(1)} KB • Uploaded {att.created_at?.substring(0, 10)}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<DownloadOutlinedIcon />}
                          component="a"
                          href={`/api/attachments/${att.id}/file`}
                          download={att.file_name}
                        >
                          Download
                        </Button>
                        <IconButton size="small" color="error" onClick={() => handleDeleteAttachment(att.id)}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}

          {/* TAB 2: HISTORY */}
          {tabIndex === 2 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Item Change Timeline
              </Typography>
              {loadingActivity ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : activityEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No activity history recorded yet for this item.
                </Typography>
              ) : (
                <List disablePadding>
                  {activityEvents.map((act) => (
                    <ListItem
                      key={act.id}
                      sx={{
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        py: 1.5,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                          <Chip label={act.actor_name || "System"} size="small" sx={{ fontWeight: 600 }} />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {act.summary}
                          </Typography>
                        </Box>
                        {act.diff && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono)" }}>
                            {JSON.stringify(act.diff)}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                        {act.at ? new Date(act.at).toLocaleString() : ""}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2,
            justifyContent: "space-between",
            flexDirection: { xs: "column-reverse", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            gap: 1.5,
          }}
        >
          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title="Move to trash">
              <IconButton color="error" onClick={handleDelete}>
                <DeleteOutlinedIcon />
              </IconButton>
            </Tooltip>
            {item?.status === "active" ? (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RemoveCircleOutlineOutlinedIcon />}
                onClick={() => setRetireDialogOpen(true)}
              >
                Retire
              </Button>
            ) : (
              <Button
                variant="outlined"
                color="success"
                startIcon={<RestoreFromTrashIcon />}
                onClick={handleBringBack}
              >
                Bring Back
              </Button>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              startIcon={<PrintOutlinedIcon />}
              onClick={() => {
                onClose();
                navigate(`/labels?item_id=${item?.id}`);
              }}
            >
              Print Label
            </Button>
            {onMove && (
              <Button
                variant="outlined"
                startIcon={<DriveFileMoveOutlinedIcon />}
                onClick={() => item && onMove(item)}
              >
                Move
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<ContentCopyOutlinedIcon />}
              onClick={handleDuplicate}
            >
              Duplicate
            </Button>
            {onEdit && (
              <Button
                variant="contained"
                startIcon={<EditOutlinedIcon />}
                onClick={() => item && onEdit(item)}
              >
                Edit
              </Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      {/* Retire Dialog */}
      <Dialog open={retireDialogOpen} onClose={() => setRetireDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Retire Item</DialogTitle>
        <DialogContent sx={{ pt: "24px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          <Typography variant="body2">
            Retire &quot;{item?.name}&quot; from household inventory. History, attachments, and photos remain preserved.
          </Typography>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="item-retire-reason-label">Reason</InputLabel>
            <Select
              labelId="item-retire-reason-label"
              value={retireReason}
              label="Reason"
              onChange={(e) => setRetireReason(e.target.value)}
            >
              <MenuItem value="sold">Sold</MenuItem>
              <MenuItem value="donated">Donated</MenuItem>
              <MenuItem value="thrown_away">Thrown Away</MenuItem>
              <MenuItem value="broken">Broken</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Date"
            type="date"
            value={retireDate}
            onChange={(e) => setRetireDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Note (Optional)"
            placeholder="e.g. Sold on local marketplace, given to family"
            value={retireNote}
            onChange={(e) => setRetireNote(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetireDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleRetire}>
            Confirm Retire
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteAttachmentId !== null}
        title="Delete Attachment"
        message="Delete this attachment?"
        confirmLabel="Yes"
        cancelLabel="No"
        confirmColor="error"
        isLoading={isConfirmingAction}
        onConfirm={handleConfirmDeleteAttachment}
        onCancel={() => setDeleteAttachmentId(null)}
      />

      <ConfirmDialog
        open={deleteItemConfirmOpen}
        title="Move Item to Trash"
        message={`Move '${item?.name}' to trash?`}
        confirmLabel="Yes"
        cancelLabel="No"
        confirmColor="error"
        isLoading={isConfirmingAction}
        onConfirm={handleConfirmDeleteItem}
        onCancel={() => setDeleteItemConfirmOpen(false)}
      />
    </>
  );
};