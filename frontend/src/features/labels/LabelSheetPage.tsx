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
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import QRCode from "qrcode";
import { api } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatItemCode } from "../items/itemCodeUtils";
import { buildLabelCopies, renderBarcodeToCanvas, type LabelData } from "./labelUtils";

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
  const locationId = searchParams.get("location_id");

  const [preset, setPreset] = useState<"small" | "medium" | "a4_grid">("medium");
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    const loadLabelData = async () => {
      const origin = window.location.origin;
      const list: LabelData[] = [];

      if (itemId) {
        const item = await api.getItem(Number(itemId));
        const qrTarget = `${origin}/#/i/${item.id}`;
        const qrUrl = await QRCode.toDataURL(qrTarget, { width: 100, margin: 1 });
        list.push({
          id: formatItemCode(item.id),
          type: "item",
          name: item.name,
          path: item.location_path || undefined,
          qrUrl,
        });
      } else if (locationId) {
        const loc = await api.getLocation(Number(locationId));
        const qrTarget = `${origin}/#/l/${loc.id}`;
        const qrUrl = await QRCode.toDataURL(qrTarget, { width: 100, margin: 1 });
        list.push({
          id: `L${loc.id}`,
          type: "location",
          name: loc.name,
          path: loc.path || undefined,
          qrUrl,
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
  }, [itemId, locationId]);

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
      padding: "3mm",
      fontSize: "11px",
      qrSize: 75,
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
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>

        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Label Preset</InputLabel>
            <Select
              value={preset}
              label="Label Preset"
              onChange={(e) => setPreset(e.target.value as any)}
            >
              <MenuItem value="small">Small (40 x 20 mm)</MenuItem>
              <MenuItem value="medium">Medium (60 x 40 mm)</MenuItem>
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
        </Box>

        <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint} size="large">
          Print Labels
        </Button>
      </Box>

      {/* Label Sheet */}
      <Box
        id="label-sheet-container"
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: preset === "a4_grid" ? "2mm" : "4mm",
          justifyContent: "flex-start",
          bgcolor: "background.paper",
          p: { xs: 1, sm: 3 },
          borderRadius: 2,
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
              gap: 1,
              pageBreakInside: "avoid",
              border: "1px dashed #999",
              bgcolor: "#fff",
              color: "#000",
            }}
          >
            {lbl.qrUrl && (
              <img
                src={lbl.qrUrl}
                alt="QR"
                style={{ width: presetStyles.qrSize, height: presetStyles.qrSize, flexShrink: 0 }}
              />
            )}
            <Box sx={{ overflow: "hidden", flexGrow: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{ fontSize: "1.1em", lineHeight: 1.2, color: "#000", fontWeight: 700 }}
                noWrap
              >
                {lbl.name}
              </Typography>
              {lbl.path && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", fontSize: "0.85em", color: "#555", my: 0.2 }}
                  noWrap
                >
                  {lbl.path}
                </Typography>
              )}
              <Box sx={{ mt: 0.5 }}>
                <BarcodeCanvas value={lbl.id} />
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>

      {/* Print CSS for Labels */}
      <style>{`
        @media print {
          body {
            background-color: #fff !important;
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
          }
          .label-card {
            border: 0.5px solid #ccc !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </Box>
  );
};
