import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Fade,
  Grow,
  Snackbar,
  Stack,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridPaginationModel,
  GridRowSelectionModel,
  GridSortModel,
} from "@mui/x-data-grid";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
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
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { useUndo, useOnUndoRefresh } from "../../components/shared/UndoContext";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { useAuth } from "../../auth/useAuth";
import { hasPermission } from "../../auth/permissions";
import { CoverThumb } from "../photos/CoverThumb";
import { ItemDetailDialog } from "./ItemDetailDialog";
import { ItemFormDialog } from "./ItemFormDialog";
import { ItemMoveDialog } from "./ItemMoveDialog";
import { BulkMoveDialog } from "./BulkMoveDialog";
import { BulkSelectionBar } from "./BulkSelectionBar";
import {
  BulkBoxDialog,
  BulkExpiryDialog,
  BulkRetireDialog,
  BulkTagsDialog,
  BulkTakenOutDialog,
} from "./BulkActionsDialogs";
import { resolveDataGridSelectionIds, runBulkItemsRequest } from "./selectionUtils";
import { BulkAddDialog, type BulkAddTab } from "./BulkAddDialog";
import { ItemCard } from "./ItemCard";
import { ItemsFilterToolbar } from "./ItemsFilterToolbar";
import { TakenOutDialog, type TakenOutTarget } from "./TakenOutDialog";
import {
  formatTakenOutStatusLabel,
  getItemQuantity,
  getItemTakenOutQuantity,
} from "./quantityUtils";
import { formatItemCode } from "./itemCodeUtils";
import { getCategoryBadgeSx } from "../../components/shared/categoryColors";
import { api } from "../../api/client";
import { Item } from "./types";
import { Category } from "../forms/types";

