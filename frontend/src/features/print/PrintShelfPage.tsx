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
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatTakenOutStatusLabel, getItemQuantity } from "../items/quantityUtils";
import { formatItemCode } from "../items/itemCodeUtils";

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

export interface ShelfAuditGroup {
  locationId: number;
  name: string;
  path: string;
  items: any[];
  isRoot: boolean;
}

export const PrintShelfPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [location, setLocation] = useState<any | null>(null);
  useDocumentTitle(location?.name ? `Shelf Audit: ${location.name}` : "Shelf Audit Sheet");
  const [items, setItems] = useState<any[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrMap, setQrMap] = useState<Record<number, string>>({});
  const [printedAt] = useState(() => new Date());

  // Options
  const [includeSub, setIncludeSub] = useState<boolean>(() => {
    return safeGetLocalStorage("print_inc_sub") !== "false";
  });
  const [showPhotos, setShowPhotos] = useState<boolean>(() => {
    return safeGetLocalStorage("print_photos") !== "false";
  });
  const [showAuditBox, setShowAuditBox] = useState<boolean>(() => {
    return safeGetLocalStorage("print_audit") !== "false";
  });
  const [onePerPage, setOnePerPage] = useState<boolean>(() => {
    return safeGetLocalStorage("print_one_per_page") === "true";
  });
  const [fontSize, setFontSize] = useState<string>(() => {
    return safeGetLocalStorage("print_font") || "medium";
  });

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const [loc, locItems] = await Promise.all([
          api.getLocation(Number(id)),
          api.getLocationItems(Number(id), includeSub),
        ]);
        if (!active) return;
        setLocation(loc);
        setItems(locItems);

        const targetUrl = `${window.location.origin}/#/l/${loc.id}`;
        const rootQr = await QRCode.toDataURL(targetUrl, { width: 100, margin: 1 });
        if (!active) return;
        setQrDataUrl(rootQr);

        const distinctLocIds = Array.from(
          new Set([loc.id, ...locItems.map((it: any) => it.location_id).filter(Boolean)])
        );
        const map: Record<number, string> = { [loc.id]: rootQr };
        await Promise.all(
          distinctLocIds.map(async (lid) => {
            if (lid === loc.id) return;
            try {
              const url = `${window.location.origin}/#/l/${lid}`;
              map[lid] = await QRCode.toDataURL(url, { width: 100, margin: 1 });
            } catch {}
          })
        );
        if (active) setQrMap(map);
      } catch (err) {
        if (active) console.error(err);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, includeSub]);

  const handlePrint = () => {
    window.print();
  };

  // Build structured groups
  const groups: ShelfAuditGroup[] = [];

  if (items.length === 0) {
    if (location) {
      groups.push({
        locationId: location.id,
        name: location.name,
        path: location.path || location.name,
        items: [],
        isRoot: true,
      });
    }
  } else if (!includeSub) {
    if (location) {
      groups.push({
        locationId: location.id,
        name: location.name,
        path: location.path || location.name,
        items,
        isRoot: true,
      });
    }
  } else {
    // 1. Direct items in root location
    const rootItems = items.filter((it) => it.location_id === location?.id);
    if (rootItems.length > 0 && location) {
      groups.push({
        locationId: location.id,
        name: location.name,
        path: location.path || location.name,
        items: rootItems,
        isRoot: true,
      });
    }

    // 2. Sub-location items grouped by location_id or location_path
    const subGroupsMap = new Map<number | string, ShelfAuditGroup>();
    items.forEach((it) => {
      if (it.location_id === location?.id) return;
      const key = it.location_id || it.location_path || "sub";
      if (!subGroupsMap.has(key)) {
        subGroupsMap.set(key, {
          locationId: it.location_id || location?.id,
          name: it.location_name || it.location_path?.split(" > ").pop() || location?.name,
          path: it.location_path || location?.path || location?.name,
          items: [],
          isRoot: false,
        });
      }
      subGroupsMap.get(key)!.items.push(it);
    });

    subGroupsMap.forEach((sg) => {
      groups.push(sg);
    });

    // Fallback: If no groups were formed, add root
    if (groups.length === 0 && location) {
      groups.push({
        locationId: location.id,
        name: location.name,
        path: location.path || location.name,
        items,
        isRoot: true,
      });
    }
  }

  const fontSizeMap = {
    small: "11px",
    medium: "13px",
    large: "15px",
  };
  const tableFontSize = fontSizeMap[fontSize as keyof typeof fontSizeMap] || "13px";

  const renderTable = (groupItemList: any[]) => {
    if (groupItemList.length === 0) {
      return (
        <Box sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
          <Typography variant="body2" className="print-muted">
            No items directly stored in this location.
          </Typography>
        </Box>
      );
    }

    return (
      <TableContainer component={Box}>
        <Table size="small" sx={{ "& th, & td": { fontSize: tableFontSize, py: 1 } }}>
          <TableHead>
            <TableRow sx={{ bgcolor: "action.selected" }}>
              {showAuditBox && <TableCell width={40} align="center">Tick</TableCell>}
              {showPhotos && <TableCell width={50}>Photo</TableCell>}
              <TableCell>Item Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell width={60} align="center">Qty</TableCell>
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
                      className="audit-tick-box"
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
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    className="print-muted"
                    sx={{ display: "block", fontFamily: "var(--font-mono)" }}
                  >
                    {formatItemCode(it.id)}
                  </Typography>
                </TableCell>
                <TableCell>{it.category_name || "—"}</TableCell>
                <TableCell align="center" sx={{ fontFamily: "var(--font-mono)" }}>
                  {getItemQuantity(it)}
                </TableCell>
                <TableCell>{it.expiry_date || "—"}</TableCell>
                <TableCell>
                  {formatTakenOutStatusLabel(it)}
                </TableCell>
                <TableCell>{it.notes || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

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
                  safeSetLocalStorage("print_inc_sub", String(e.target.checked));
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
                  safeSetLocalStorage("print_photos", String(e.target.checked));
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
                  safeSetLocalStorage("print_audit", String(e.target.checked));
                }}
              />
            }
            label="Audit tick-box"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={onePerPage}
                onChange={(e) => {
                  setOnePerPage(e.target.checked);
                  safeSetLocalStorage("print_one_per_page", String(e.target.checked));
                }}
              />
            }
            label="One location/box per page"
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Font Size</InputLabel>
            <Select
              value={fontSize}
              label="Font Size"
              onChange={(e) => {
                setFontSize(e.target.value);
                safeSetLocalStorage("print_font", e.target.value);
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
        {onePerPage ? (
          // One location/box per page mode: Each group is a complete self-contained page with its header + table + footer
          groups.map((group, groupIdx) => {
            const qrUrl = qrMap[group.locationId] || qrDataUrl;
            return (
              <Box
                key={group.locationId ? `loc-${group.locationId}` : `grp-${groupIdx}`}
                className="shelf-page-card one-per-page"
                sx={{
                  mb: groupIdx < groups.length - 1 ? 4 : 0,
                  p: { xs: 1.5, sm: 3 },
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  bgcolor: "background.paper",
                }}
              >
                {/* Header for this page */}
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
                  <Box>
                    <Typography variant="overline" color="text.secondary" className="print-muted">
                      Wherezy Shelf Audit Sheet{groups.length > 1 ? ` • Box ${groupIdx + 1} of ${groups.length}` : ""}
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }} gutterBottom>
                      {group.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" className="print-muted">
                      Path: {group.path}
                    </Typography>
                    {!group.isRoot && location && location.name !== group.name && (
                      <Typography variant="caption" color="text.secondary" className="print-muted" sx={{ display: "block" }}>
                        In: {location.name}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" className="print-muted" sx={{ display: "block" }}>
                      Printed on {printedAt.toLocaleDateString()} at {printedAt.toLocaleTimeString()}
                    </Typography>
                  </Box>

                  {qrUrl && (
                    <Box sx={{ textAlign: "center" }}>
                      <img src={qrUrl} alt="Location QR" style={{ width: 80, height: 80 }} />
                      <Typography
                        variant="caption"
                        sx={{ display: "block", fontFamily: "var(--font-mono)", fontWeight: 700 }}
                      >
                        L{group.locationId}
                      </Typography>
                    </Box>
                  )}
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Typography
                  variant="subtitle1"
                  className="section-banner"
                  sx={{
                    fontWeight: 700,
                    mb: 1.5,
                    bgcolor: "action.hover",
                    p: 1,
                    borderRadius: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{group.name}</span>
                  <span>{group.items.length} {group.items.length === 1 ? "item" : "items"}</span>
                </Typography>

                {renderTable(group.items)}

                {/* Shelf Sheet Footer */}
                <Box
                  className="page-footer"
                  sx={{
                    mt: 3,
                    pt: 1.5,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    color: "text.secondary",
                    fontSize: "0.8rem",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Typography variant="caption" className="print-muted" sx={{ fontWeight: 600 }}>
                    Wherezy Shelf Audit Sheet • Location: {group.name}
                  </Typography>
                  <Typography variant="caption" className="print-muted">
                    {group.items.length} {group.items.length === 1 ? "item" : "items"} listed
                    {groups.length > 1 ? ` • Box ${groupIdx + 1} of ${groups.length}` : ""} • Printed on {printedAt.toLocaleDateString()} {printedAt.toLocaleTimeString()}
                  </Typography>
                </Box>
              </Box>
            );
          })
        ) : (
          // Continuous Sheet Mode: Master header at top, groups with banners, master footer at bottom
          <Box className="shelf-page-card continuous">
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
              <Box>
                <Typography variant="overline" color="text.secondary" className="print-muted">
                  Wherezy Shelf Audit Sheet
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }} gutterBottom>
                  {location?.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" className="print-muted">
                  Path: {location?.path || location?.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" className="print-muted" sx={{ display: "block" }}>
                  Printed on {printedAt.toLocaleDateString()} at {printedAt.toLocaleTimeString()}
                </Typography>
              </Box>

              {qrDataUrl && (
                <Box sx={{ textAlign: "center" }}>
                  <img src={qrDataUrl} alt="Location QR" style={{ width: 80, height: 80 }} />
                  <Typography variant="caption" sx={{ display: "block", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                    L{location?.id}
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider sx={{ mb: 2 }} />

            {groups.map((group) => (
              <Box key={group.locationId || group.name} sx={{ mb: 3 }}>
                <Typography
                  variant="subtitle1"
                  className="section-banner"
                  sx={{
                    fontWeight: 700,
                    mb: 1,
                    bgcolor: "action.hover",
                    p: 1,
                    borderRadius: 1,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{group.name} {group.path && group.path !== group.name ? `— ${group.path}` : ""}</span>
                  <span>{group.items.length} {group.items.length === 1 ? "item" : "items"}</span>
                </Typography>

                {renderTable(group.items)}
              </Box>
            ))}

            <Box
              className="page-footer"
              sx={{
                mt: 4,
                pt: 2,
                borderTop: "1px solid",
                borderColor: "divider",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "text.secondary",
                fontSize: "0.8rem",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Typography variant="caption" className="print-muted" sx={{ fontWeight: 600 }}>
                Wherezy Shelf Audit Sheet • Location: {location?.name}
              </Typography>
              <Typography variant="caption" className="print-muted">
                {items.length} total {items.length === 1 ? "item" : "items"} listed • Printed on {printedAt.toLocaleDateString()} {printedAt.toLocaleTimeString()}
              </Typography>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Global Print CSS */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm 10mm;
          }
          html, body {
            background-color: #ffffff !important;
            color: #111827 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
            background-color: #ffffff !important;
            color: #111827 !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          #printable-shelf-sheet * {
            color: #111827 !important;
            border-color: #d1d5db !important;
            text-shadow: none !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-shelf-sheet .MuiTypography-root {
            color: #111827 !important;
          }
          #printable-shelf-sheet h1,
          #printable-shelf-sheet h2,
          #printable-shelf-sheet h3,
          #printable-shelf-sheet h4,
          #printable-shelf-sheet h5,
          #printable-shelf-sheet h6,
          #printable-shelf-sheet .MuiTypography-h4,
          #printable-shelf-sheet .MuiTypography-h5,
          #printable-shelf-sheet .MuiTypography-subtitle1 {
            color: #000000 !important;
            font-weight: 800 !important;
          }
          #printable-shelf-sheet .MuiTypography-colorTextSecondary,
          #printable-shelf-sheet .MuiTypography-caption,
          #printable-shelf-sheet .MuiTypography-overline,
          #printable-shelf-sheet .print-muted {
            color: #374151 !important;
            font-weight: 500 !important;
          }
          #printable-shelf-sheet .MuiDivider-root,
          #printable-shelf-sheet hr {
            border-color: #111827 !important;
            border-bottom-width: 1.5px !important;
            opacity: 1 !important;
          }
          #printable-shelf-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          #printable-shelf-sheet thead {
            display: table-header-group !important;
          }
          #printable-shelf-sheet th,
          #printable-shelf-sheet .MuiTableCell-head {
            background-color: #f3f4f6 !important;
            color: #000000 !important;
            font-weight: 800 !important;
            border-top: 1px solid #111827 !important;
            border-bottom: 2px solid #111827 !important;
            border-left: none !important;
            border-right: none !important;
            padding: 6px 8px !important;
          }
          #printable-shelf-sheet td,
          #printable-shelf-sheet .MuiTableCell-body {
            color: #111827 !important;
            border-bottom: 1px solid #e5e7eb !important;
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
            background-color: #ffffff !important;
            padding: 6px 8px !important;
          }
          #printable-shelf-sheet tr:nth-of-type(even) td,
          #printable-shelf-sheet tr:nth-of-type(even) .MuiTableCell-body {
            background-color: #f9fafb !important;
          }
          #printable-shelf-sheet tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #printable-shelf-sheet .section-banner {
            background-color: #f3f4f6 !important;
            color: #000000 !important;
            font-weight: 700 !important;
            border-left: 4px solid #111827 !important;
            border-top: 1px solid #e5e7eb !important;
            border-right: 1px solid #e5e7eb !important;
            border-bottom: 1px solid #e5e7eb !important;
          }
          #printable-shelf-sheet .audit-tick-box {
            border: 2px solid #000000 !important;
            background-color: #ffffff !important;
          }
          .shelf-page-card.one-per-page {
            page-break-after: always !important;
            break-after: page !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .shelf-page-card.one-per-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>
    </Box>
  );
};
