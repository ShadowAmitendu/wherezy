import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Chip,
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { AlertDialog } from "../../components/shared/AlertDialog";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { api } from "../../api/client";
import { LocationPicker } from "../locations/LocationPicker";

export const InboxPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [defaultLocationId, setDefaultLocationId] = useState<number | null>(null);

  // Sort modal state
  const [sortingItem, setSortingItem] = useState<any | null>(null);
  const [sortName, setSortName] = useState("");
  const [sortCatId, setSortCatId] = useState<number | "">("");
  const [sortLocId, setSortLocId] = useState<number | null>(null);
  const [sortNotes, setSortNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [items, cats] = await Promise.all([
        api.getInboxItems(),
        api.getCategories(),
      ]);
      setInboxItems(items);
      setCategories(cats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCaptureClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
      await api.quickCapture(files, undefined, defaultLocationId);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenSort = (item: any) => {
    setSortingItem(item);
    setSortName(item.name.startsWith("Untitled") ? "" : item.name);
    setSortCatId(categories[0]?.id || "");
    setSortLocId(item.location_id || defaultLocationId);
    setSortNotes("");
    setErrorMsg(null);
  };

  const handleSaveSort = async () => {
    if (!sortingItem || !sortCatId || !sortName.trim()) {
      setErrorMsg("Please provide an item name and category.");
      return;
    }

    try {
      await api.sortInboxItem(sortingItem.id, {
        name: sortName.trim(),
        category_id: Number(sortCatId),
        location_id: sortLocId,
        notes: sortNotes.trim() || undefined,
        values: {},
      });
      setSortingItem(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to sort item");
    }
  };

  const handleDiscard = async (itemId: number) => {
    try {
      await api.deleteInboxItem(itemId);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      {/* Hidden native camera capture input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <MoveToInboxIcon color="primary" sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Quick Capture Inbox
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Snap photos instantly. Assign names, categories, and storage locations when you are ready.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <PhotoCameraIcon />}
            onClick={handleCaptureClick}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Snap / Upload Photo"}
          </Button>
        </Box>
      </Box>

      {/* Sticky location option */}
      <Card sx={{ p: 2, mb: 3, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          I&apos;m currently unpacking at:
        </Typography>
        <Box sx={{ minWidth: 260 }}>
          <LocationPicker
            value={defaultLocationId}
            onChange={(loc) => setDefaultLocationId(loc)}
            label="Default Capture Location"
          />
        </Box>
      </Card>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : inboxItems.length === 0 ? (
        <Card sx={{ p: 6, textAlign: "center" }}>
          <CheckIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
          <Typography variant="h6">Inbox is Clear</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Tap &quot;Snap / Upload Photo&quot; above to capture items straight into this inbox.
          </Typography>
          <Button variant="outlined" startIcon={<PhotoCameraIcon />} onClick={handleCaptureClick}>
            Capture First Item
          </Button>
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          {inboxItems.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {item.photos && item.photos.length > 0 ? (
                  <CardMedia
                    component="img"
                    height="180"
                    image={item.photos[0].thumb_url}
                    alt={item.name}
                    sx={{ objectFit: "cover", bgcolor: "black" }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: 180,
                      bgcolor: "action.hover",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <PhotoCameraIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                  </Box>
                )}
                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    Captured: {item.captured_at ? item.captured_at.substring(0, 16).replace("T", " ") : "Recently"}
                  </Typography>
                  {item.location_name && (
                    <Chip label={item.location_name} size="small" sx={{ mt: 1, height: 20, fontSize: "0.7rem" }} />
                  )}
                </CardContent>
                <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 1.5 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    onClick={() => handleOpenSort(item)}
                  >
                    Sort Item
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlinedIcon />}
                    onClick={() => handleDiscard(item.id)}
                  >
                    Discard
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Sort Item Dialog */}
      <Dialog open={Boolean(sortingItem)} onClose={() => setSortingItem(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Sort Item into Inventory</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 3 }}>
          <AlertDialog
            open={Boolean(errorMsg)}
            onClose={() => setErrorMsg(null)}
            title="Sort Error"
            message={errorMsg}
            severity="error"
          />

          <Box sx={{ pt: 1, display: "flex", flexDirection: "column", gap: 2.5 }}>
            <TextField
              label="Item Name"
              placeholder="e.g. Philips Steam Iron"
              value={sortName}
              onChange={(e) => setSortName(e.target.value)}
              fullWidth
              required
              autoFocus
            />

            <FormControl fullWidth required>
              <InputLabel id="sort-category-label">Category</InputLabel>
              <Select
                labelId="sort-category-label"
                value={sortCatId}
                label="Category"
                onChange={(e) => setSortCatId(e.target.value as number)}
              >
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <LocationPicker
              value={sortLocId}
              onChange={(loc) => setSortLocId(loc)}
              label="Storage Location"
            />

            <TextField
              label="Notes"
              value={sortNotes}
              onChange={(e) => setSortNotes(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSortingItem(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSort}>
            Save to Inventory
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
