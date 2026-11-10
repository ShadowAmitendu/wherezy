import React, { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import { api } from "../../api/client";

export interface FlatLocationOption {
  id: number;
  name: string;
  kind: string;
  path: string;
  depth: number;
}

interface LocationPickerProps {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  label?: string;
  required?: boolean;
  excludeId?: number | null; // For avoiding cycles when reparenting
  helperText?: string;
}

function flattenTree(
  nodes: any[],
  depth = 0,
  excludeId?: number | null
): FlatLocationOption[] {
  let list: FlatLocationOption[] = [];
  for (const node of nodes) {
    if (excludeId && node.id === excludeId) continue;
    list.push({
      id: node.id,
      name: node.name,
      kind: node.kind,
      path: node.path || node.name,
      depth,
    });
    if (node.children && node.children.length > 0) {
      list = list.concat(flattenTree(node.children, depth + 1, excludeId));
    }
  }
  return list;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  label = "Storage Location",
  required = false,
  excludeId,
  helperText,
}) => {
  const [options, setOptions] = useState<FlatLocationOption[]>([]);

  useEffect(() => {
    api.getLocationsTree().then((tree) => {
      setOptions(flattenTree(tree, 0, excludeId));
    }).catch(console.error);
  }, [excludeId]);

  return (
    <FormControl fullWidth required={required}>
      <InputLabel id="location-picker-label">{label}</InputLabel>
      <Select
        labelId="location-picker-label"
        value={value ? String(value) : ""}
        label={label}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val ? Number(val) : null);
        }}
      >
        <MenuItem value="">
          <em>None / Unassigned</em>
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
