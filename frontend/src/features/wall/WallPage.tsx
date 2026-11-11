import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  CircularProgress,
  Divider,
  Fade,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import AlarmOutlinedIcon from "@mui/icons-material/AlarmOutlined";
import AssignmentReturnOutlinedIcon from "@mui/icons-material/AssignmentReturnOutlined";
import { api, ApiException } from "../../api/client";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatTakenOutStatusLabel, getItemQuantity } from "../items/quantityUtils";

export const WallPage: React.FC = () => {
  useDocumentTitle("Wall Display");
  const navigate = useNavigate();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [failedPolls, setFailedPolls] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Clock ticker
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setCurrentDate(
        now.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Polling data every 60s
  useEffect(() => {
    let active = true;
    const fetchWallData = async () => {
      try {
        const res = await api.getWallData();
        if (!active) return;
        setData(res);
        setFailedPolls(0);
        const now = new Date();
        setLastUpdated(
          now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
        );
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiException && err.status === 401) {
          navigate("/lock", { replace: true });
          return;
        }
        if (err instanceof ApiException && err.status === 403) {
          navigate("/", { replace: true });
          return;
        }
        console.error(err);
        setFailedPolls((prev) => prev + 1);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchWallData();
    const interval = setInterval(() => void fetchWallData(), 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [navigate]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        color: "text.primary",
        p: { xs: 2, sm: 4 },
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {/* Top Banner & Clock */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
            {currentTime}
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
            {currentDate}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {data?.household_name && (
            <Chip label={data.household_name} color="primary" sx={{ fontWeight: 700 }} />
          )}
          <IconButton onClick={toggleFullscreen} color="inherit" size="large">
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
        </Box>
      </Box>

      {/* Connectivity error warning */}
      {failedPolls >= 3 && (
        <Box
          sx={{
            p: 1.5,
            px: 2,
            bgcolor: "warning.main",
            color: "warning.contrastText",
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <WarningAmberOutlinedIcon />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Last updated at {lastUpdated}. Server not reachable right now. Showing cached information.
          </Typography>
        </Box>
      )}

      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress size={48} />
        </Box>
      ) : (
        <Fade in appear timeout={250}>
          <Grid container spacing={3}>
          {/* Overdue Section */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: "100%", borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                  <WarningAmberOutlinedIcon color="error" sx={{ fontSize: 28 }} />
                  <Typography variant="h5" sx={{ fontWeight: 700, color: "error.main" }}>
                    Overdue ({data?.overdue?.length || 0})
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                {(!data?.overdue || data.overdue.length === 0) ? (
                  <Typography variant="body1" color="text.secondary">
                    No overdue items or loans.
                  </Typography>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    {data.overdue.map((item: any, i: number) => (
                      <Card key={i} variant="outlined" sx={{ p: 2, bgcolor: (t) => t.palette.mode === "dark" ? "rgba(244, 143, 177, 0.08)" : "rgba(211, 47, 47, 0.04)", borderColor: "error.main" }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {item.item_name || item.name}
                        </Typography>
                        <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>
                          {item.message || `Due: ${item.due_date}`}
                        </Typography>
                      </Card>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Due Soon Section */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ height: "100%", borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                  <AlarmOutlinedIcon color="warning" sx={{ fontSize: 28 }} />
                  <Typography variant="h5" sx={{ fontWeight: 700, color: "warning.main" }}>
                    Due Soon ({data?.due_soon?.length || 0})
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                {(!data?.due_soon || data.due_soon.length === 0) ? (
                  <Typography variant="body1" color="text.secondary">
                    No upcoming expiries or returns due.
                  </Typography>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    {data.due_soon.map((item: any, i: number) => (
                      <Card key={i} variant="outlined" sx={{ p: 2, bgcolor: (t) => t.palette.mode === "dark" ? "rgba(255, 224, 130, 0.08)" : "rgba(237, 108, 2, 0.04)" }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {item.item_name || item.name}
                        </Typography>
                        <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>
                          {item.message || `Due: ${item.due_date}`}
                        </Typography>
                      </Card>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Currently Taken Out Section */}
          <Grid size={{ xs: 12 }}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                  <AssignmentReturnOutlinedIcon color="primary" sx={{ fontSize: 28 }} />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Currently Out ({data?.taken_out?.length || 0})
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                {(!data?.taken_out || data.taken_out.length === 0) ? (
                  <Typography variant="body1" color="text.secondary">
                    All household tools and items are currently stored away.
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    {data.taken_out.map((it: any, i: number) => (
                      <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                        <Card variant="outlined" sx={{ p: 2, height: "100%" }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 0.5 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {it.name}
                            </Typography>
                            {getItemQuantity(it) > 1 && (
                              <Chip
                                size="small"
                                color="secondary"
                                label={formatTakenOutStatusLabel(it)}
                                sx={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
                              />
                            )}
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            With: <strong>{it.borrower_name || "Someone"}</strong>
                          </Typography>
                          {it.due_date && (
                            <Typography variant="caption" color={it.is_overdue ? "error.main" : "text.secondary"} sx={{ fontWeight: 600, display: "block", mt: 0.5 }}>
                              Due: {it.due_date} {it.is_overdue ? "(OVERDUE)" : ""}
                            </Typography>
                          )}
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        </Fade>
      )}
    </Box>
  );
};