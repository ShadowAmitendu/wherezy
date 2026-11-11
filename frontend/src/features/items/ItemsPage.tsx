import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  IconButton,
  Tooltip,
  Grid,
  Snackbar,
  Alert,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { DataGrid, GridColDef, GridRenderCellParams, GridPaginationModel, GridSortModel } from "@mui/x-data-grid";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import AddIcon from "@mui/icons-material/Add";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import RemoveCircleOutlinedIcon from "@mui/icons-material/RemoveCircleOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
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
import { BulkAddDialog, type BulkAddTab } from "./BulkAddDialog";
import { ItemCard } from "./ItemCard";
import { ItemsFilterToolbar } from "./ItemsFilterToolbar";
import { TakenOutDialog, type TakenOutTarget } from "./TakenOutDialog";
import {
  formatTakenOutStatusLabel,
  getItemQuantity,
  getItemTakenOutQuantity,
} from "./quantityUtils";
import { api } from "../../api/client";
import { Item } from "./types";
import { Category } from "../forms/types";

export const ItemsPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [searchParams] = useSearchParams();

  // View mode: 'table' or 'card', remembered in localStorage; defaults to 'card' on mobile
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    const saved = localStorage.getItem("hi_items_view") as "table" | "card" | null;
    if (saved) return saved;
    return typeof window !== "undefined" && window.innerWidth < 768 ? "card" : "table";
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
  const initialAction = searchParams.get("action");
  const [formDialogOpen, setFormDialogOpen] = useState(initialAction === "new");
  const [bulkAddOpen, setBulkAddOpen] = useState(
    initialAction === "bulk" || initialAction === "import"
  );
  const [bulkAddInitialTab, setBulkAddInitialTab] = useState<BulkAddTab>(
    initialAction === "import" ? "csv" : "list"
  );
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [movingItem, setMovingItem] = useState<Item | null>(null);
  const [takenOutTarget, setTakenOutTarget] = useState<TakenOutTarget | null>(null);
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
    let active = true;
    api
      .getCategories()
      .then((data) => {
        if (active) setCategories(data);
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
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

    Promise.resolve()
      .then(() => {
        if (!active) return null;
        setIsLoading(true);
        return api.getItems(params);
      })
      .then((res) => {
        if (!active || !res) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (active) console.error(err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [paginationModel, sortModel, searchQuery, selectedCategory, selectedLocation, takenOutFilter, expiryFilter]);

  const handleToggleTaken = async (item: Item, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (getItemQuantity(item) > 1) {
      setTakenOutTarget(item);
      return;
    }
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
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono)" }}>
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
      field: "quantity",
      headerName: "Qty",
      width: 115,
      renderCell: (params: GridRenderCellParams) => {
        const qty = getItemQuantity(params.row);
        const out = getItemTakenOutQuantity(params.row);
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, height: "100%" }}>
            <Typography variant="body2" sx={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {out > 0 && qty > 1 ? `${qty - out}/${qty}` : qty}
            </Typography>
            {out > 0 && qty > 1 && (
              <Typography variant="caption" color="secondary.main" sx={{ fontWeight: 600 }}>
                ({out} out)
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: "taken_out",
      headerName: "Status",
      width: 140,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
          <Chip
            icon={params.value ? <RemoveCircleOutlinedIcon /> : <CheckCircleOutlinedIcon />}
            label={formatTakenOutStatusLabel(params.row)}
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
        subtitle="Browse, search, and manage items"
        icon={<Inventory2OutlinedIcon />}
        action={
          <Box sx={{ display: "flex", gap: { xs: 0.75, sm: 1 }, alignItems: "center", flexWrap: "wrap" }}>
            {selectedItemIds.length > 0 && (
              <Button
                variant="outlined"
                size={isMobile ? "small" : "medium"}
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
              variant="outlined"
              size={isMobile ? "small" : "medium"}
              startIcon={<PlaylistAddIcon />}
              onClick={() => {
                setBulkAddInitialTab("list");
                setBulkAddOpen(true);
              }}
            >
              Bulk Add
            </Button>
            <Button
              variant="contained"
              size={isMobile ? "small" : "medium"}
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
      <ItemsFilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedLocation={selectedLocation}
        onLocationChange={setSelectedLocation}
        takenOutFilter={takenOutFilter}
        onTakenOutChange={setTakenOutFilter}
        expiryFilter={expiryFilter}
        onExpiryChange={setExpiryFilter}
      />

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
              <ItemCard item={item} onClick={(it) => setDetailItemId(it.id)} />
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

      {/* Taken Out Quantity Dialog */}
      <TakenOutDialog
        open={Boolean(takenOutTarget)}
        item={takenOutTarget}
        onClose={() => setTakenOutTarget(null)}
        onSaved={loadItems}
      />

      {/* Bulk Add / CSV Import Dialog */}
      <BulkAddDialog
        open={bulkAddOpen}
        initialCategoryId={selectedCategory ? Number(selectedCategory) : null}
        initialLocationId={selectedLocation}
        initialTab={bulkAddInitialTab}
        onClose={() => setBulkAddOpen(false)}
        onAdded={(_count, message) => {
          setBulkSuccessMsg(message || "Items added successfully");
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

      <Snackbar
        open={Boolean(bulkSuccessMsg)}
        autoHideDuration={5000}
        onClose={() => setBulkSuccessMsg(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity="success" onClose={() => setBulkSuccessMsg(null)} variant="filled">
          {bulkSuccessMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};
