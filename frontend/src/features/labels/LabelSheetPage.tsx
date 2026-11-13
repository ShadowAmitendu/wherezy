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

function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  } catch {}
}

export const LabelSheetPage: React.FC = () => {
  useDocumentTitle("Print Labels");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const itemId = searchParams.get("item_id");
  const itemIdsParam = searchParams.get("item_ids");
  const locationId = searchParams.get("location_id");
  const boxId = searchParams.get("box_id");
  const moveId = searchParams.get("move_id");

  const isBoxOrMoveOrLocation = Boolean(boxId || moveId || locationId);
  const [preset, setPreset] = useState<"small" | "medium" | "large" | "a4_grid" | "one_per_page">(
    isBoxOrMoveOrLocation ? "one_per_page" : "medium"
  );
  const [onePerPage, setOnePerPage] = useState<boolean>(() => {
    const saved = safeGetLocalStorage("label_one_per_page");
    if (saved !== null) return saved === "true";
    return isBoxOrMoveOrLocation;
  });
  const [includeSubLocations, setIncludeSubLocations] = useState<boolean>(() => {
    return safeGetLocalStorage("label_inc_sub") !== "false";
  });
  const [hasSubLocations, setHasSubLocations] = useState<boolean>(false);
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
        const children = Array.isArray(loc.children) ? loc.children : [];
        setHasSubLocations(children.length > 0);
        const qrTarget = `${origin}/#/l/${loc.id}`;
        const qrUrl = await QRCode.toDataURL(qrTarget, { width: 140, margin: 1 });
        list.push({
          id: `L${loc.id}`,
          type: "location",
          name: loc.name,
          locationKind: loc.kind || "Room",
          path: loc.path || undefined,
          qrUrl,
        });

        if (includeSubLocations && children.length > 0) {
          const childQrUrls = await Promise.all(
            children.map((child: any) =>
              QRCode.toDataURL(`${origin}/#/l/${child.id}`, { width: 140, margin: 1 })
            )
          );
          children.forEach((child: any, idx: number) => {
            list.push({
              id: `L${child.id}`,
              type: "location",
              name: child.name,
              locationKind: child.kind || "Storage Area",
              path: loc.name,
              qrUrl: childQrUrls[idx],
            });
          });
        }
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
  }, [itemId, itemIdsParam, locationId, boxId, moveId, includeSubLocations]);

  const handlePrint = () => {
    window.print();
  };

  // Duplicate for number of copies
  const allLabels = useMemo<LabelData[]>(() => buildLabelCopies(labels, copies), [labels, copies]);

  // Dimensions based on preset
  const presetStyles = {
    one_per_page: {
      width: "100%",
      minHeight: "220mm",
      padding: "10mm",
      fontSize: "16px",
      qrSize: 150,
    },
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
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Label Preset</InputLabel>
            <Select
              value={preset}
              label="Label Preset"
              onChange={(e) => {
                const val = e.target.value as any;
                setPreset(val);
                if (val === "one_per_page") {
                  setOnePerPage(true);
                  safeSetLocalStorage("label_one_per_page", "true");
                }
              }}
            >
              <MenuItem value="one_per_page">One per Page (1 per sheet)</MenuItem>
              <MenuItem value="large">Box / Shipping (100 x 65 mm)</MenuItem>
              <MenuItem value="medium">Medium (60 x 40 mm)</MenuItem>
              <MenuItem value="small">Small (40 x 20 mm)</MenuItem>
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
              control={
                <Checkbox
                  size="small"
                  checked={onePerPage}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOnePerPage(checked);
                    safeSetLocalStorage("label_one_per_page", String(checked));
                    if (checked && preset !== "one_per_page") {
                      setPreset("one_per_page");
                    }
                  }}
                />
              }
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>One per page</Typography>}
            />
            {hasSubLocations && (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={includeSubLocations}
                    onChange={(e) => {
                      setIncludeSubLocations(e.target.checked);
                      safeSetLocalStorage("label_inc_sub", String(e.target.checked));
                    }}
                  />
                }
                label={<Typography variant="body2">Include sub-locations</Typography>}
              />
            )}
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
          flexDirection: preset === "one_per_page" ? "column" : "row",
          alignItems: preset === "one_per_page" ? "center" : "flex-start",
          gap: preset === "one_per_page" ? 4 : preset === "a4_grid" ? "2mm" : "4mm",
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
            className={`label-card ${onePerPage || preset === "one_per_page" ? "one-per-page" : ""}`}
            sx={{
              width: preset === "one_per_page" ? "100%" : presetStyles.width,
              maxWidth: preset === "one_per_page" ? "210mm" : undefined,
              minHeight: preset === "one_per_page" ? "240mm" : presetStyles.minHeight,
              p: presetStyles.padding,
              fontSize: presetStyles.fontSize,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: preset === "one_per_page" ? "column" : "row",
              justifyContent: preset === "one_per_page" ? "space-between" : "flex-start",
              alignItems: preset === "one_per_page" ? "stretch" : "center",
              gap: preset === "one_per_page" ? 2.5 : 1.5,
              pageBreakInside: "avoid",
              pageBreakAfter: (onePerPage || preset === "one_per_page") && idx < allLabels.length - 1 ? "always" : "auto",
              breakAfter: (onePerPage || preset === "one_per_page") && idx < allLabels.length - 1 ? "page" : "auto",
              border: monochrome ? "1.5px solid #000000" : "1px solid #d1d5db",
              borderRadius: "6px",
              bgcolor: "#ffffff !important",
              color: "#111827 !important",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            {preset === "one_per_page" ? (
              // High-impact Full Page Single Label View (Box or Location)
              <Box sx={{ display: "flex", flexDirection: "column", height: "100%", flexGrow: 1, justifyContent: "space-between" }}>
                {/* Header */}
                <Box sx={{ borderBottom: "2.5px solid #111827", pb: 2, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{
                        fontSize: "0.85rem",
                        fontWeight: 900,
                        letterSpacing: 2,
                        color: "#4b5563 !important",
                        display: "block",
                      }}
                    >
                      WHEREZY {lbl.type === "box" ? "MOVING BOX" : lbl.type === "location" ? "STORAGE LOCATION" : "ITEM"}
                    </Typography>
                    <Typography
                      variant="h3"
                      sx={{
                        fontWeight: 900,
                        color:
                          lbl.type === "box" && !monochrome
                            ? `${lbl.colour || "#1976d2"} !important`
                            : "#111827 !important",
                        lineHeight: 1.1,
                        my: 0.5,
                      }}
                    >
                      {lbl.type === "box" ? `BOX #${lbl.boxNumber}` : lbl.id}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: "#111827 !important" }}>
                      {lbl.name}
                    </Typography>
                  </Box>

                  {showQr && lbl.qrUrl && (
                    <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                      <img
                        src={lbl.qrUrl}
                        alt="QR"
                        style={{
                          width: 140,
                          height: 140,
                          borderRadius: 6,
                          border: "1.5px solid #d1d5db",
                        }}
                      />
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 700, mt: 0.5, color: "#374151 !important" }}>
                        Scan to Open
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Body Details */}
                <Box sx={{ my: 3, flexGrow: 1 }}>
                  {lbl.type === "box" && lbl.destination && (
                    <Box
                      sx={{
                        p: 2.5,
                        mb: 2.5,
                        bgcolor: monochrome ? "#f3f4f6" : alpha(lbl.colour || "#1976d2", 0.08),
                        border: `2px solid ${monochrome ? "#111827" : lbl.colour || "#1976d2"}`,
                        borderRadius: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          fontWeight: 900,
                          letterSpacing: 1.5,
                          fontSize: "0.85rem",
                          color: "#4b5563 !important",
                        }}
                      >
                        DESTINATION ROOM
                      </Typography>
                      <Typography
                        variant="h4"
                        sx={{
                          fontWeight: 900,
                          color: monochrome ? "#111827 !important" : `${lbl.colour || "#1976d2"} !important`,
                        }}
                      >
                        {lbl.destination}
                      </Typography>
                    </Box>
                  )}

                  {showStoragePlace && lbl.path && (
                    <Box sx={{ p: 2, mb: 2, bgcolor: "#f9fafb", borderRadius: 1.5, border: "1px solid #e5e7eb" }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: "#6b7280 !important", display: "block" }}>
                        {lbl.type === "box" ? "CURRENT LOCATION" : "STORAGE PLACE"}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827 !important" }}>
                        {lbl.path}
                      </Typography>
                    </Box>
                  )}

                  {lbl.itemCount !== undefined && (
                    <Typography variant="h6" sx={{ fontWeight: 600, color: "#4b5563 !important", mb: 1 }}>
                      Packed contents: {lbl.itemCount} {lbl.itemCount === 1 ? "item" : "items"}
                    </Typography>
                  )}

                  {lbl.locationKind && (
                    <Typography variant="body1" sx={{ fontWeight: 600, color: "#4b5563 !important" }}>
                      Location kind: {lbl.locationKind}
                    </Typography>
                  )}
                </Box>

                {/* Footer with Barcode & Verification */}
                <Box sx={{ borderTop: "2px solid #e5e7eb", pt: 2, mt: "auto" }}>
                  {showBarcode && (
                    <Box sx={{ textAlign: "center", mb: 2 }}>
                      <BarcodeCanvas value={lbl.id} />
                    </Box>
                  )}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "#6b7280 !important",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    <span>[ ] Packed &amp; Sealed</span>
                    <span>[ ] Loaded</span>
                    <span>[ ] Unpacked &amp; Audited</span>
                    <span>Page {idx + 1} of {allLabels.length}</span>
                  </Box>
                </Box>
              </Box>
            ) : (
              // Compact card view for small / medium / large / a4_grid
              <>
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
              </>
            )}
          </Paper>
        ))}
      </Box>

      {/* Print CSS for Labels */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
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
            display: block !important;
          }
          .label-card {
            border: 1px solid #aaa !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }
          .label-card.one-per-page {
            page-break-after: always !important;
            break-after: page !important;
            break-inside: avoid !important;
            width: 100% !important;
            min-height: 94vh !important;
            height: 94vh !important;
            max-height: 94vh !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 10mm !important;
            display: flex !important;
            flex-direction: column !important;
            justifyContent: space-between !important;
            border: 2px solid #000 !important;
          }
          .label-card.one-per-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .label-card * {
            color: #000 !important;
            border-color: #000 !important;
          }
        }
      `}</style>
    </Box>
  );
};
