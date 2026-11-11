import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  Divider,
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
  ListItemText,
  ListItemIcon,
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
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { Item } from "./types";
import { PhotoManager } from "../photos/PhotoManager";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { LocationBreadcrumb } from "../../components/shared/LocationBreadcrumb";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { api, ApiException } from "../../api/client";

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
  const [retireDate, setRetireDate] = useState(new Date().toISOString().split("T")[0]);
  const [retireNote, setRetireNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<number | null>(null);
  const [deleteItemConfirmOpen, setDeleteItemConfirmOpen] = useState(false);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  const notifyChange = () => {
    if (onItemUpdated) onItemUpdated();
    if (onUpdated) onUpdated();
  };

  const loadItem = async () => {
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
  };

  const loadActivity = async () => {
    if (!itemId) return;
    try {
      setLoadingActivity(true);
      const acts = await api.getItemActivity(itemId);
      setActivityEvents(acts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingActivity(false);
    }
  };

  useEffect(() => {
    if (open && itemId) {
      setTabIndex(0);
      loadItem();
    }
  }, [open, itemId]);

  useEffect(() => {
    if (tabIndex === 2 && itemId) {
      loadActivity();
    }
  }, [tabIndex, itemId]);

  useEffect(() => {
    if (item && barcodeCanvasRef.current && tabIndex === 0) {
      try {
        JsBarcode(barcodeCanvasRef.current, `I${item.id}`, {
          format: "CODE128",
          width: 1.5,
          height: 35,
          displayValue: true,
          fontSize: 12,
          font: "JetBrains Mono",
          margin: 0,
        });
      } catch (err) {
        console.error("Barcode generation failed", err);
      }
    }
  }, [item, tabIndex]);

  const handleToggleTaken = async (checked: boolean) => {
    if (!item) return;
    try {
      const updated = await api.toggleTaken(item.id, checked, checked ? takenBy || null : null);
      setItem(updated);
      setTakenOut(updated.taken_out);
      notifyChange();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveTakenBy = async () => {
    if (!item) return;
    try {
      const updated = await api.toggleTaken(item.id, true, takenBy.trim() || null);
      setItem(updated);
      setEditingTakenBy(false);
      notifyChange();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    try {
      await api.duplicateItem(item.id);
      notifyChange();
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
    try {
      await api.retireItem(item.id, retireReason, retireDate, retireNote.trim() || undefined);
      setRetireDialogOpen(false);
      notifyChange();
      await loadItem();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to retire item");
    }
  };

  const handleBringBack = async () => {
    if (!item) return;
    try {
      await api.unretireItem(item.id);
      notifyChange();
      await loadItem();
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
    setIsConfirmingAction(true);
    try {
      await api.deleteItem(item.id);
      setDeleteItemConfirmOpen(false);
      if (onDeleted) onDeleted();
      notifyChange();
      onClose();
    } catch (err: any) {
      setDeleteItemConfirmOpen(false);
      setErrorMsg(err.error?.message || "Failed to move item to trash");
    } finally {
      setIsConfirmingAction(false);
    }
  };

  if (!item && !isLoading) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", pb: 1 }}>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`I${item?.id}`}
                size="small"
                sx={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}
                color="primary"
                variant="outlined"
              />
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
          <IconButton onClick={onClose} size="small">
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
                <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, mb: 0.5 }}>
                    Location
                  </Typography>
                  <LocationBreadcrumb breadcrumbs={item?.breadcrumbs} />
                </Box>

                {/* Taken Out Status Bar */}
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 2,
                    border: "1px solid",
                    borderColor: takenOut ? "secondary.main" : "divider",
                    borderRadius: 1,
                    bgcolor: takenOut ? "action.selected" : "background.paper",
                  }}
                >
                  <FormControlLabel
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
                          {takenOut ? "Currently Taken Out" : "In Storage Location"}
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

                {/* Item Specific Properties & Notes */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, letterSpacing: "0.01em" }}>
                    {item?.category_name ? `${item.category_name} Attributes` : "Item Attributes"}
                  </Typography>

                  <Grid container spacing={2}>
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
                          <Grid key={field.key} size={{ xs: 12, sm: 6 }}>
                            <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
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
                    <Box sx={{ mt: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
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

                <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    QR Code & Barcode
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    {qrUrl && <img src={qrUrl} alt="QR Code" style={{ width: 120, height: 120 }} />}
                    <canvas ref={barcodeCanvasRef} style={{ maxWidth: "100%" }} />
                    <Typography variant="caption" color="text.secondary" align="center">
                      Scan code with mobile camera to open this item, or type <code>I{item?.id}</code> in search/scan.
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