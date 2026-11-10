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
import { PageHeader } from "../../components/shared/PageHeader";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { CoverThumb } from "../photos/CoverThumb";
import { renderMuiIcon } from "../../components/shared/IconPicker";
import { api } from "../../api/client";

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
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {/* Total Items */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: "6px solid #1976d2",
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/items")}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Total Items
                  </Typography>
                  <Inventory2OutlinedIcon color="primary" />
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1 }}>
                  {data?.total_items || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
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
              borderLeft: "6px solid #9c27b0",
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/items?taken_out=out")}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Taken Out
                  </Typography>
                  <RemoveCircleOutlinedIcon color="secondary" />
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1 }}>
                  {data?.taken_out_count || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  currently borrowed or in use
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Expiring Soon */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: "6px solid #f57c00",
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/expiry?filter=soon")}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Expiring Soon
                  </Typography>
                  <WarningAmberIcon sx={{ color: "#f57c00" }} />
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, color: "#f57c00" }}>
                  {data?.expiring_soon_count || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  within warning window
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Expired */}
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            sx={{
              borderLeft: "6px solid #e53935",
              transition: "transform 0.15s",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            <CardActionArea onClick={() => navigate("/expiry?filter=expired")}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Expired
                  </Typography>
                  <ErrorOutlineIcon color="error" />
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 800, mt: 1, color: "#e53935" }}>
                  {data?.expired_count || 0}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  action needed
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>

      {/* Categories Grid */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Categories
          </Typography>
          <Button size="small" onClick={() => navigate("/categories")}>
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
          <Grid container spacing={2}>
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
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: 2,
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
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                          {cat.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
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
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Attention Needed (Expiry)
                </Typography>
                <Button size="small" onClick={() => navigate("/expiry")}>
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
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Recently Added
                </Typography>
                <Button size="small" onClick={() => navigate("/items")}>
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
