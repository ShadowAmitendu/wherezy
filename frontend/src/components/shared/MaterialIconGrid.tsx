import React, { useMemo, useState, useSyncExternalStore } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { LazyMaterialIcon } from "./LazyMaterialIcon";
import { renderMaterialIconShape } from "./materialIconRenderer";
import {
  MaterialIconShape,
  formatMaterialIconLabel,
  getAllMaterialIconEntries,
  getCachedMaterialIconEntry,
  getMaterialIconCatalogSnapshot,
  loadMaterialIconCatalog,
  normalizeMaterialIconKey,
  searchMaterialIcons,
  subscribeMaterialIconCatalog,
} from "./materialIconCatalog";

const PAGE_SIZE = 96;
const SEARCH_RESULT_LIMIT = 240;

export interface MaterialIconGridItem {
  name: string;
  label: string;
}

export interface MaterialIconGridProps {
  curatedItems: MaterialIconGridItem[];
  selectedIcon?: string | null;
  onSelect: (iconName: string) => void;
  renderCuratedIcon: (name: string) => React.ReactNode;
  fallbackType: "category" | "person";
  variant?: "labeled" | "compact";
  maxHeight?: number | string | Record<string, number | string>;
  searchPlaceholder?: string;
}

interface UnifiedIconTile {
  name: string;
  label: string;
  key: string;
  shape?: MaterialIconShape;
}

function filterCuratedItems(
  items: MaterialIconGridItem[],
  query: string,
): UnifiedIconTile[] {
  const trimmed = query.trim().toLowerCase();
  const mapped = items.map((item) => ({
    name: item.name,
    label: item.label,
    key: normalizeMaterialIconKey(item.name),
  }));
  if (!trimmed) return mapped;

  const tokens = trimmed.split(/[\s_-]+/).filter(Boolean);
  return mapped.filter((item) => {
    const labelLower = item.label.toLowerCase();
    return tokens.every(
      (token) => labelLower.includes(token) || item.key.includes(token),
    );
  });
}

