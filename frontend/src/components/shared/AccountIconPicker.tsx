import React, { useMemo, useSyncExternalStore } from "react";
import { Box, Chip, Typography } from "@mui/material";
import { AccountIcon } from "./AccountIcon";
import { ACCOUNT_ICONS, resolveAccountIconName } from "./accountIcons";
import { MaterialIconGrid } from "./MaterialIconGrid";
import {
  formatMaterialIconLabel,
  getCachedMaterialIconEntry,
  getMaterialIconCatalogSnapshot,
  normalizeMaterialIconKey,
  subscribeMaterialIconCatalog,
} from "./materialIconCatalog";

interface AccountIconPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

const CURATED_LABEL_BY_KEY = new Map(
  ACCOUNT_ICONS.map((item) => [normalizeMaterialIconKey(item.name), item.label]),
);

export const AccountIconPicker: React.FC<AccountIconPickerProps> = ({
  value,
  onChange,
  label = "Account Icon",
}) => {
  const catalog = useSyncExternalStore(
    subscribeMaterialIconCatalog,
    getMaterialIconCatalogSnapshot,
  );

  const resolvedName = resolveAccountIconName(value);
  const selectedLabel = useMemo(() => {
    const key = normalizeMaterialIconKey(resolvedName);
    const curatedLabel = CURATED_LABEL_BY_KEY.get(key);
    if (curatedLabel) return curatedLabel;
    if (catalog.loaded) {
      const entry = getCachedMaterialIconEntry(resolvedName);
      if (entry) return entry.label;
    }
    return formatMaterialIconLabel(resolvedName);
  }, [catalog.loaded, resolvedName]);

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Chip
          icon={<AccountIcon icon={value} fontSize="small" />}
          label={selectedLabel}
          size="small"
          variant="outlined"
        />
      </Box>

      <MaterialIconGrid
        curatedItems={ACCOUNT_ICONS}
        selectedIcon={resolvedName}
        onSelect={onChange}
        renderCuratedIcon={(name) => <AccountIcon icon={name} fontSize="small" />}
        fallbackType="person"
        variant="compact"
        maxHeight={{ xs: 196, sm: 224 }}
        searchPlaceholder="Search 2,164 Material icons (e.g. rocket, cat, coffee, bike)..."
      />
    </Box>
  );
};
