import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Button,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import SearchIcon from "@mui/icons-material/Search";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import RemoveCircleOutlinedIcon from "@mui/icons-material/RemoveCircleOutlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { EmptyState } from "../../components/shared/EmptyState";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { UndoSnackbar } from "../../components/shared/UndoSnackbar";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { CoverThumb } from "../photos/CoverThumb";
import { ItemDetailDialog } from "./ItemDetailDialog";
import { ItemFormDialog } from "./ItemFormDialog";
import { ItemMoveDialog } from "./ItemMoveDialog";
import { BulkMoveDialog } from "./BulkMoveDialog";
import { LocationPicker } from "../locations/LocationPicker";
import { api } from "../../api/client";
import { Item } from "./types";
import { Category } from "../forms/types";

export const ItemsPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  // View mode: 'table' or 'card', remembered in localStorage
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    return (localStorage.getItem("hi_items_view") as "table" | "card") || "table";
  });

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get("category_id") || "");
  const [selectedLocation, setSelectedLocation] = useState<number | null>(
    searchParams.get("location_id") ? Number(searchParams.get("location_id")) : null
  );
  const [takenOutFilter, setTakenOutFilter] = useState<string>(searchParams.get("taken_out") || "all");
  const [expiryFilter, setExpiryFilter] = useState<string>(searchParams.get("expiry_status") || "all");

  // Pagination & Sorting
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: "created_at", sort: "desc" },
  ]);

  // Selection & Bulk actions
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  // Dialogs
  const [detailItemId, setDetailItemId] = useState<number | null>(
    searchParams.get("selected") ? Number(searchParams.get("selected")) : null
  );
  const [formDialogOpen, setFormDialogOpen] = useState(searchParams.get("action") === "new");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [movingItem, setMovingItem] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  // Undo Snackbar
  const [undoSnackbarOpen, setUndoSnackbarOpen] = useState(false);
  const [undoItemId, setUndoItemId] = useState<number | null>(null);
  const [undoItemName, setUndoItemName] = useState("");

  const handleViewModeChange = (_: any, newMode: "table" | "card" | null) => {
    if (newMode) {
      setViewMode(newMode);
      localStorage.setItem("hi_items_view", newMode);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const sortField = sortModel[0]?.field || "created_at";
      const sortOrder = sortModel[0]?.sort || "desc";

      const params: Record<string, any> = {
        page: paginationModel.page + 1,
        page_size: paginationModel.pageSize,
        sort: sortField,
        order: sortOrder,
      };

      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (selectedCategory) params.category_id = selectedCategory;
      if (selectedLocation) {
        params.location_id = selectedLocation;
        params.include_sub = true;
      }
      if (takenOutFilter === "out") params.taken_out = true;
      if (takenOutFilter === "in") params.taken_out = false;
      if (expiryFilter !== "all") params.expiry_status = expiryFilter;

      const res = await api.getItems(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [paginationModel, sortModel, searchQuery, selectedCategory, selectedLocation, takenOutFilter, expiryFilter]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleToggleTaken = async (item: Item, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.toggleTaken(item.id, !item.taken_out);
      await loadItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteItem(deleteTarget.id);
      setUndoItemId(deleteTarget.id);
      setUndoItemName(deleteTarget.name);
      setUndoSnackbarOpen(true);
      setDeleteTarget(null);
      if (detailItemId === deleteTarget.id) setDetailItemId(null);
      await loadItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUndoDelete = async () => {
    if (!undoItemId) return;
    try {
      await api.restoreItem(undoItemId);
      setUndoSnackbarOpen(false);
      await loadItems();
    } catch (err) {
      console.error(err);
    }
  };

  // DataGrid Columns definition
  const columns: GridColDef[] = [
    {
      field: "cover",
      headerName: "",
      width: 54,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
          <CoverThumb thumbUrl={params.row.cover_thumb_url} size={36} />
        </Box>
      ),
    },
    {
      field: "name",
      headerName: "Name",
      flex: 1.5,
      minWidth: 160,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {params.value}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            I{params.row.id}
          </Typography>
        </Box>
      ),
    },
    {
      field: "category_name",
      headerName: "Category",
      flex: 1,
      minWidth: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
          {params.value ? (
            <Chip
              label={params.value}
              size="small"
              sx={{
                bgcolor: `${params.row.category_color}20`,
                color: params.row.category_color || "text.primary",
                fontWeight: 600,
              }}
            />
          ) : (
            "—"
          )}
        </Box>
      ),
    },
    {
      field: "location_path",
      headerName: "Location",
      flex: 1.2,
      minWidth: 140,
      valueGetter: (_, row) => row.location_path || "—",
    },
    {
      field: "taken_out",
      headerName: "Status",
      width: 130,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
          <Chip
            icon={params.value ? <RemoveCircleOutlinedIcon /> : <CheckCircleOutlinedIcon />}
            label={params.value ? "Taken Out" : "In Place"}
            size="small"
            color={params.value ? "secondary" : "default"}
            variant={params.value ? "filled" : "outlined"}
            onClick={(e) => handleToggleTaken(params.row, e)}
          />
        </Box>
      ),
    },
    {
      field: "expiry_date",
      headerName: "Expiry",
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
          <ExpiryChip status={params.row.expiry_status} dateStr={params.value} />
        </Box>
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
          <Tooltip title="Move">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setMovingItem(params.row);
              }}
            >
              <DriveFileMoveOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setEditingItem(params.row);
                setFormDialogOpen(true);
              }}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(params.row);
              }}
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Items"
        subtitle="Browse, search, and manage items in your home inventory"
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {selectedItemIds.length > 0 && (
              <Button
                variant="outlined"
                startIcon={<DriveFileMoveOutlinedIcon />}
                onClick={() => setBulkMoveOpen(true)}
              >
                Move Selected ({selectedItemIds.length})
              </Button>
            )}
            <ToggleButtonGroup
              size="small"
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              aria-label="view mode"
            >
              <ToggleButton value="table" aria-label="table view">
                <ViewListIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="card" aria-label="card view">
                <ViewModuleIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingItem(null);
                setFormDialogOpen(true);
              }}
            >
              Add Item
            </Button>
          </Box>
        }
      />

      {/* Filter & Search Toolbar */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Grid container spacing={2} sx={{ alignItems: "center" }}>
            {/* Search Query */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Search name, notes, serials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Grid>

            {/* Category Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <FormControl fullWidth>
                <InputLabel shrink id="category-filter-label">Category</InputLabel>
                <Select
                  labelId="category-filter-label"
                  id="category-filter-select"
                  value={selectedCategory}
                  label="Category"
                  notched
                  displayEmpty
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  renderValue={(selected) => {
                    if (!selected) {
                      return <span style={{ opacity: 0.75 }}>All Categories</span>;
                    }
                    const cat = categories.find((c) => String(c.id) === selected);
                    return cat ? cat.name : selected;
                  }}
                >
                  <MenuItem value="">
                    <em>All Categories</em>
                  </MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Location Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 3 }}>
              <LocationPicker
                value={selectedLocation}
                onChange={(locId) => setSelectedLocation(locId)}
                label="Location"
                emptyLabel="All Locations"
              />
            </Grid>

            {/* Taken Out Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <FormControl fullWidth>
                <InputLabel shrink id="status-filter-label">Status</InputLabel>
                <Select
                  labelId="status-filter-label"
                  id="status-filter-select"
                  value={takenOutFilter}
                  label="Status"
                  notched
                  onChange={(e) => setTakenOutFilter(e.target.value)}
                >
                  <MenuItem value="all">All Items</MenuItem>
                  <MenuItem value="in">In Place Only</MenuItem>
                  <MenuItem value="out">Taken Out Only</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Expiry Filter */}
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <FormControl fullWidth>
                <InputLabel shrink id="expiry-filter-label">Expiry</InputLabel>
                <Select
                  labelId="expiry-filter-label"
                  id="expiry-filter-select"
                  value={expiryFilter}
                  label="Expiry"
                  notched
                  onChange={(e) => setExpiryFilter(e.target.value)}
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="expired">Expired</MenuItem>
                  <MenuItem value="soon">Expiring Soon</MenuItem>
                  <MenuItem value="ok">Valid</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Main View: Table vs Cards */}
      {items.length === 0 && !isLoading ? (
        <EmptyState
          title="No Items Found"
          description="Try adjusting your filters or create a new item."
          actionLabel="Add New Item"
          onAction={() => {
            setEditingItem(null);
            setFormDialogOpen(true);
          }}
        />
      ) : viewMode === "table" ? (
        <Card>
          <Box sx={{ width: "100%", height: 600 }}>
            <DataGrid
              rows={items}
              columns={columns}
              rowCount={total}
              loading={isLoading}
              pageSizeOptions={[10, 25, 50, 100]}
              paginationModel={paginationModel}
              paginationMode="server"
              onPaginationModelChange={setPaginationModel}
              sortModel={sortModel}
              sortingMode="server"
              onSortModelChange={setSortModel}
              checkboxSelection
              onRowSelectionModelChange={(newSelection) => {
                if (newSelection && typeof newSelection === "object" && "ids" in newSelection) {
                  const set = (newSelection as { ids: Set<any> }).ids;
                  setSelectedItemIds(Array.from(set).map(Number));
                } else if (Array.isArray(newSelection)) {
                  setSelectedItemIds((newSelection as any[]).map(Number));
                }
              }}
              onRowClick={(params) => setDetailItemId(params.row.id)}
              disableRowSelectionOnClick
              sx={{
                border: "none",
                "& .MuiDataGrid-row": {
                  cursor: "pointer",
                },
              }}
            />
          </Box>
        </Card>
      ) : (
        /* Card View */
        <Grid container spacing={2.5}>
          {items.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: 4,
                  },
                }}
              >
                <CardActionArea onClick={() => setDetailItemId(item.id)} sx={{ flexGrow: 1 }}>
                  <Box
                    sx={{
                      height: 160,
                      bgcolor: "action.hover",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {item.cover_thumb_url ? (
                      <img
                        src={item.cover_thumb_url}
                        alt={item.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "text.secondary",
                        }}
                      >
                        <CoverThumb size={60} />
                      </Box>
                    )}

                    <Chip
                      label={`I${item.id}`}
                      size="small"
                      sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        bgcolor: "background.paper",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    />

                    {item.taken_out && (
                      <Chip
                        label="Taken Out"
                        size="small"
                        color="secondary"
                        sx={{ position: "absolute", top: 8, right: 8, fontWeight: 600 }}
                      />
                    )}
                  </Box>

                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                      {item.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                      {item.category_name} • {item.location_path || "No location"}
                    </Typography>

                    <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <ExpiryChip status={item.expiry_status} dateStr={item.expiry_date} />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        itemId={detailItemId}
        open={Boolean(detailItemId)}
        onClose={() => setDetailItemId(null)}
        onEdit={(it) => {
          setEditingItem(it);
          setFormDialogOpen(true);
        }}
        onDelete={(it) => setDeleteTarget(it)}
        onMove={(it) => setMovingItem(it)}
        onItemUpdated={loadItems}
      />

      {/* Item Form Dialog (Add / Edit) */}
      <ItemFormDialog
        open={formDialogOpen}
        item={editingItem}
        initialCategoryId={selectedCategory ? Number(selectedCategory) : null}
        initialLocationId={selectedLocation}
        onClose={() => {
          setFormDialogOpen(false);
          setEditingItem(null);
        }}
        onSaved={() => {
          loadItems();
        }}
      />

      {/* Single Move Dialog */}
      <ItemMoveDialog
        open={Boolean(movingItem)}
        item={movingItem}
        onClose={() => setMovingItem(null)}
        onMoved={loadItems}
      />

      {/* Bulk Move Dialog */}
      <BulkMoveDialog
        open={bulkMoveOpen}
        itemIds={selectedItemIds}
        onClose={() => setBulkMoveOpen(false)}
        onMoved={() => {
          setSelectedItemIds([]);
          loadItems();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Item"
        message={`Are you sure you want to delete '${deleteTarget?.name}'? You can undo this for 10 seconds.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 10-Second Undo Snackbar */}
      <UndoSnackbar
        open={undoSnackbarOpen}
        message={`Deleted "${undoItemName}"`}
        onUndo={handleUndoDelete}
        onClose={() => setUndoSnackbarOpen(false)}
      />
    </Box>
  );
};
