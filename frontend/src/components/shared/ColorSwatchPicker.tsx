import React from "react";
import { Box, Typography } from "@mui/material";

export const DEFAULT_COLOR_PALETTE = [
  "#1976d2",
  "#486B85",
  "#02435C",
  "#57B5C3",
  "#2e7d32",
  "#388e3c",
  "#ed6c02",
  "#9c27b0",
  "#d32f2f",
  "#455a64",
  "#5d4037",
];

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: string[];
  size?: number;
  label?: string;
}

export const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({
  value,
  onChange,
  colors = DEFAULT_COLOR_PALETTE,
  size = 32,
  label,
}) => {
  return (
    <Box>
      {label && (
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {colors.map((c) => {
          const isSelected = value.toLowerCase() === c.toLowerCase();
          return (
            <Box
              key={c}
              component="button"
              type="button"
              onClick={() => onChange(c)}
              aria-label={`Select color ${c}`}
              sx={{
                width: size,
                height: size,
                borderRadius: "50%",
                bgcolor: c,
                cursor: "pointer",
                p: 0,
                outline: "none",
                border: isSelected ? "3px solid #ffffff" : "2px solid transparent",
                boxShadow: isSelected ? "0 0 0 2px #1976d2" : "none",
                transform: isSelected ? "scale(1.1)" : "scale(1)",
                transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                "&:hover": {
                  transform: "scale(1.15)",
                },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
};
