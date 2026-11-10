import React from "react";
import { Avatar, Box } from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";

interface CoverThumbProps {
  photoId?: number | null;
  thumbUrl?: string | null;
  size?: number;
  borderRadius?: number;
}

export const CoverThumb: React.FC<CoverThumbProps> = ({
  photoId,
  thumbUrl,
  size = 40,
  borderRadius = 8,
}) => {
  const src = thumbUrl || (photoId ? `/api/photos/${photoId}/thumb` : undefined);

  if (!src) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: `${borderRadius}px`,
          bgcolor: "action.hover",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Inventory2OutlinedIcon sx={{ fontSize: size * 0.6 }} />
      </Box>
    );
  }

  return (
    <Avatar
      variant="rounded"
      src={src}
      sx={{
        width: size,
        height: size,
        borderRadius: `${borderRadius}px`,
      }}
    />
  );
};
