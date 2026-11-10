import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import QRCode from "qrcode";
import { api } from "../../api/client";
import { CoverThumb } from "../photos/CoverThumb";

export const PrintShelfPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [location, setLocation] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Options
  const [includeSub, setIncludeSub] = useState<boolean>(() => {
    return localStorage.getItem("print_inc_sub") !== "false";
  });
  const [showPhotos, setShowPhotos] = useState<boolean>(() => {
    return localStorage.getItem("print_photos") !== "false";
  });
  const [showAuditBox, setShowAuditBox] = useState<boolean>(() => {
    return localStorage.getItem("print_audit") !== "false";
  });
  const [fontSize, setFontSize] = useState<string>(() => {
    return localStorage.getItem("print_font") || "medium";
  });

  const loadData = async () => {
    if (!id) return;
    try {
      const loc = await api.getLocation(Number(id));
      setLocation(loc);

      const locItems = await api.getLocationItems(Number(id), includeSub);
      setItems(locItems);

      // Generate QR code encoding location URL
      const origin = window.location.origin;
      const targetUrl = `${origin}/#/l/${loc.id}`;
      const url = await QRCode.toDataURL(targetUrl, { width: 100, margin: 1 });
      setQrDataUrl(url);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, includeSub]);

  const handlePrint = () => {
    window.print();
  };

  // Group items by sub-location if includeSub is on
  const groupedItems: Record<string, any[]> = {};
  items.forEach((item) => {
    const locPath = item.location_path || location?.name || "Directly here";
    if (!groupedItems[locPath]) {
      groupedItems[locPath] = [];
    }
    groupedItems[locPath].push(item);
  });

  const fontSizeMap = {
    small: "11px",
    medium: "13px",
    large: "15px",
  };
  const tableFontSize = fontSizeMap[fontSize as keyof typeof fontSizeMap] || "13px";

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

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeSub}
                onChange={(e) => {
                  setIncludeSub(e.target.checked);
                  localStorage.setItem("print_inc_sub", String(e.target.checked));
                }}
              />
            }
            label="Include sub-locations"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={showPhotos}
                onChange={(e) => {
                  setShowPhotos(e.target.checked);
                  localStorage.setItem("print_photos", String(e.target.checked));
                }}
              />
            }
            label="Thumbnails"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={showAuditBox}
                onChange={(e) => {
                  setShowAuditBox(e.target.checked);
                  localStorage.setItem("print_audit", String(e.target.checked));
                }}
              />
            }
            label="Audit tick-box"
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Font Size</InputLabel>
            <Select
              value={fontSize}
              label="Font Size"
              onChange={(e) => {
                setFontSize(e.target.value);
                localStorage.setItem("print_font", e.target.value);
              }}
            >
              <MenuItem value="small">Small</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="large">Large</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint} size="large">
          Print / Save as PDF
        </Button>
      </Box>

      {/* Printable Area */}
      <Paper
        id="printable-shelf-sheet"
        sx={{
          p: { xs: 2, sm: 4 },
          bgcolor: "background.paper",
          borderRadius: 2,
          fontSize: tableFontSize,
        }}
      >
        {/* Print Header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              HomeInventory Shelf Audit Sheet
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }} gutterBottom>
              {location?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Path: {location?.path || location?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Printed on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            </Typography>
          </Box>

          {qrDataUrl && (
            <Box sx={{ textAlign: "center" }}>
              <img src={qrDataUrl} alt="Location QR" style={{ width: 80, height: 80 }} />
              <Typography variant="caption" sx={{ display: "block", fontFamily: "monospace", fontWeight: 700 }}>
                L{location?.id}
              </Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Grouped Tables */}
        {Object.entries(groupedItems).map(([groupPath, groupItemList]) => (
          <Box key={groupPath} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, bgcolor: "action.hover", p: 1, borderRadius: 1 }}>
              {groupPath} ({groupItemList.length} items)
            </Typography>

            <TableContainer component={Box}>
              <Table size="small" sx={{ "& th, & td": { fontSize: tableFontSize, py: 1 } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.selected" }}>
                    {showAuditBox && <TableCell width={40} align="center">Tick</TableCell>}
                    {showPhotos && <TableCell width={50}>Photo</TableCell>}
                    <TableCell>Item Name</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Expiry</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groupItemList.map((it) => (
                    <TableRow key={it.id} sx={{ "&:nth-of-type(even)": { bgcolor: "action.hover" } }}>
                      {showAuditBox && (
                        <TableCell align="center">
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              border: "1.5px solid #000",
                              borderRadius: "3px",
                              display: "inline-block",
                            }}
                          />
                        </TableCell>
                      )}
                      {showPhotos && (
                        <TableCell>
                          <CoverThumb thumbUrl={it.cover_thumb_url} size={32} />
                        </TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 600 }}>
                        {it.name}
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontFamily: "monospace" }}>
                          I{it.id}
                        </Typography>
                      </TableCell>
                      <TableCell>{it.category_name || "—"}</TableCell>
                      <TableCell>{it.expiry_date || "—"}</TableCell>
                      <TableCell>{it.taken_out ? "Out" : "In place"}</TableCell>
                      <TableCell>{it.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ))}
      </Paper>

      {/* Global Print CSS */}
      <style>{`
        @media print {
          body {
            background-color: #fff !important;
            color: #000 !important;
          }
          .no-print, header, nav, .MuiDrawer-root, .MuiBottomNavigation-root {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          #printable-shelf-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          @page {
            size: A4;
            margin: 1.5cm;
          }
        }
      `}</style>
    </Box>
  );
};
