import React from "react";
import {
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { LocationPicker } from "../locations/LocationPicker";
import { Category } from "../forms/types";

export interface ItemsFilterToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categories: Category[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedLocation: number | null;
  onLocationChange: (locationId: number | null) => void;
  takenOutFilter: string;
  onTakenOutChange: (status: string) => void;
  expiryFilter: string;
  onExpiryChange: (expiry: string) => void;
}

export const ItemsFilterToolbar: React.FC<ItemsFilterToolbarProps> = ({
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  selectedLocation,
  onLocationChange,
  takenOutFilter,
  onTakenOutChange,
  expiryFilter,
  onExpiryChange,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Card sx={{ mb: { xs: 2, sm: 3 } }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, "&:last-child": { pb: { xs: 1.5, sm: 2 } } }}>
        <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ alignItems: "center" }}>
          {/* Search Query */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              size={isMobile ? "small" : "medium"}
              fullWidth
              label="Search"
              placeholder="Search name, notes, serials..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
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
            <FormControl fullWidth size={isMobile ? "small" : "medium"}>
              <InputLabel shrink id="category-filter-label">
                Category
              </InputLabel>
              <Select
                labelId="category-filter-label"
                id="category-filter-select"
                value={selectedCategory}
                label="Category"
                notched
                displayEmpty
                onChange={(e) => onCategoryChange(e.target.value)}
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
              size={isMobile ? "small" : "medium"}
              value={selectedLocation}
              onChange={onLocationChange}
              label="Room / Location"
              emptyLabel="All Rooms & Locations"
            />
          </Grid>

          {/* Taken Out / Status Filter */}
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <FormControl fullWidth size={isMobile ? "small" : "medium"}>
              <InputLabel shrink id="status-filter-label">
                Status
              </InputLabel>
              <Select
                labelId="status-filter-label"
                id="status-filter-select"
                value={takenOutFilter}
                label="Status"
                notched
                onChange={(e) => onTakenOutChange(e.target.value)}
              >
                <MenuItem value="all">All Items</MenuItem>
                <MenuItem value="in">In Place Only</MenuItem>
                <MenuItem value="out">Taken Out Only</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Expiry Filter */}
          <Grid size={{ xs: 6, sm: 3, md: 2 }}>
            <FormControl fullWidth size={isMobile ? "small" : "medium"}>
              <InputLabel shrink id="expiry-filter-label">
                Expiry
              </InputLabel>
              <Select
                labelId="expiry-filter-label"
                id="expiry-filter-select"
                value={expiryFilter}
                label="Expiry"
                notched
                onChange={(e) => onExpiryChange(e.target.value)}
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
  );
};
