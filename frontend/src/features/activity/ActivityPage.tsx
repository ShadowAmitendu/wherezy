import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  IconButton,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Tooltip,
  Divider,
  Collapse,
} from "@mui/material";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import FilterListIcon from "@mui/icons-material/FilterList";
import RefreshIcon from "@mui/icons-material/Refresh";
import { api, ApiException } from "../../api/client";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";
import { PageHeader } from "../../components/shared/PageHeader";

export const ActivityPage: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revertTargetId, setRevertTargetId] = useState<number | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Filters
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [expandedDiffs, setExpandedDiffs] = useState<Record<number, boolean>>({});

  const loadActivity = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getActivity({
        limit: 50,
        offset: 0,
        entity_type: entityFilter || undefined,
      });
      setEvents(data.events || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.error?.message || "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, [entityFilter]);

  const toggleDiff = (id: number) => {
    setExpandedDiffs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRevert = (id: number) => {
    setRevertTargetId(id);
  };

  const handleConfirmRevert = async () => {
    if (revertTargetId === null) return;
    setIsReverting(true);
    try {
      await api.revertActivity(revertTargetId);
      setRevertTargetId(null);
      setSuccessMsg("Change reverted successfully");
      loadActivity();
    } catch (err: any) {
      setRevertTargetId(null);
      setErrorMsg(err.error?.message || "Cannot revert this change");
    } finally {
      setIsReverting(false);
    }
  };

  const formatTimestamp = (iso: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const canRevert = (action: string) => {
    return ["item_move", "item_taken", "item_returned", "item_edit"].includes(action);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <PageHeader
        title="Activity History"
        subtitle="Audit log of household changes"
        icon={<HistoryOutlinedIcon />}
        action={
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadActivity} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Activity Error"
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

      {/* Filter Bar */}
      <Card variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <FilterListIcon color="action" />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="entity-filter-label">Filter by Entity Type</InputLabel>
            <Select
              labelId="entity-filter-label"
              value={entityFilter}
              label="Filter by Entity Type"
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <MenuItem value="">All Entities</MenuItem>
              <MenuItem value="item">Items</MenuItem>
              <MenuItem value="location">Locations</MenuItem>
              <MenuItem value="category">Categories</MenuItem>
              <MenuItem value="contact">Contacts</MenuItem>
              <MenuItem value="move">Moves & Boxes</MenuItem>
              <MenuItem value="profile">Profiles</MenuItem>
              <MenuItem value="settings">Settings</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Card>

      {/* Activity Timeline List */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : events.length === 0 ? (
        <Card variant="outlined" sx={{ p: 6, textAlign: "center", borderRadius: 1 }}>
          <HistoryOutlinedIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            No activity events recorded yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Changes to items, categories, locations, and loans will show here automatically.
          </Typography>
        </Card>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {events.map((ev) => {
            const isDiffExpanded = Boolean(expandedDiffs[ev.id]);
            const hasDiff = ev.diff && Object.keys(ev.diff).length > 0;

            return (
              <Card key={ev.id} variant="outlined" sx={{ borderRadius: 1 }}>
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Chip
                        label={ev.actor_name || "System"}
                        size="small"
                        color={ev.actor_name ? "primary" : "default"}
                        variant={ev.actor_name ? "filled" : "outlined"}
                        sx={{ fontWeight: 600, height: 22 }}
                      />
                      <Chip
                        label={ev.entity_type}
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: "capitalize", height: 22 }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {ev.summary}
                      </Typography>
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {formatTimestamp(ev.at)}
                    </Typography>
                  </Box>

                  {/* Actions / Diff bar */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5 }}>
                    {hasDiff ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => toggleDiff(ev.id)}
                        endIcon={isDiffExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        sx={{ fontSize: "0.75rem", p: 0 }}
                      >
                        {isDiffExpanded ? "Hide Details" : "View Details / Diff"}
                      </Button>
                    ) : (
                      <Box />
                    )}

                    {canRevert(ev.action) && (
                      <Tooltip title="Revert this change">
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          startIcon={<UndoOutlinedIcon />}
                          onClick={() => handleRevert(ev.id)}
                          sx={{ textTransform: "none", fontSize: "0.75rem", py: 0.25 }}
                        >
                          Revert
                        </Button>
                      </Tooltip>
                    )}
                  </Box>

                  {/* Collapsible Diff JSON */}
                  {hasDiff && (
                    <Collapse in={isDiffExpanded} timeout="auto" unmountOnExit>
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          bgcolor: "action.hover",
                          borderRadius: 1,
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {Object.entries(ev.diff).map(([key, val]: [string, any]) => {
                          const [oldVal, newVal] = Array.isArray(val) ? val : [null, val];
                          return (
                            <Box key={key} sx={{ mb: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: "inherit" }}>
                                {key}:
                              </Typography>{" "}
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{ color: "error.main", textDecoration: "line-through", fontFamily: "inherit", mr: 1 }}
                              >
                                {String(oldVal ?? "none")}
                              </Typography>
                              →{" "}
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{ color: "success.main", fontWeight: 600, fontFamily: "inherit" }}
                              >
                                {String(newVal ?? "none")}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    </Collapse>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      <ConfirmDialog
        open={revertTargetId !== null}
        title="Revert Change"
        message="Are you sure you want to revert this change?"
        confirmLabel="Yes"
        cancelLabel="No"
        confirmColor="warning"
        isLoading={isReverting}
        onConfirm={handleConfirmRevert}
        onCancel={() => setRevertTargetId(null)}
      />
    </Box>
  );
};