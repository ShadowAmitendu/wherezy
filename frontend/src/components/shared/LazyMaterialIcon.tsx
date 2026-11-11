import React, { useEffect, useSyncExternalStore } from "react";
import { SvgIconProps, SxProps, Theme } from "@mui/material";
import CategoryIcon from "@mui/icons-material/Category";
import PersonIcon from "@mui/icons-material/Person";
import {
  getMaterialIconCatalogSnapshot,
  loadMaterialIconCatalog,
  normalizeMaterialIconKey,
  subscribeMaterialIconCatalog,
} from "./materialIconCatalog";
import { renderMaterialIconShape } from "./materialIconRenderer";

export interface LazyMaterialIconProps {
  icon?: string | null;
  fallbackType?: "category" | "person";
  fontSize?: SvgIconProps["fontSize"];
  sx?: SxProps<Theme>;
}

/**
 * Renders any Material Icon by name from the lazy offline catalog.
 * Displays the appropriate fallback icon synchronously while loading or if unknown.
 */
export const LazyMaterialIcon: React.FC<LazyMaterialIconProps> = ({
  icon,
  fallbackType = "category",
  fontSize = "medium",
  sx,
}) => {
  const catalog = useSyncExternalStore(
    subscribeMaterialIconCatalog,
    getMaterialIconCatalogSnapshot,
  );

  useEffect(() => {
    if (icon && !catalog.loaded) {
      void loadMaterialIconCatalog();
    }
  }, [icon, catalog.loaded]);

  if (icon && catalog.loaded) {
    const entry = catalog.byKey.get(normalizeMaterialIconKey(icon));
    if (entry) {
      return renderMaterialIconShape(entry.shape, fontSize, sx);
    }
  }

  return fallbackType === "person" ? (
    <PersonIcon fontSize={fontSize} sx={sx} />
  ) : (
    <CategoryIcon fontSize={fontSize} sx={sx} />
  );
};
