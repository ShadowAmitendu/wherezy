import React, { useState, useEffect } from "react";
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { FlatLocationOption, flattenLocationTree } from "./locationUtils";
import { LocationIcon } from "./LocationIcon";

interface LocationPickerProps {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  label?: string;
  required?: boolean;
  excludeId?: number | null; // For avoiding cycles when reparenting
  roomsOnly?: boolean;
  helperText?: string;
  size?: "small" | "medium";
  emptyLabel?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  label = "Storage Location",
  required = false,
  excludeId,
  roomsOnly = false,
  helperText,
  size = "medium",
  emptyLabel = "None / Unassigned",
}) => {
  const [options, setOptions] = useState<FlatLocationOption[]>([]);

  useEffect(() => {
    api
      .getLocationsTree()
      .then((tree) => {
        setOptions(flattenLocationTree(tree, 0, excludeId, { roomsOnly }));
      })
      .catch(console.error);
  }, [excludeId, roomsOnly]);

  return (
    <FormControl fullWidth required={required} size={size}>
      <InputLabel shrink id="location-picker-label">{label}</InputLabel>
      <Select
        labelId="location-picker-label"
        value={value ? String(value) : ""}
        label={label}
        notched
        size={size}
        displayEmpty
        renderValue={(selected) => {
          if (!selected) {
            return <span style={{ opacity: 0.75 }}>{emptyLabel}</span>;
          }
          const opt = options.find((o) => String(o.id) === selected);
          if (!opt) return selected;
          return opt.depth > 0 ? `${opt.path} (${opt.kind})` : `${opt.name} (${opt.kind})`;
        }}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val ? Number(val) : null);
        }}
      >
        <MenuItem value="">
          <em>{emptyLabel}</em>
        </MenuItem>
        {options.map((opt) => {
          const roleHint = opt.isRoom
            ? opt.storageOnly && opt.childrenCount === 0
              ? "Storage-only place"
              : opt.childrenCount > 0
                ? `${opt.childrenCount} ${opt.childrenCount === 1 ? "area" : "areas"}`
                : "Room"
            : opt.kind;
          const isFull = typeof opt.maxQuantity === "number" && opt.availableCapacity === 0;
          const capacityText =
            typeof opt.maxQuantity === "number" && opt.maxQuantity > 0
              ? isFull
                ? "Full"
                : `${opt.availableCapacity} left`
              : null;
          return (
            <MenuItem
              key={opt.id}
              value={String(opt.id)}
              sx={{
                pl: 2 + opt.depth * 2,
                fontWeight: opt.isRoom || opt.depth === 0 ? 600 : 400,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1.5,
                  width: "100%",
                  minWidth: 0,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                  {opt.depth > 0 && (
                    <Typography component="span" variant="caption" color="text.secondary">
                      {"└─".padStart(opt.depth + 2, " ")}
                    </Typography>
                  )}
                  <LocationIcon kind={opt.kind} fontSize="inherit" />
                  <Typography variant="body2" sx={{ fontWeight: opt.isRoom ? 700 : 500 }} noWrap>
                    {opt.name}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                  {capacityText && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: isFull ? "error.main" : "text.secondary",
                      }}
                    >
                      {capacityText}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {roleHint}
                  </Typography>
                </Box>
              </Box>
            </MenuItem>
          );
        })}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};
