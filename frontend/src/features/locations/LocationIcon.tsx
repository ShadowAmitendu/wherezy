import React from "react";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import WarehouseOutlinedIcon from "@mui/icons-material/WarehouseOutlined";
import GarageOutlinedIcon from "@mui/icons-material/GarageOutlined";
import ShelvesIcon from "@mui/icons-material/Shelves";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { isRoomKind } from "./locationUtils";

export interface LocationIconProps {
  kind?: string | null;
  fontSize?: "inherit" | "small" | "medium" | "large";
  color?: "inherit" | "primary" | "secondary" | "action" | "disabled" | "error";
}

/** Renders a semantic Material icon for Room-tier spaces vs shelves and storage areas. */
export const LocationIcon: React.FC<LocationIconProps> = ({
  kind,
  fontSize = "small",
  color,
}) => {
  const lower = (kind || "").trim().toLowerCase();
  const resolvedColor = color ?? (isRoomKind(kind) ? "primary" : "action");

  if (lower === "storage room" || lower === "attic" || lower === "basement") {
    return <WarehouseOutlinedIcon fontSize={fontSize} color={resolvedColor} />;
  }
  if (lower === "garage" || lower === "shed") {
    return <GarageOutlinedIcon fontSize={fontSize} color={resolvedColor} />;
  }
  if (isRoomKind(kind)) {
    return <MeetingRoomOutlinedIcon fontSize={fontSize} color={resolvedColor} />;
  }
  if (lower === "storage area" || lower === "closet") {
    return <LayersOutlinedIcon fontSize={fontSize} color={resolvedColor} />;
  }
  if (lower === "shelf" || lower === "cupboard" || lower === "rack") {
    return <ShelvesIcon fontSize={fontSize} color={resolvedColor} />;
  }
  if (lower === "box" || lower === "bin" || lower === "bag" || lower === "drawer") {
    return <Inventory2OutlinedIcon fontSize={fontSize} color={resolvedColor} />;
  }
  return <PlaceOutlinedIcon fontSize={fontSize} color={resolvedColor} />;
};
