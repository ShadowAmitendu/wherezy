import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  IconButton,
  Chip,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api, ApiException } from "../../api/client";
import { AlertDialog } from "../../components/shared/AlertDialog";

export const TrashPage: React.FC = () => {
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [allTrash, setAllTrash] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getTrash();
      setAllTrash(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.error?.message || "Failed to load trash");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const items = allTrash.filter((t) => t.type === "item");
  const locations = allTrash.filter((t) => t.type === "location");
  const categories = allTrash.filter((t) => t.type === "category");

  const currentList = tabIndex === 0 ? items : tabIndex === 1 ? locations : categories;
  const currentType = tabIndex === 0 ? "item" : tabIndex === 1 ? "location" : "category";
  const totalTrashed = allTrash.length;

  const handleRestore = async (type: string, id: number, name: string) => {
    try {
      await api.restoreTrash(type, id);
      setSuccessMsg(`Restored '${name}'`);
      loadTrash();
    } catch (err: any) {
      setErrorMsg(err.error?.message || `Failed to restore ${type}`);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("Permanently empty trash? All deleted items, locations, and categories will be permanently destroyed. This cannot be undone.")) {
      return;
    }
    try {
      await api.emptyTrash();
      setSuccessMsg("Trash emptied permanently");
      loadTrash();
    } catch (err: any) {
      setErrorMsg(err.error?.message || "Failed to empty trash");
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto" }}>
      {/* Page Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <DeleteOutlinedIcon color="error" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Trash & Recycle Bin
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Deleted items, locations, and categories can be restored here within 30 days
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadTrash} disabled={loading}>
            Refresh
          </Button>
          {totalTrashed > 0 && (
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteForeverIcon />}
              onClick={handleEmptyTrash}
              disabled={loading}
            >
              Empty Trash
            </Button>
          )}
        </Box>
      </Box>

      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Trash Action Error"
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

      {/* Tabs */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 1 }}>
        <Tabs
          value={tabIndex}
          onChange={(_, val) => setTabIndex(val)}
          indicatorColor="primary"
          textColor="primary"
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label={`Items (${items.length})`} sx={{ fontWeight: 600 }} />
          <Tab label={`Locations (${locations.length})`} sx={{ fontWeight: 600 }} />
          <Tab label={`Categories (${categories.length})`} sx={{ fontWeight: 600 }} />
        </Tabs>
      </Card>

      {/* Table Content */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : currentList.length === 0 ? (
        <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Trash is Empty
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No deleted {tabIndex === 0 ? "items" : tabIndex === 1 ? "locations" : "categories"} found in the recycle bin.
          </Typography>
        </Card>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
          <Table>
            <TableHead sx={{ bgcolor: "action.hover" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Deleted At</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Deleted By</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Restore</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {currentList.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {entry.name}
                    </Typography>
                    {entry.kind && (
                      <Typography variant="caption" color="text.secondary">
                        Type: {entry.kind}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {entry.deleted_at ? entry.deleted_at.substring(0, 19).replace("T", " ") : "N/A"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={entry.deleted_by_name || "Household"}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={`Restore ${entry.name}`}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<RestoreFromTrashIcon />}
                        onClick={() => handleRestore(currentType, entry.id, entry.name)}
                      >
                        Restore
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};