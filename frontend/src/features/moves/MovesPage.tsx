import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import AddIcon from "@mui/icons-material/Add";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { api, ApiException } from "../../api/client";
import { LocationPicker } from "../locations/LocationPicker";
import { AlertDialog } from "../../components/shared/AlertDialog";

export const MovesPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [activeMove, setActiveMove] = useState<any | null>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create Move Dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveName, setMoveName] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // Create Box Dialog
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [boxLabel, setBoxLabel] = useState("");
  const [boxDestination, setBoxDestination] = useState("");
  const [boxDestLocId, setBoxDestLocId] = useState<number | null>(null);
  const [boxColour, setBoxColour] = useState("");
  const [boxNotes, setBoxNotes] = useState("");

  // Box Contents Dialog
  const [selectedBox, setSelectedBox] = useState<any | null>(null);
  const [boxItems, setBoxItems] = useState<any[]>([]);
  const [loadingBoxItems, setLoadingBoxItems] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const loadMoveData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const moves = await api.getMoves();
      const move = moves.find((m: any) => m.status === "planning") || moves[0] || null;
      setActiveMove(move);
      if (move && move.id) {
        const boxList = await api.getBoxes(move.id);
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
    loadMoveData();
  }, []);

  const handleCreateMove = async () => {
    if (!moveName.trim()) {
      setErrorMsg("Move name is required");
      return;
    }
    try {
      await api.createMove({
        name: moveName.trim(),
        target_date: targetDate || undefined,
      });
      setSuccessMsg("Moving house project started!");
      setMoveDialogOpen(false);
      loadMoveData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to create move");
    }
  };

  const handleCreateBox = async () => {
    if (!activeMove) return;
    if (!boxLabel.trim()) {
      setErrorMsg("Box label is required");
      return;
    }
    try {
      await api.createBox(activeMove.id, {
        label: boxLabel.trim(),
        destination: boxDestination.trim() || undefined,
        destination_location_id: boxDestLocId,
        colour: boxColour.trim() || undefined,
        notes: boxNotes.trim() || undefined,
      });
      setSuccessMsg("Box created");
      setBoxDialogOpen(false);
      setBoxLabel("");
      setBoxDestination("");
      setBoxDestLocId(null);
      setBoxNotes("");
      loadMoveData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to create box");
    }
  };

  const handleOpenBoxDetails = async (box: any) => {
    setSelectedBox(box);
    setLoadingBoxItems(true);
    setItemQuery("");
    setSearchResults([]);
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
    try {
      await api.addItemsToBox(selectedBox.id, [itemId]);
      setSuccessMsg("Item packed into box");
      setItemQuery("");
      setSearchResults([]);
      const updated = await api.getBox(selectedBox.id);
      setBoxItems(updated.items || []);
      loadMoveData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to pack item");
    }
  };

  const handleUnpackBox = async (boxId: number) => {
    if (!window.confirm("Unpack this box? All items inside will be assigned to their destination location.")) return;
    try {
      const b = await api.getBox(boxId);
      const itemIds = (b.items || []).map((i: any) => i.id);
      await api.unpackBox(boxId, itemIds, b.destination_location_id || 1);
      setSuccessMsg("Box unpacked successfully!");
      if (selectedBox && selectedBox.id === boxId) {
        setSelectedBox(null);
      }
      loadMoveData();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to unpack box");
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      {/* Page Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <LocalShippingOutlinedIcon color="primary" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Moving House Mode
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Organize packing into numbered boxes, track progress, and unpack room by room
            </Typography>
          </Box>
        </Box>
        {activeMove ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setBoxDialogOpen(true)}>
            New Box
          </Button>
        ) : (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setMoveDialogOpen(true)}>
            Start New Move
          </Button>
        )}
      </Box>

      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Move Error"
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

      {/* Active Move Overview Card */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !activeMove ? (
        <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 1 }}>
          <LocalShippingOutlinedIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            No Active Move
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Start a moving house project to number your boxes, assign destination rooms, and pack items.
          </Typography>
          <Button variant="outlined" onClick={() => setMoveDialogOpen(true)}>
            Start Move
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Card variant="outlined" sx={{ p: 2.5, borderRadius: 1 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {activeMove.name}
                </Typography>
                {activeMove.target_date && (
                  <Typography variant="body2" color="text.secondary">
                    Target Date: {activeMove.target_date}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Chip label={`${boxes.length} Boxes`} color="primary" sx={{ fontWeight: 600 }} />
                <Chip
                  label={activeMove.status === "planning" ? "In Progress" : "Completed"}
                  color="secondary"
                  variant="outlined"
                />
              </Box>
            </Box>
          </Card>

          {/* Boxes Grid */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Boxes ({boxes.length})
          </Typography>

          {boxes.length === 0 ? (
            <Card variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                No boxes added yet. Create your first box to begin packing.
              </Typography>
              <Button variant="outlined" onClick={() => setBoxDialogOpen(true)}>
                Add Box
              </Button>
            </Card>
          ) : (
            <Grid container spacing={2}>
              {boxes.map((box) => (
                <Grid key={box.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column", borderRadius: 1 }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          Box #{box.number}: {box.label}
                        </Typography>
                        <Chip
                          label={box.status}
                          size="small"
                          color={box.status === "packed" ? "success" : box.status === "unpacked" ? "default" : "primary"}
                          sx={{ textTransform: "capitalize", fontWeight: 600 }}
                        />
                      </Box>

                      {box.destination && (
                        <Typography variant="body2" color="text.secondary">
                          Destination: <strong>{box.destination}</strong>
                        </Typography>
                      )}

                      {box.notes && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {box.notes}
                        </Typography>
                      )}
                    </CardContent>

                    <Divider />

                    <CardActions sx={{ justifyContent: "space-between", px: 2, py: 1 }}>
                      <Button size="small" onClick={() => handleOpenBoxDetails(box)}>
                        Contents & Pack
                      </Button>
                      {box.status !== "unpacked" && (
                        <Button
                          size="small"
                          color="secondary"
                          startIcon={<UnarchiveOutlinedIcon />}
                          onClick={() => handleUnpackBox(box.id)}
                        >
                          Unpack
                        </Button>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Start Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Start Moving House Project</DialogTitle>
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
          <Button variant="contained" onClick={handleCreateMove}>
            Start Move
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Box Dialog */}
      <Dialog open={boxDialogOpen} onClose={() => setBoxDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Add New Box</DialogTitle>
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
            placeholder="e.g. New Kitchen, Attic Storage"
            value={boxDestination}
            onChange={(e) => setBoxDestination(e.target.value)}
            fullWidth
          />
          <LocationPicker
            value={boxDestLocId}
            onChange={(id) => setBoxDestLocId(id)}
            label="Target Inventory Location (Optional)"
          />
          <TextField
            label="Notes (Optional)"
            placeholder="e.g. Fragile glassware, keep top side up"
            value={boxNotes}
            onChange={(e) => setBoxNotes(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBoxDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateBox}>
            Create Box
          </Button>
        </DialogActions>
      </Dialog>

      {/* Box Contents & Packing Modal */}
      <Dialog open={Boolean(selectedBox)} onClose={() => setSelectedBox(null)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Box #{selectedBox?.number}: {selectedBox?.label}
        </DialogTitle>
        <DialogContent sx={{ pt: "20px !important", display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Item Search to Pack */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Pack an Item into this Box:
            </Typography>
            <TextField
              fullWidth
              placeholder="Search active item by name..."
              value={itemQuery}
              onChange={(e) => handleSearchItems(e.target.value)}
              size="small"
            />
            {searchResults.length > 0 && (
              <List sx={{ mt: 1, maxHeight: 150, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                {searchResults.map((r, i) => (
                  <ListItem
                    key={i}
                    secondaryAction={
                      <Button size="small" variant="contained" onClick={() => handlePackItem(r.id)}>
                        Pack
                      </Button>
                    }
                  >
                    <ListItemText primary={r.title} secondary={r.subtitle} />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          <Divider />

          {/* Current Box Items */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Items in this Box ({boxItems.length}):
            </Typography>
            {loadingBoxItems ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : boxItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                This box is currently empty.
              </Typography>
            ) : (
              <List disablePadding>
                {boxItems.map((it) => (
                  <ListItem
                    key={it.id}
                    sx={{
                      mb: 0.5,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      px: 2,
                    }}
                  >
                    <Inventory2OutlinedIcon color="primary" sx={{ mr: 1.5 }} />
                    <ListItemText
                      primary={it.name}
                      secondary={it.category_name || "Uncategorized"}
                    />
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
    </Box>
  );
};