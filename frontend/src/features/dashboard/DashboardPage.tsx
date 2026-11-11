import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Grid,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import RemoveCircleOutlinedIcon from "@mui/icons-material/RemoveCircleOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import AddIcon from "@mui/icons-material/Add";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { CoverThumb } from "../photos/CoverThumb";
import { renderMuiIcon } from "../../components/shared/IconPicker";
import { api } from "../../api/client";

const sectionTitleSx = {
  fontWeight: 700,
  fontSize: { xs: "0.9rem", sm: "1.1rem", md: "1.25rem" },
  lineHeight: 1.3,
  minWidth: 0,
} as const;

const sectionActionBtnSx = {
  whiteSpace: "nowrap",
  flexShrink: 0,
  minWidth: "auto",
  px: { xs: 0.75, sm: 1.25 },
  fontSize: { xs: "0.7rem", sm: "0.8125rem" },
} as const;

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (!data && !isLoading) return null;

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle="Household inventory summary, items out of place, and upcoming expiries"
        icon={<DashboardOutlinedIcon />}
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/items?action=new")}
          >
            Add Item
          </Button>
        }
      />

      {/* Top Metric Cards */}
      <Grid container spacing={{ xs: 1.5, sm: 2, md: 2.5 }} sx={{ mb: { xs: 2.5, sm: 4 } }}>
        {/* Total Items */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: { xs: "4px solid #1976d2", sm: "6px solid #1976d2" },
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/items")}>
              <CardContent sx={{ p: { xs: 1.25, sm: 2, md: 2.5 }, "&:last-child": { pb: { xs: 1.25, sm: 2, md: 2.5 } } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.825rem", md: "0.875rem" },
                    }}
                    noWrap
                  >
                    Total Items
                  </Typography>
                  <Inventory2OutlinedIcon
                    color="primary"
                    sx={{ fontSize: { xs: 18, sm: 22, md: 24 }, flexShrink: 0 }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    mt: { xs: 0.25, sm: 0.75, md: 1 },
                    mb: { xs: 0.25, sm: 0.5 },
                    fontSize: { xs: "1.5rem", sm: "2rem", md: "2.75rem" },
                    lineHeight: 1.1,
                  }}
                >
                  {data?.total_items || 0}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: "0.65rem", sm: "0.725rem", md: "0.75rem" },
                    display: "block",
                  }}
                  noWrap
                >
                  across {data?.category_counts?.length || 0} categories
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Taken Out */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: { xs: "4px solid #9c27b0", sm: "6px solid #9c27b0" },
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/items?taken_out=out")}>
              <CardContent sx={{ p: { xs: 1.25, sm: 2, md: 2.5 }, "&:last-child": { pb: { xs: 1.25, sm: 2, md: 2.5 } } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.825rem", md: "0.875rem" },
                    }}
                    noWrap
                  >
                    Taken Out
                  </Typography>
                  <RemoveCircleOutlinedIcon
                    color="secondary"
                    sx={{ fontSize: { xs: 18, sm: 22, md: 24 }, flexShrink: 0 }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    mt: { xs: 0.25, sm: 0.75, md: 1 },
                    mb: { xs: 0.25, sm: 0.5 },
                    fontSize: { xs: "1.5rem", sm: "2rem", md: "2.75rem" },
                    lineHeight: 1.1,
                  }}
                >
                  {data?.taken_out_count || 0}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: "0.65rem", sm: "0.725rem", md: "0.75rem" },
                    display: "block",
                  }}
                  noWrap
                >
                  currently in use
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Expiring Soon */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: { xs: "4px solid #f57c00", sm: "6px solid #f57c00" },
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/expiry?filter=soon")}>
              <CardContent sx={{ p: { xs: 1.25, sm: 2, md: 2.5 }, "&:last-child": { pb: { xs: 1.25, sm: 2, md: 2.5 } } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.825rem", md: "0.875rem" },
                    }}
                    noWrap
                  >
                    Expiring Soon
                  </Typography>
                  <WarningAmberIcon
                    sx={{
                      color: "#f57c00",
                      fontSize: { xs: 18, sm: 22, md: 24 },
                      flexShrink: 0,
                    }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    mt: { xs: 0.25, sm: 0.75, md: 1 },
                    mb: { xs: 0.25, sm: 0.5 },
                    fontSize: { xs: "1.5rem", sm: "2rem", md: "2.75rem" },
                    lineHeight: 1.1,
                    color: "#f57c00",
                  }}
                >
                  {data?.expiring_soon_count || 0}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: "0.65rem", sm: "0.725rem", md: "0.75rem" },
                    display: "block",
                  }}
                  noWrap
                >
                  warning window
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Expired */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: { xs: "4px solid #e53935", sm: "6px solid #e53935" },
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/expiry?filter=expired")}>
              <CardContent sx={{ p: { xs: 1.25, sm: 2, md: 2.5 }, "&:last-child": { pb: { xs: 1.25, sm: 2, md: 2.5 } } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: "0.75rem", sm: "0.825rem", md: "0.875rem" },
                    }}
                    noWrap
                  >
                    Expired
                  </Typography>
                  <ErrorOutlineIcon
                    color="error"
                    sx={{ fontSize: { xs: 18, sm: 22, md: 24 }, flexShrink: 0 }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    mt: { xs: 0.25, sm: 0.75, md: 1 },
                    mb: { xs: 0.25, sm: 0.5 },
                    fontSize: { xs: "1.5rem", sm: "2rem", md: "2.75rem" },
                    lineHeight: 1.1,
                    color: "#e53935",
                  }}
                >
                  {data?.expired_count || 0}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: { xs: "0.65rem", sm: "0.725rem", md: "0.75rem" },
                    display: "block",
                  }}
                  noWrap
                >
                  action needed
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>

      {/* Categories Grid */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
          <Typography variant="h6" noWrap sx={sectionTitleSx}>
            Categories
          </Typography>
          <Button size="small" onClick={() => navigate("/categories")} sx={sectionActionBtnSx}>
            Manage Categories
          </Button>
        </Box>

        {data?.category_counts?.length === 0 ? (
          <Card sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Get started quickly by picking a starter template:
            </Typography>
            <Button
              variant="contained"
              startIcon={<AutoFixHighIcon />}
              onClick={() => navigate("/categories")}
            >
              Start from a Template
            </Button>
          </Card>
        ) : (
          <Grid container spacing={{ xs: 1.25, sm: 2 }}>
            {data?.category_counts?.map((cat: any) => (
              <Grid key={cat.id} size={{ xs: 6, sm: 4, md: 3 }}>
                <Card
                  variant="outlined"
                  sx={{
                    transition: "border-color 0.15s",
                    "&:hover": { borderColor: cat.color },
                  }}
                >
                  <CardActionArea onClick={() => navigate(`/items?category_id=${cat.id}`)}>
                    <CardContent
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: { xs: 1, sm: 1.5 },
                        p: { xs: 1.25, sm: 1.75, md: 2 },
                        "&:last-child": { pb: { xs: 1.25, sm: 1.75, md: 2 } },
                      }}
                    >
                      <Box
                        sx={{
                          width: { xs: 30, sm: 38 },
                          height: { xs: 30, sm: 38 },
                          minWidth: { xs: 30, sm: 38 },
                          borderRadius: 1.5,
                          bgcolor: `${cat.color}20`,
                          color: cat.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {renderMuiIcon(cat.icon, "small")}
                      </Box>
                      <Box sx={{ overflow: "hidden" }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            fontSize: { xs: "0.75rem", sm: "0.875rem" },
                          }}
                          noWrap
                        >
                          {cat.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            fontSize: { xs: "0.65rem", sm: "0.75rem" },
                            display: "block",
                          }}
                          noWrap
                        >
                          {cat.count} items
                        </Typography>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Two-Column: Expiring Items & Recent Items */}
      <Grid container spacing={3}>
        {/* Expiring Soon / Expired List */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ px: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
                <Typography variant="h6" noWrap sx={sectionTitleSx}>
                  Attention Needed (Expiry)
                </Typography>
                <Button size="small" onClick={() => navigate("/expiry")} sx={sectionActionBtnSx}>
                  View All
                </Button>
              </Box>

              {data?.expiring_items?.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  No items expiring soon or expired. Everything is in order!
                </Typography>
              ) : (
                <List disablePadding>
                  {data?.expiring_items?.map((it: any) => (
                    <ListItem
                      key={it.id}
                      divider
                      sx={{
                        px: 1,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                      onClick={() => navigate(`/items?selected=${it.id}`)}
                    >
                      <ListItemIcon sx={{ minWidth: 44 }}>
                        <CoverThumb thumbUrl={it.cover_thumb_url} size={36} />
                      </ListItemIcon>
                      <ListItemText
                        primary={it.name}
                        secondary={`${it.category_name || "—"} • ${it.location_path || "No location"}`}
                      />
                      <ExpiryChip status={it.expiry_status} dateStr={it.expiry_date} />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recently Added Items */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ px: { xs: 1.5, sm: 2 } }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 2 }}>
                <Typography variant="h6" noWrap sx={sectionTitleSx}>
                  Recently Added
                </Typography>
                <Button size="small" onClick={() => navigate("/items")} sx={sectionActionBtnSx}>
                  Browse All
                </Button>
              </Box>

              {data?.recent_items?.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  No items in inventory yet.
                </Typography>
              ) : (
                <List disablePadding>
                  {data?.recent_items?.map((it: any) => (
                    <ListItem
                      key={it.id}
                      divider
                      sx={{
                        px: 1,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                      onClick={() => navigate(`/items?selected=${it.id}`)}
                    >
                      <ListItemIcon sx={{ minWidth: 44 }}>
                        <CoverThumb thumbUrl={it.cover_thumb_url} size={36} />
                      </ListItemIcon>
                      <ListItemText
                        primary={it.name}
                        secondary={`${it.category_name || "—"}${it.location_path ? ` • ${it.location_path}` : ""}`}
                      />
                      {it.taken_out && (
                        <Chip label="Out" size="small" color="secondary" variant="outlined" />
                      )}
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
