import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Button,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import { AlertDialog } from "../../components/shared/AlertDialog";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api, ApiException } from "../../api/client";
import { LocationPicker } from "../locations/LocationPicker";
import { ItemDetailDialog } from "../items/ItemDetailDialog";

type HealthCheckKey = "no_location" | "no_photo" | "long_expired" | "duplicate" | "stale_inbox";

export const HealthPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HealthCheckKey>("no_location");
  const [counts, setCounts] = useState<Record<string, number>>({
    no_location: 0,
    no_photo: 0,
    long_expired: 0,
    duplicate: 0,
    stale_inbox: 0,
  });
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Detail dialog
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // Quick move dialog
  const [moveItem, setMoveItem] = useState<any | null>(null);
  const [newLocId, setNewLocId] = useState<number | null>(null);

  // Quick retire dialog
  const [retireItem, setRetireItem] = useState<any | null>(null);
  const [retireReason, setRetireReason] = useState<string>("thrown_away");
  const [retireDate, setRetireDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [retireNote, setRetireNote] = useState<string>("");

  const loadData = async (checkKey = activeTab) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [overview, list] = await Promise.all([
        api.getHealthOverview(),
        api.getHealthItems(checkKey),
      ]);
      setCounts({
        no_location: overview.no_location || 0,
        no_photo: overview.no_photo || 0,
        long_expired: overview.long_expired || 0,
        duplicate: overview.duplicate || 0,
        stale_inbox: overview.stale_inbox || 0,
      });
      setItems(Array.isArray(list) ? list : []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.error?.message || "Failed to load data health checks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const handleTabChange = (key: HealthCheckKey) => {
    setActiveTab(key);
  };

  const handleIgnore = async (itemId: number, otherItemId?: number) => {
    try {
      await api.ignoreHealthFinding(activeTab, itemId, otherItemId);
      loadData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to ignore finding");
    }
  };

  const handleSaveMove = async () => {
    if (!moveItem) return;
    try {
      await api.moveItem(moveItem.id, newLocId);
      setMoveItem(null);
      loadData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to move item");
    }
  };

  const handleSaveRetire = async () => {
    if (!retireItem) return;
    try {
      await api.retireItem(
        retireItem.id,
        retireReason,
        retireDate,
        retireNote.trim() || undefined
      );
      setRetireItem(null);
      loadData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to retire item");
    }
  };

  const CHECKS: { key: HealthCheckKey; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      key: "no_location",
      label: "No Location",
      icon: <PlaceOutlinedIcon />,
      desc: "Items without a physical shelf or room",
    },
    {
      key: "no_photo",
      label: "No Photo",
      icon: <PhotoCameraOutlinedIcon />,
      desc: "Items missing a reference photo",
    },
    {
      key: "long_expired",
      label: "Long Expired",
      icon: <EventBusyOutlinedIcon />,
      desc: "Items expired more than 90 days ago",
    },
    {
      key: "duplicate",
      label: "Duplicates",
      icon: <ContentCopyOutlinedIcon />,
      desc: "Items with identical names in same category",
    },
    {
      key: "stale_inbox",
      label: "Stale Inbox",
      icon: <MoveToInboxOutlinedIcon />,
      desc: "Unsorted inbox photos older than 14 days",
    },
  ];

  return (
    <Box sx={{ width: "100%" }}>
      {/* Page Title */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <HealingOutlinedIcon color="primary" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Data Health
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review and tidy up items missing details, duplicates, or long-expired stock
            </Typography>
          </Box>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => loadData()}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Health Check Error"
        message={errorMsg}
        severity="error"
      />

      {/* Summary Cards Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {CHECKS.map((c) => {
          const isSelected = activeTab === c.key;
          const count = counts[c.key] || 0;
          return (
            <Grid key={c.key} size={{ xs: 6, sm: 4, md: 2.4 }}>
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 1,
                  borderColor: isSelected ? "primary.main" : "divider",
                  borderWidth: isSelected ? 2 : 1,
                  bgcolor: isSelected ? (t) => (t.palette.mode === "dark" ? "rgba(144, 202, 249, 0.08)" : "rgba(25, 118, 210, 0.04)") : "background.paper",
                }}
              >
                <CardActionArea onClick={() => handleTabChange(c.key)} sx={{ p: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Box sx={{ color: isSelected ? "primary.main" : "text.secondary" }}>{c.icon}</Box>
                    <Chip
                      label={count}
                      size="small"
                      color={count > 0 ? (isSelected ? "primary" : "default") : "default"}
                      sx={{ fontWeight: 700, height: 22 }}
                    />
                  </Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                    {c.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {c.desc}
                  </Typography>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Results Table */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 1 }}>
          <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 56, color: "success.main", mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Everything looks great!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No items currently found under &quot;{CHECKS.find((c) => c.key === activeTab)?.label}&quot;.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
          <Table>
            <TableHead sx={{ bgcolor: "action.hover" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
                {activeTab === "long_expired" && <TableCell sx={{ fontWeight: 600 }}>Expired On</TableCell>}
                {activeTab === "stale_inbox" && <TableCell sx={{ fontWeight: 600 }}>Captured</TableCell>}
                {activeTab === "duplicate" && <TableCell sx={{ fontWeight: 600 }}>Matching Duplicate</TableCell>}
                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => {
                const it = row.item || row;
                const match = row.match;

                return (
                  <TableRow key={it.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {it.name}
                      </Typography>
                      {it.notes && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260, display: "block" }}>
                          {it.notes}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={it.category_name || "Uncategorized"} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {it.location_path || it.location_name ? (
                        <Typography variant="body2">{it.location_path || it.location_name}</Typography>
                      ) : (
                        <Chip label="None" size="small" color="error" variant="outlined" />
                      )}
                    </TableCell>
                    {activeTab === "long_expired" && (
                      <TableCell>
                        <Chip label={it.expiry_date} size="small" color="error" />
                      </TableCell>
                    )}
                    {activeTab === "stale_inbox" && (
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {it.captured_at ? it.captured_at.substring(0, 10) : it.created_at?.substring(0, 10)}
                        </Typography>
                      </TableCell>
                    )}
                    {activeTab === "duplicate" && (
                      <TableCell>
                        {match ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              #{match.id} - {match.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Location: {match.location_path || "None"}
                            </Typography>
                          </Box>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5 }}>
                        <Tooltip title="View item details">
                          <IconButton size="small" onClick={() => setSelectedItemId(it.id)}>
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {activeTab === "no_location" && (
                          <Tooltip title="Assign location">
                            <IconButton size="small" color="primary" onClick={() => { setMoveItem(it); setNewLocId(null); }}>
                              <DriveFileMoveOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Retire item">
                          <IconButton size="small" color="warning" onClick={() => { setRetireItem(it); setRetireNote(""); }}>
                            <RemoveCircleOutlineOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={activeTab === "duplicate" ? "Not a duplicate (Ignore)" : "Ignore this finding"}>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => handleIgnore(it.id, match?.id)}
                            sx={{ minWidth: 0, textTransform: "none", fontSize: "0.75rem" }}
                          >
                            Ignore
                          </Button>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        itemId={selectedItemId}
        open={Boolean(selectedItemId)}
        onClose={() => setSelectedItemId(null)}
        onUpdated={() => loadData()}
        onDeleted={() => {
          setSelectedItemId(null);
          loadData();
        }}
      />

      {/* Quick Move Dialog */}
      <Dialog open={Boolean(moveItem)} onClose={() => setMoveItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Location</DialogTitle>
        <DialogContent sx={{ pt: "24px !important", display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="body2">
            Select a storage location for &quot;{moveItem?.name}&quot;:
          </Typography>
          <LocationPicker
            value={newLocId}
            onChange={(id) => setNewLocId(id)}
            label="Location"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveItem(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveMove}>
            Save Location
          </Button>
        </DialogActions>
      </Dialog>

      {/* Quick Retire Dialog */}
      <Dialog open={Boolean(retireItem)} onClose={() => setRetireItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Retire Item</DialogTitle>
        <DialogContent sx={{ pt: "24px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          <Typography variant="body2">
            Retire &quot;{retireItem?.name}&quot; from inventory (preserves item history and photos).
          </Typography>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="retire-reason-label">Reason</InputLabel>
            <Select
              labelId="retire-reason-label"
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
            label="Retire Date"
            type="date"
            value={retireDate}
            onChange={(e) => setRetireDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Note (Optional)"
            placeholder="e.g. Donated to local charity"
            value={retireNote}
            onChange={(e) => setRetireNote(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetireItem(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleSaveRetire}>
            Retire
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};