export const ItemsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [searchParams] = useSearchParams();
  const { currentProfile } = useAuth();
  const canBulkWrite = hasPermission(currentProfile, "bulk:write");
  const { showUndo } = useUndo();

  // View mode: 'table', 'card', or 'room' (grouped by higher Room), remembered in localStorage
  const [viewMode, setViewMode] = useState<"table" | "card" | "room">(() => {
    const saved = localStorage.getItem("hi_items_view") as "table" | "card" | "room" | null;
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
  const [bulkTagsOpen, setBulkTagsOpen] = useState(false);
  const [bulkTakenOutOpen, setBulkTakenOutOpen] = useState(false);
  const [bulkExpiryOpen, setBulkExpiryOpen] = useState(false);
  const [bulkBoxOpen, setBulkBoxOpen] = useState(false);
  const [bulkRetireOpen, setBulkRetireOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [bulkErrorMsg, setBulkErrorMsg] = useState<string | null>(null);
  const [bulkNoticeMsg, setBulkNoticeMsg] = useState<string | null>(null);

  const rowSelectionModel = useMemo<GridRowSelectionModel>(
    () => ({ type: "include", ids: new Set(selectedItemIds) }),
    [selectedItemIds]
  );

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
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [movingItem, setMovingItem] = useState<Item | null>(null);
  const [takenOutTarget, setTakenOutTarget] = useState<TakenOutTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);

  const handleViewModeChange = (_: any, newMode: "table" | "card" | "room" | null) => {
    if (newMode) {
      setViewMode(newMode);
      if (newMode !== "table") {
        setSelectedItemIds([]);
      }
      localStorage.setItem("hi_items_view", newMode);
    }
  };

  const itemsGroupedByRoom = useMemo(() => {
    const groups = new Map<
      string,
      { roomId: number | null; roomName: string; isUnassigned: boolean; items: Item[] }
    >();
    for (const item of items) {
      const roomId = item.room_id ?? null;
      const roomName = item.room_name
        ? item.room_name
        : item.location_name
          ? "Other Storage Places"
          : "No Room Assigned";
      const key = roomId ? `room:${roomId}` : `other:${roomName}`;
      if (!groups.has(key)) {
        groups.set(key, {
          roomId,
          roomName,
          isUnassigned: !item.location_id,
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [items]);

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
        const visibleIds = new Set<number>(res.items.map((r: Item) => Number(r.id)));
        setSelectedItemIds((prev) => {
          const next = prev.filter((id) => visibleIds.has(id));
          return next.length === prev.length ? prev : next;
        });
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
    const prevTaken = Boolean(item.taken_out);
    const prevQty = getItemTakenOutQuantity(item);
    const prevBy = item.taken_by ?? null;
    const prevDue = item.taken_due ?? null;
    const prevProfileId = item.taken_by_profile_id ?? null;
    const prevContactId = item.taken_by_contact_id ?? null;
    try {
      await api.toggleTaken(item.id, !prevTaken);
      await loadItems();
      showUndo({
        message: !prevTaken
          ? `Marked "${item.name}" as taken out`
          : `Marked "${item.name}" as returned`,
        onUndo: async () => {
          await api.toggleTaken(item.id, {
            taken_out: prevTaken,
            taken_out_quantity: prevQty,
            taken_by: prevBy,
            taken_due: prevDue,
            taken_by_profile_id: prevProfileId,
            taken_by_contact_id: prevContactId,
          });
        },
      });
    } catch (err) {
      console.error(err);
    }
  };

  useOnUndoRefresh(loadItems);

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    const deletedName = deleteTarget.name;
    try {
      await api.deleteItem(deletedId);
      setDeleteTarget(null);
      if (detailItemId === deletedId) setDetailItemId(null);
      await loadItems();
      showUndo({
        message: `Deleted "${deletedName}"`,
        onUndo: async () => {
          await api.restoreItem(deletedId);
        },
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkCompleted = async () => {
    setSelectedItemIds([]);
    await loadItems();
  };

  const handleBulkMarkReturned = async () => {
    if (selectedItemIds.length === 0) return;
    setIsBulkBusy(true);
    try {
      await runBulkItemsRequest({
        ids: selectedItemIds,
        action: "set_taken",
        params: { taken_out: false },
        pastTenseLabel: "Marked returned:",
        showUndo,
        onSuccess: handleBulkCompleted,
      });
    } catch (err: any) {
      setBulkErrorMsg(err?.message || "Failed to mark selected items as returned.");
    } finally {
      setIsBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.length === 0) return;
    setIsBulkBusy(true);
    try {
      const deletedSet = new Set(selectedItemIds);
      await runBulkItemsRequest({
        ids: selectedItemIds,
        action: "delete",
        pastTenseLabel: "Deleted",
        showUndo,
        onSuccess: async () => {
          setBulkDeleteConfirmOpen(false);
          if (detailItemId && deletedSet.has(detailItemId)) {
            setDetailItemId(null);
          }
          await handleBulkCompleted();
        },
      });
    } catch (err: any) {
      setBulkDeleteConfirmOpen(false);
      setBulkErrorMsg(err?.message || "Failed to delete selected items.");
    } finally {
      setIsBulkBusy(false);
    }
  };

  const handleBulkPrintLabels = () => {
    if (selectedItemIds.length === 0) return;
    navigate(`/labels?item_ids=${selectedItemIds.join(",")}`);
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
            {formatItemCode(params.row.id)}
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
              sx={(t) => ({
                ...getCategoryBadgeSx(params.row.category_color, t),
                fontWeight: 600,
              })}
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
            <ToggleButtonGroup
              size="small"
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              aria-label="view mode"
            >
              <ToggleButton value="table" aria-label="table view">
                <Tooltip title="Table view">
                  <Box component="span" sx={{ display: "inline-flex" }}>
                    <ViewListIcon fontSize="small" />
                  </Box>
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="card" aria-label="card view">
                <Tooltip title="Card view">
                  <Box component="span" sx={{ display: "inline-flex" }}>
                    <ViewModuleIcon fontSize="small" />
                  </Box>
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="room" aria-label="group by room">
                <Tooltip title="Group by Room">
                  <Box component="span" sx={{ display: "inline-flex" }}>
                    <MeetingRoomOutlinedIcon fontSize="small" />
                  </Box>
                </Tooltip>
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
        <Fade in appear timeout={225}>
          <Card>
            <BulkSelectionBar
              selectedCount={selectedItemIds.length}
              canWrite={canBulkWrite}
              busy={isBulkBusy}
              onClear={() => setSelectedItemIds([])}
              onMove={() => setBulkMoveOpen(true)}
              onManageTags={() => setBulkTagsOpen(true)}
              onMarkTakenOut={() => setBulkTakenOutOpen(true)}
              onMarkReturned={handleBulkMarkReturned}
              onSetExpiry={() => setBulkExpiryOpen(true)}
              onPackInBox={() => setBulkBoxOpen(true)}
              onRetire={() => setBulkRetireOpen(true)}
              onPrintLabels={handleBulkPrintLabels}
              onDelete={() => setBulkDeleteConfirmOpen(true)}
            />
            <Box sx={{ width: "100%", height: 600 }}>
              <DataGrid
                rows={items}
                columns={columns}
                rowCount={total}
                loading={isLoading}
                pageSizeOptions={[10, 25, 50, 100]}
                paginationModel={paginationModel}
                paginationMode="server"
                onPaginationModelChange={(next) => {
                  setSelectedItemIds([]);
                  setPaginationModel(next);
                }}
                sortModel={sortModel}
                sortingMode="server"
                onSortModelChange={setSortModel}
                checkboxSelection
                rowSelectionModel={rowSelectionModel}
                onRowSelectionModelChange={(newSelection) => {
                  setSelectedItemIds(resolveDataGridSelectionIds(newSelection, items));
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
        </Fade>
      ) : viewMode === "room" ? (
        /* Grouped by Room View */
        <Stack spacing={3}>
          {itemsGroupedByRoom.map((group) => (
            <Box key={`${group.roomId ?? "none"}-${group.roomName}`}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  mb: 1.5,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.5,
                  bgcolor: "action.hover",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                  <MeetingRoomOutlinedIcon
                    fontSize="small"
                    color={group.isUnassigned ? "disabled" : "primary"}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                    {group.roomName}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${group.items.length} ${group.items.length === 1 ? "item" : "items"}`}
                    color={group.roomId ? "primary" : "default"}
                    variant="outlined"
                  />
                </Box>
                {group.roomId && (
                  <Button
                    size="small"
                    onClick={() => navigate(`/locations?selected=${group.roomId}`)}
                  >
                    Open Room
                  </Button>
                )}
              </Box>
              <Grid container spacing={2.5}>
                {group.items.map((item, idx) => (
                  <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                    <Grow in appear timeout={Math.min(180 + idx * 35, 450)}>
                      <Box sx={{ height: "100%" }}>
                        <ItemCard item={item} onClick={(it) => setDetailItemId(it.id)} />
                      </Box>
                    </Grow>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </Stack>
      ) : (
        /* Card View */
        <Grid container spacing={2.5}>
          {items.map((item, idx) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Grow in appear timeout={Math.min(180 + idx * 35, 450)}>
                <Box sx={{ height: "100%" }}>
                  <ItemCard item={item} onClick={(it) => setDetailItemId(it.id)} />
                </Box>
              </Grow>
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
        onMoved={handleBulkCompleted}
      />

      {/* Additional Bulk Action Dialogs */}
      <BulkTagsDialog
        open={bulkTagsOpen}
        itemIds={selectedItemIds}
        onClose={() => setBulkTagsOpen(false)}
        onApplied={handleBulkCompleted}
        showUndo={showUndo}
      />

      <BulkTakenOutDialog
        open={bulkTakenOutOpen}
        itemIds={selectedItemIds}
        onClose={() => setBulkTakenOutOpen(false)}
        onApplied={handleBulkCompleted}
        showUndo={showUndo}
      />

      <BulkExpiryDialog
        open={bulkExpiryOpen}
        itemIds={selectedItemIds}
        onClose={() => setBulkExpiryOpen(false)}
        onApplied={handleBulkCompleted}
        showUndo={showUndo}
      />

      <BulkBoxDialog
        open={bulkBoxOpen}
        itemIds={selectedItemIds}
        onClose={() => setBulkBoxOpen(false)}
        onApplied={handleBulkCompleted}
        showUndo={showUndo}
        onNotice={(msg) => setBulkNoticeMsg(msg)}
      />

      <BulkRetireDialog
        open={bulkRetireOpen}
        itemIds={selectedItemIds}
        onClose={() => setBulkRetireOpen(false)}
        onApplied={handleBulkCompleted}
        showUndo={showUndo}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={`Delete ${selectedItemIds.length} Item(s)`}
        message={`Move ${selectedItemIds.length} selected ${selectedItemIds.length === 1 ? "item" : "items"} to trash? You can undo this for 10 seconds.`}
        confirmLabel="Delete All"
        confirmColor="error"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />

      <AlertDialog
        open={Boolean(bulkErrorMsg)}
        onClose={() => setBulkErrorMsg(null)}
        title="Bulk Action Notice"
        message={bulkErrorMsg}
        severity="warning"
      />

      <Snackbar
        open={Boolean(bulkNoticeMsg)}
        autoHideDuration={4000}
        onClose={() => setBulkNoticeMsg(null)}
        message={bulkNoticeMsg}
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
        onAdded={(_count, message, batchId) => {
          if (batchId) {
            showUndo({
              message: message || "Items added successfully",
              onUndo: async () => {
                await api.undoBatch(batchId);
              },
            });
          }
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
    </Box>
  );
};
