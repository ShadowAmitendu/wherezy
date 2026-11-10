import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SnoozeOutlinedIcon from "@mui/icons-material/SnoozeOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { api } from "../../api/client";

export const RemindersPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("all");
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [snoozeTarget, setSnoozeTarget] = useState<any | null>(null);
  const [snoozeAnchor, setSnoozeAnchor] = useState<null | HTMLElement>(null);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const data = await api.getReminders();
      setReminders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, []);

  const handleSnooze = async (days: number) => {
    if (!snoozeTarget) return;
    try {
      await api.snoozeReminder({
        source_type: snoozeTarget.source_type,
        item_id: snoozeTarget.item_id,
        field_key: snoozeTarget.field_key,
        due_date: snoozeTarget.due_date,
        snooze_days: days,
      });
      setSnoozeAnchor(null);
      setSnoozeTarget(null);
      loadReminders();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDismiss = async (rem: any) => {
    try {
      await api.dismissReminder({
        source_type: rem.source_type,
        item_id: rem.item_id,
        field_key: rem.field_key,
        due_date: rem.due_date,
      });
      loadReminders();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredReminders = reminders.filter((r) => {
    if (tab === "overdue") return r.status === "overdue";
    if (tab === "due_soon") return r.status === "due_soon";
    if (tab === "snoozed") return r.status === "snoozed";
    if (tab === "dismissed") return r.status === "dismissed";
    return r.status === "overdue" || r.status === "due_soon";
  });

  const overdueCount = reminders.filter((r) => r.status === "overdue").length;
  const dueSoonCount = reminders.filter((r) => r.status === "due_soon").length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
        <NotificationsActiveOutlinedIcon color="primary" sx={{ fontSize: 32 }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Reminder Centre
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Automatic tracking for expiry dates, warranties, service intervals, and borrowed loans.
          </Typography>
        </Box>
      </Box>

      {overdueCount > 0 && (
        <Box
          sx={{
            mb: 3,
            p: 1.5,
            px: 2,
            bgcolor: "error.main",
            color: "error.contrastText",
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <WarningAmberOutlinedIcon />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            You have {overdueCount} overdue item{overdueCount > 1 ? "s" : ""} requiring attention.
          </Typography>
        </Box>
      )}

      <Tabs value={tab} onChange={(_, val) => setTab(val)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab label={`Active (${overdueCount + dueSoonCount})`} value="all" />
        <Tab label={`Overdue (${overdueCount})`} value="overdue" />
        <Tab label={`Due Soon (${dueSoonCount})`} value="due_soon" />
        <Tab label="Snoozed" value="snoozed" />
        <Tab label="Dismissed" value="dismissed" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : filteredReminders.length === 0 ? (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <CheckCircleOutlinedIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6">All Clear</Typography>
          <Typography variant="body2" color="text.secondary">
            No reminders found in this category.
          </Typography>
        </Card>
      ) : (
        <Card>
          <List disablePadding>
            {filteredReminders.map((r, idx) => (
              <ListItem
                key={r.id || idx}
                divider={idx < filteredReminders.length - 1}
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  py: 1.5,
                  gap: 1,
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {r.status === "overdue" ? (
                    <WarningAmberOutlinedIcon color="error" />
                  ) : (
                    <ScheduleOutlinedIcon color="warning" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {r.item_name}
                      </Typography>
                      <Chip
                        label={r.status.replace("_", " ").toUpperCase()}
                        color={r.status === "overdue" ? "error" : "warning"}
                        size="small"
                        sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
                      />
                      <Chip
                        label={r.source_type}
                        variant="outlined"
                        size="small"
                        sx={{ height: 20, fontSize: "0.65rem", textTransform: "capitalize" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      {r.source_type === "loan" && r.borrower_name
                        ? `Borrowed by ${r.borrower_name} • Due ${r.due_date}`
                        : r.field_label
                        ? `${r.field_label}: due ${r.due_date}`
                        : `Expires on ${r.due_date}`}
                    </Typography>
                  }
                />

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => navigate(`/items?selected=${r.item_id}`)}
                  >
                    Open
                  </Button>

                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SnoozeOutlinedIcon />}
                    onClick={(e) => {
                      setSnoozeTarget(r);
                      setSnoozeAnchor(e.currentTarget);
                    }}
                  >
                    Snooze
                  </Button>

                  <Button size="small" color="inherit" onClick={() => handleDismiss(r)}>
                    Dismiss
                  </Button>
                </Box>
              </ListItem>
            ))}
          </List>
        </Card>
      )}

      {/* Snooze Menu */}
      <Menu
        anchorEl={snoozeAnchor}
        open={Boolean(snoozeAnchor)}
        onClose={() => setSnoozeAnchor(null)}
      >
        <MenuItem onClick={() => handleSnooze(1)}>Snooze for 1 Day</MenuItem>
        <MenuItem onClick={() => handleSnooze(7)}>Snooze for 1 Week</MenuItem>
        <MenuItem onClick={() => handleSnooze(30)}>Snooze for 1 Month</MenuItem>
      </Menu>
    </Box>
  );
};