export const MaterialIconGrid: React.FC<MaterialIconGridProps> = ({
  curatedItems,
  selectedIcon,
  onSelect,
  renderCuratedIcon,
  fallbackType,
  variant = "labeled",
  maxHeight = { xs: 360, sm: 400 },
  searchPlaceholder = "Search 2,164 Material icons...",
}) => {
  const [query, setQuery] = useState("");
  const [browseAll, setBrowseAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const catalog = useSyncExternalStore(
    subscribeMaterialIconCatalog,
    getMaterialIconCatalogSnapshot,
  );

  const selectedKey = normalizeMaterialIconKey(selectedIcon || "");
  const trimmedQuery = query.trim();

  const curatedKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const item of curatedItems) {
      set.add(normalizeMaterialIconKey(item.name));
    }
    return set;
  }, [curatedItems]);

  const { tiles, totalCount, isLoadingCatalog } = useMemo(() => {
    if (trimmedQuery.length > 0) {
      if (catalog.loaded) {
        const matches = searchMaterialIcons(trimmedQuery, SEARCH_RESULT_LIMIT);
        return {
          tiles: matches.slice(0, visibleCount).map((entry) => ({
            name: entry.name,
            label: entry.label,
            key: entry.key,
            shape: entry.shape,
          })),
          totalCount: matches.length,
          isLoadingCatalog: false,
        };
      }
      // Show immediate curated matches while the lazy offline JSON finishes loading
      const quickMatches = filterCuratedItems(curatedItems, trimmedQuery);
      return {
        tiles: quickMatches.slice(0, visibleCount),
        totalCount: quickMatches.length,
        isLoadingCatalog: true,
      };
    }

    if (browseAll) {
      if (!catalog.loaded) {
        return {
          tiles: [] as UnifiedIconTile[],
          totalCount: 0,
          isLoadingCatalog: true,
        };
      }
      const allEntries = getAllMaterialIconEntries();
      return {
        tiles: allEntries.slice(0, visibleCount).map((entry) => ({
          name: entry.name,
          label: entry.label,
          key: entry.key,
          shape: entry.shape,
        })),
        totalCount: allEntries.length,
        isLoadingCatalog: false,
      };
    }

    const curatedTiles = filterCuratedItems(curatedItems, "");
    return {
      tiles: curatedTiles,
      totalCount: curatedTiles.length,
      isLoadingCatalog: false,
    };
  }, [browseAll, catalog.loaded, curatedItems, trimmedQuery, visibleCount]);

  const showCustomSelectedBanner =
    trimmedQuery.length === 0 &&
    !browseAll &&
    selectedKey.length > 0 &&
    !curatedKeySet.has(selectedKey);

  const customSelectedLabel = useMemo(() => {
    if (!selectedIcon) return "";
    const entry = catalog.loaded
      ? getCachedMaterialIconEntry(selectedIcon)
      : null;
    return entry?.label || formatMaterialIconLabel(selectedIcon);
  }, [catalog.loaded, selectedIcon]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    setVisibleCount(PAGE_SIZE);
    if (next.trim().length > 0 && !catalog.loaded) {
      void loadMaterialIconCatalog();
    }
  };

  const handleClearQuery = () => {
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  };

  const handleSelectCuratedMode = () => {
    setBrowseAll(false);
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  };

  const handleSelectAllMode = () => {
    setBrowseAll(true);
    setQuery("");
    setVisibleCount(PAGE_SIZE);
    if (!catalog.loaded) {
      void loadMaterialIconCatalog();
    }
  };

  const remaining = Math.max(0, totalCount - tiles.length);

  return (
    <Stack spacing={1.25}>
      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={handleQueryChange}
        onFocus={() => {
          if (!catalog.loaded) void loadMaterialIconCatalog();
        }}
        placeholder={searchPlaceholder}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="Clear icon search"
                  onClick={handleClearQuery}
                  edge="end"
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Chip
            label={`Curated (${curatedItems.length})`}
            size="small"
            clickable
            color={!browseAll && !trimmedQuery ? "primary" : "default"}
            variant={!browseAll && !trimmedQuery ? "filled" : "outlined"}
            onClick={handleSelectCuratedMode}
          />
          <Chip
            label={`All Material Icons${catalog.loaded ? ` (${catalog.entries.length})` : ""}`}
            size="small"
            clickable
            color={browseAll && !trimmedQuery ? "primary" : "default"}
            variant={browseAll && !trimmedQuery ? "filled" : "outlined"}
            onClick={handleSelectAllMode}
          />
        </Box>

        {trimmedQuery.length > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            {isLoadingCatalog && <CircularProgress size={14} />}
            <Typography variant="caption" color="text.secondary">
              {isLoadingCatalog
                ? "Searching all 2,164 icons..."
                : `${totalCount}${totalCount === SEARCH_RESULT_LIMIT ? "+" : ""} match${totalCount === 1 ? "" : "es"}`}
            </Typography>
          </Box>
        )}
        {trimmedQuery.length === 0 && browseAll && catalog.loaded && (
          <Typography variant="caption" color="text.secondary">
            Showing {tiles.length} of {totalCount}
          </Typography>
        )}
      </Box>

      {showCustomSelectedBanner && selectedIcon && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Chip
            icon={
              <LazyMaterialIcon
                icon={selectedIcon}
                fallbackType={fallbackType}
                fontSize="small"
              />
            }
            label={`Current custom icon: ${customSelectedLabel}`}
            size="small"
            color="primary"
            variant="outlined"
            onClick={() => onSelect(selectedIcon)}
          />
        </Box>
      )}

      <Box
        sx={{
          maxHeight,
          overflowY: "auto",
          p: 1,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        {isLoadingCatalog && tiles.length === 0 ? (
          <Box
            sx={{
              py: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="caption" color="text.secondary">
              Loading offline Material Icons catalog...
            </Typography>
          </Box>
        ) : tiles.length === 0 ? (
          <Box sx={{ py: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No Material Icons match "{trimmedQuery}".
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                variant === "compact"
                  ? "repeat(auto-fill, minmax(42px, 1fr))"
                  : {
                      xs: "repeat(auto-fill, minmax(76px, 1fr))",
                      sm: "repeat(auto-fill, minmax(96px, 1fr))",
                    },
              gap: variant === "compact" ? 0.75 : 1,
            }}
          >
            {tiles.map((tile) => {
              const isSelected = selectedKey === tile.key;
              const iconNode = tile.shape
                ? renderMaterialIconShape(
                    tile.shape,
                    variant === "compact" ? "small" : "medium",
                  )
                : renderCuratedIcon(tile.name);

              if (variant === "compact") {
                return (
                  <Tooltip key={tile.name} title={tile.label} enterDelay={250}>
                    <IconButton
                      onClick={() => onSelect(tile.name)}
                      aria-label={tile.label}
                      aria-pressed={isSelected}
                      size="small"
                      sx={{
                        width: 42,
                        height: 42,
                        justifySelf: "center",
                        border: "2px solid",
                        borderColor: isSelected ? "primary.main" : "divider",
                        bgcolor: isSelected ? "primary.main" : "background.paper",
                        color: isSelected
                          ? "primary.contrastText"
                          : "text.secondary",
                        "&:hover": {
                          bgcolor: isSelected ? "primary.dark" : "action.hover",
                          color: isSelected
                            ? "primary.contrastText"
                            : "text.primary",
                        },
                      }}
                    >
                      {iconNode}
                    </IconButton>
                  </Tooltip>
                );
              }

              return (
                <Tooltip key={tile.name} title={tile.label} enterDelay={300}>
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label={tile.label}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(tile.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(tile.name);
                      }
                    }}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.5,
                      p: 1,
                      minHeight: { xs: 68, sm: 76 },
                      borderRadius: 2,
                      cursor: "pointer",
                      border: "2px solid",
                      borderColor: isSelected ? "primary.main" : "transparent",
                      bgcolor: isSelected ? "action.selected" : "background.paper",
                      color: isSelected ? "primary.main" : "text.primary",
                      transition: "border-color 0.15s ease, background-color 0.15s ease",
                      "&:hover": {
                        bgcolor: "action.hover",
                        borderColor: isSelected ? "primary.main" : "divider",
                      },
                    }}
                  >
                    {iconNode}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      sx={{
                        width: "100%",
                        textAlign: "center",
                        fontSize: { xs: "0.7rem", sm: "0.75rem" },
                      }}
                    >
                      {tile.label}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        )}

        {remaining > 0 && (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 1.5, pb: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, remaining)} more ({remaining} remaining)
            </Button>
          </Box>
        )}
      </Box>
    </Stack>
  );
};
