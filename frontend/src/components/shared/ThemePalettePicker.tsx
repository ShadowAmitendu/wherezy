import React from "react";
import { Box, Chip, Grid, Paper, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import {
  THEME_PRESETS,
  ThemePreset,
  ThemeTransitionSource,
} from "../../theme/themeConstants";

export interface ThemePalettePickerProps {
  preset: ThemePreset;
  onSelect: (preset: ThemePreset, source?: ThemeTransitionSource) => void;
  variant?: "detailed" | "compact";
}

/**
 * Reusable theme palette selector rendering all configured color presets
 * consistently across Settings and Account Profile pages.
 */
export const ThemePalettePicker: React.FC<ThemePalettePickerProps> = ({
  preset,
  onSelect,
  variant = "detailed",
}) => {
  const keys = Object.keys(THEME_PRESETS) as ThemePreset[];

  const handleCardKeyDown = (key: ThemePreset) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(key, e.currentTarget);
    }
  };

  return (
    <Grid container spacing={variant === "compact" ? 1.5 : 2}>
      {keys.map((key) => {
        const cfg = THEME_PRESETS[key];
        const isSelected = preset === key;

        if (variant === "compact") {
          return (
            <Grid key={key} size={{ xs: 12, sm: 6 }}>
              <Paper
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                variant="outlined"
                onClick={(e) => onSelect(key, e)}
                onKeyDown={handleCardKeyDown(key)}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  cursor: "pointer",
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? "primary.main" : "divider",
                  bgcolor: isSelected ? "action.selected" : "background.paper",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1.5,
                  height: "100%",
                  transition: (theme) =>
                    theme.transitions.create(["border-color", "background-color", "transform", "box-shadow"], {
                      duration: theme.transitions.duration.shortest,
                      easing: theme.transitions.easing.easeInOut,
                    }),
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover", transform: "translateY(-1px)" },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                  <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                    {cfg.colors.map((c, i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          bgcolor: c,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: isSelected ? 700 : 600 }} noWrap>
                      {cfg.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                      {cfg.description}
                    </Typography>
                  </Box>
                </Box>
                {isSelected && <CheckIcon color="primary" fontSize="small" sx={{ flexShrink: 0 }} />}
              </Paper>
            </Grid>
          );
        }

        return (
          <Grid key={key} size={{ xs: 12, md: 6 }}>
            <Paper
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              variant="outlined"
              onClick={(e) => onSelect(key, e)}
              onKeyDown={handleCardKeyDown(key)}
              sx={{
                p: 2,
                cursor: "pointer",
                borderRadius: 1.5,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? "primary.main" : "divider",
                bgcolor: isSelected ? "action.selected" : "background.paper",
                height: "100%",
                transition: (theme) =>
                  theme.transitions.create(["border-color", "background-color", "transform", "box-shadow"], {
                    duration: theme.transitions.duration.shorter,
                    easing: theme.transitions.easing.easeInOut,
                  }),
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "action.hover",
                  transform: "translateY(-2px)",
                },
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {cfg.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {cfg.description}
                  </Typography>
                </Box>
                {isSelected && (
                  <Chip
                    label="Active"
                    size="small"
                    color="primary"
                    sx={{ height: 22, fontSize: "0.75rem", fontWeight: 700 }}
                  />
                )}
              </Box>

              <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                {cfg.colors.map((c, i) => (
                  <Tooltip key={i} title={c}>
                    <Box
                      sx={{
                        flex: 1,
                        height: 32,
                        borderRadius: 1,
                        bgcolor: c,
                        border: "1px solid",
                        borderColor: "divider",
                        boxShadow: 1,
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", opacity: 0.7 }}>
                  {cfg.colors[0]}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", opacity: 0.7 }}>
                  {cfg.colors[cfg.colors.length - 1]}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        );
      })}
    </Grid>
  );
};
