import React, { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import { api } from "../../api/client";
import { FlatLocationOption, flattenLocationTree } from "./locationUtils";

interface LocationPickerProps {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  label?: string;
  required?: boolean;
  excludeId?: number | null; // For avoiding cycles when reparenting
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
  helperText,
  size = "medium",
  emptyLabel = "None / Unassigned",
}) => {
  const [options, setOptions] = useState<FlatLocationOption[]>([]);

  useEffect(() => {
    api.getLocationsTree().then((tree) => {
      setOptions(flattenLocationTree(tree, 0, excludeId));
    }).catch(console.error);
  }, [excludeId]);

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
          return opt ? `${opt.name} (${opt.kind})` : selected;
        }}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val ? Number(val) : null);
        }}
      >
        <MenuItem value="">
          <em>{emptyLabel}</em>
        </MenuItem>
        {options.map((opt) => (
          <MenuItem
            key={opt.id}
            value={String(opt.id)}
            sx={{
              pl: 2 + opt.depth * 2,
              fontWeight: opt.depth === 0 ? 600 : 400,
            }}
          >
            {"— ".repeat(opt.depth)}
            {opt.name} ({opt.kind})
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};
