import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Paper,
  FormControlLabel,
  Checkbox,
  Chip,
  Divider,
  alpha,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import QRCode from "qrcode";
import { api } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatItemCode } from "../items/itemCodeUtils";
import {
  buildLabelCopies,
  extractStoragePlaceName,
  parseLabelItemIds,
  renderBarcodeToCanvas,
  type LabelData,
} from "./labelUtils";

interface BarcodeCanvasProps {
  value: string;
}

const BarcodeCanvas: React.FC<BarcodeCanvasProps> = ({ value }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    renderBarcodeToCanvas(canvasRef.current, value);
  }, [value]);

  return <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto" }} />;
};

export const LabelSheetPage: React.FC = () => {
  useDocumentTitle("Print Labels");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const itemId = searchParams.get("item_id");
  const itemIdsParam = searchParams.get("item_ids");
  const locationId = searchParams.get("location_id");
  const boxId = searchParams.get("box_id");
  const moveId = searchParams.get("move_id");

  const [preset, setPreset] = useState<"small" | "medium" | "large" | "a4_grid">(
    boxId || moveId ? "large" : "medium"
  );
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [copies, setCopies] = useState(1);
  const [showQr, setShowQr] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showStoragePlace, setShowStoragePlace] = useState(true);
  const [monochrome, setMonochrome] = useState(false);

  useEffect(() => {
    const loadLabelData = async () => {
      const origin = window.location.origin;
      const list: LabelData[] = [];
      const parsedItemIds = parseLabelItemIds(itemId, itemIdsParam);

      if (parsedItemIds.length > 0) {
        const fetchedItems = await Promise.all(parsedItemIds.map((id) => api.getItem(id)));
        const qrUrls = await Promise.all(
          fetchedItems.map((item) =>
            QRCode.toDataURL(`${origin}/#/i/${item.id}`, { width: 100, margin: 1 })
          )
        );
        fetchedItems.forEach((item, index) => {
          list.push({
            id: formatItemCode(item.id),
            type: "item",
            name: item.name,
            path: extractStoragePlaceName(item.location_name || item.location_path),
            qrUrl: qrUrls[index],
          });
        });
      } else if (locationId) {
        const loc = await api.getLocation(Number(locationId));
        const qrTarget = `${origin}/#/l/${loc.id}`;
        const qrUrl = await QRCode.toDataURL(qrTarget, { width: 100, margin: 1 });
        list.push({
          id: `L${loc.id}`,
          type: "location",
          name: loc.name,
          path: undefined,
          qrUrl,
        });
      } else if (boxId) {
        const box = await api.getBox(Number(boxId));
        const qrTarget = `${origin}/#/moves?box_id=${box.id}`;
        const qrUrl = await QRCode.toDataURL(qrTarget, { width: 120, margin: 1 });
        list.push({
          id: `BOX-${box.number}`,
          type: "box",
          name: box.label,
          boxNumber: box.number,
          path: box.destination ? `Room: ${box.destination}` : undefined,
          destination: box.destination,
          colour: box.colour,
          itemCount: box.items_count,
          qrUrl,
        });
      } else if (moveId) {
        const boxes = await api.getBoxes(Number(moveId));
        const qrUrls = await Promise.all(
          boxes.map((b) =>
            QRCode.toDataURL(`${origin}/#/moves?box_id=${b.id}`, { width: 120, margin: 1 })
          )
        );
        boxes.forEach((b, index) => {
          list.push({
            id: `BOX-${b.number}`,
            type: "box",
            name: b.label,
            boxNumber: b.number,
            path: b.destination ? `Room: ${b.destination}` : undefined,
            destination: b.destination,
            colour: b.colour,
            itemCount: b.items_count,
            qrUrl: qrUrls[index],
          });
        });
      } else {
        // Default sample label if opened directly
        const sampleUrl = `${origin}/#/scan`;
        const qrUrl = await QRCode.toDataURL(sampleUrl, { width: 100, margin: 1 });
        list.push({
          id: "WZ_APP",
          type: "location",
          name: "Wherezy App",
          path: "Local Wi-Fi Network",
          qrUrl,
        });
      }

      setLabels(list);
    };

    loadLabelData().catch(console.error);
  }, [itemId, itemIdsParam, locationId, boxId, moveId]);

  const handlePrint = () => {
    window.print();
  };

  // Duplicate for number of copies
  const allLabels = useMemo<LabelData[]>(() => buildLabelCopies(labels, copies), [labels, copies]);

  // Dimensions based on preset
  const presetStyles = {
    small: {
      width: "40mm",
      minHeight: "20mm",
      padding: "2mm",
      fontSize: "8px",
      qrSize: 45,
    },
    medium: {
      width: "60mm",
      minHeight: "40mm",
      padding: "3.5mm",
      fontSize: "11px",
      qrSize: 75,
    },
    large: {
      width: "100mm",
      minHeight: "65mm",
      padding: "5mm",
      fontSize: "13px",
      qrSize: 95,
    },
    a4_grid: {
      width: "65mm",
      minHeight: "34mm",
      padding: "2.5mm",
      fontSize: "10px",
      qrSize: 60,
    },
  }[preset];

  return (
    <Box sx={{ p: { xs: 1, sm: 3 } }}>
      {/* Controls: hidden during print */}
      <Box
        className="no-print"
        sx={{
          mb: 3,
          p: 2,
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
              Back
            </Button>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {boxId || moveId ? "Box Labels Sheet" : "Print Labels Sheet"}
            </Typography>
            <Chip
              size="small"
              label={`${allLabels.length} ${allLabels.length === 1 ? "Label" : "Labels"}`}
              color="primary"
              variant="outlined"
            />
          </Box>

          <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint} size="large">
            Print Labels
          </Button>
        </Box>

        <Divider />

        <Box sx={{ display: "flex", gap: 2.5, alignItems: "center", flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>Label Preset</InputLabel>
            <Select
              value={preset}
              label="Label Preset"
              onChange={(e) => setPreset(e.target.value as any)}
            >
              <MenuItem value="small">Small (40 x 20 mm)</MenuItem>
              <MenuItem value="medium">Medium (60 x 40 mm)</MenuItem>
              <MenuItem value="large">Box / Shipping (100 x 65 mm)</MenuItem>
              <MenuItem value="a4_grid">A4 Grid (3x8 Labels)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="number"
            label="Copies"
            value={copies}
            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
            sx={{ width: 90 }}
          />

          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} />}
              label={<Typography variant="body2">QR Code</Typography>}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={showBarcode} onChange={(e) => setShowBarcode(e.target.checked)} />}
              label={<Typography variant="body2">Barcode</Typography>}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={showStoragePlace} onChange={(e) => setShowStoragePlace(e.target.checked)} />}
              label={<Typography variant="body2">Storage Place</Typography>}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={monochrome} onChange={(e) => setMonochrome(e.target.checked)} />}
              label={<Typography variant="body2">Thermal / B&W</Typography>}
            />
          </Box>
        </Box>
      </Box>

      {/* Label Sheet Container */}
      <Box
        id="label-sheet-container"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: preset === "a4_grid" ? "2mm" : "4mm",
          justifyContent: "flex-start",
          bgcolor: (theme) => (theme.palette.mode === "dark" ? "#0b0f19" : "#f1f5f9"),
          p: { xs: 1.5, sm: 3 },
          borderRadius: 2,
          minHeight: "400px",
        }}
      >
        {allLabels.map((lbl, idx) => (
          <Paper
            key={`${lbl.id}-${idx}`}
            variant="outlined"
            className="label-card"
            sx={{
              width: presetStyles.width,
              minHeight: presetStyles.minHeight,
              p: presetStyles.padding,
              fontSize: presetStyles.fontSize,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              pageBreakInside: "avoid",
              border: monochrome ? "1.5px solid #000000" : "1px solid #d1d5db",
              borderRadius: "6px",
              bgcolor: "#ffffff !important",
              color: "#111827 !important",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            {showQr && lbl.qrUrl && (
              <img
                src={lbl.qrUrl}
                alt="QR"
                style={{
                  width: presetStyles.qrSize,
                  height: presetStyles.qrSize,
                  flexShrink: 0,
                  borderRadius: 4,
                  backgroundColor: "#ffffff",
                }}
              />
            )}
            <Box sx={{ overflow: "hidden", flexGrow: 1, minWidth: 0 }}>
              {lbl.type === "box" && (
                <Box
                  sx={{
                    display: "inline-block",
                    px: 0.75,
                    py: 0.15,
                    borderRadius: 0.75,
                    bgcolor: monochrome ? "#f3f4f6" : alpha(lbl.colour || "#1976d2", 0.12),
                    border: `1px solid ${monochrome ? "#d1d5db" : alpha(lbl.colour || "#1976d2", 0.35)}`,
                    color: monochrome ? "#111827 !important" : `${lbl.colour || "#1976d2"} !important`,
                    fontWeight: 800,
                    fontSize: "0.8em",
                    mb: 0.35,
                  }}
                >
                  BOX #{lbl.boxNumber}
                </Box>
              )}
              <Typography
                variant="subtitle2"
                sx={{
                  fontSize: preset === "large" ? "1.25em" : "1.1em",
                  lineHeight: 1.25,
                  color: "#111827 !important",
                  fontWeight: 700,
                }}
                noWrap
              >
                {lbl.name}
              </Typography>
              {showStoragePlace && lbl.path && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontSize: preset === "large" ? "0.95em" : "0.85em",
                    color: "#374151 !important",
                    fontWeight: 600,
                    my: 0.25,
                  }}
                  noWrap
                >
                  {lbl.path}
                </Typography>
              )}
              {lbl.itemCount !== undefined && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontSize: "0.8em",
                    color: "#4b5563 !important",
                    fontWeight: 500,
                  }}
                >
                  {lbl.itemCount} {lbl.itemCount === 1 ? "item" : "items"} packed
                </Typography>
              )}
              {showBarcode && (
                <Box sx={{ mt: 0.5 }}>
                  <BarcodeCanvas value={lbl.id} />
                </Box>
              )}
            </Box>
          </Paper>
        ))}
      </Box>

      {/* Print CSS for Labels */}
      <style>{`
        @media print {
          body {
            background-color: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print, header, nav, .MuiDrawer-root, .MuiBottomNavigation-root {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
          }
          #label-sheet-container {
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #fff !important;
          }
          .label-card {
            border: 0.5px solid #aaa !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }
          .label-card * {
            color: #000 !important;
            border-color: #aaa !important;
          }
        }
      `}</style>
    </Box>
  );
};
