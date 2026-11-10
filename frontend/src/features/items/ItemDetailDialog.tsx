import React, { useState, useEffect } from "react";
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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { Item } from "./types";
import { PhotoManager } from "../photos/PhotoManager";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { LocationBreadcrumb } from "../../components/shared/LocationBreadcrumb";
import { api } from "../../api/client";

interface ItemDetailDialogProps {
  itemId: number | null;
  open: boolean;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onMove: (item: Item) => void;
  onItemUpdated: () => void;
}

export const ItemDetailDialog: React.FC<ItemDetailDialogProps> = ({
  itemId,
  open,
  onClose,
  onEdit,
  onDelete,
  onMove,
  onItemUpdated,
}) => {
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>("");
  const barcodeCanvasRef = React.useRef<HTMLCanvasElement>(null);

  // Taken out state
  const [takenOut, setTakenOut] = useState(false);
  const [takenBy, setTakenBy] = useState("");
  const [editingTakenBy, setEditingTakenBy] = useState(false);

  const loadItem = async () => {
    if (!itemId) return;
    try {
      setIsLoading(true);
      const data = await api.getItem(itemId);
      setItem(data);
      setTakenOut(data.taken_out);
      setTakenBy(data.taken_by || "");

      // QR Code: {origin}/#/i/{id}
      const qrTarget = `${window.location.origin}/#/i/${data.id}`;
      const q = await QRCode.toDataURL(qrTarget, { width: 120, margin: 1 });
      setQrUrl(q);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && itemId) {
      loadItem();
    }
  }, [open, itemId]);

  useEffect(() => {
    if (item && barcodeCanvasRef.current) {
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
  }, [item]);

  const handleToggleTaken = async (checked: boolean) => {
    if (!item) return;
    try {
      const updated = await api.toggleTaken(item.id, checked, checked ? takenBy || null : null);
      setItem(updated);
      setTakenOut(updated.taken_out);
      onItemUpdated();
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
      onItemUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicate = async () => {
    if (!item) return;
    try {
      await api.duplicateItem(item.id);
      onItemUpdated();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  if (!item && !isLoading) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", pb: 1 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
            <Chip
              label={`I${item?.id}`}
              size="small"
              sx={{ fontFamily: "monospace", fontWeight: 700 }}
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

      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        <Grid container spacing={3}>
          {/* Left Column: Details, Locations, Custom Fields, Notes */}
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
            {/* Photo Gallery */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, letterSpacing: "0.01em" }}>
                Photos
              </Typography>
              {item && <PhotoManager ownerType="item" ownerId={item.id} />}
            </Box>

            {/* QR & Barcode Preview */}
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
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Delete item">
            <IconButton color="error" onClick={() => item && onDelete(item)}>
              <DeleteOutlinedIcon />
            </IconButton>
          </Tooltip>
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
          <Button
            variant="outlined"
            startIcon={<DriveFileMoveOutlinedIcon />}
            onClick={() => item && onMove(item)}
          >
            Move
          </Button>
          <Button
            variant="outlined"
            startIcon={<ContentCopyOutlinedIcon />}
            onClick={handleDuplicate}
          >
            Duplicate
          </Button>
          <Button
            variant="contained"
            startIcon={<EditOutlinedIcon />}
            onClick={() => item && onEdit(item)}
          >
            Edit
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};
