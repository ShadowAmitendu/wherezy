import React from "react";
import { SvgIcon, type SvgIconProps, type SxProps, type Theme } from "@mui/material";
import type { MaterialIconShape } from "./materialIconCatalog";

/** Render a compact extracted Material Icon SVG shape inside MUI SvgIcon without exporting from a component file. */
export function renderMaterialIconShape(
  shape: MaterialIconShape,
  fontSize: SvgIconProps["fontSize"] = "medium",
  sx?: SxProps<Theme>,
): React.ReactElement {
  const children =
    typeof shape === "string"
      ? React.createElement("path", { d: shape })
      : shape.map(([tag, attrs], index) =>
          React.createElement(tag, { key: index, ...attrs }),
        );

  return React.createElement(
    SvgIcon,
    { fontSize, sx, viewBox: "0 0 24 24" },
    children,
  );
}
