import React from "react";
import {
  Card,
  CardActionArea,
  CardContent,
  Box,
  Typography,
  Chip,
} from "@mui/material";
import { CoverThumb } from "../photos/CoverThumb";
import { ExpiryChip } from "../../components/shared/ExpiryChip";
import { Item } from "./types";

export interface ItemCardProps {
  item: Item;
  onClick: (item: Item) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onClick }) => {
  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: 4,
        },
      }}
    >
      <CardActionArea
        onClick={() => onClick(item)}
        sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "stretch" }}
        aria-label={`View details for ${item.name}`}
      >
        <Box
          sx={{
            height: 160,
            bgcolor: "action.hover",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {item.cover_thumb_url ? (
            <img
              src={item.cover_thumb_url}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Box
              sx={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "text.secondary",
              }}
            >
              <CoverThumb size={60} />
            </Box>
          )}

          <Chip
            label={`I${item.id}`}
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              left: 8,
              bgcolor: "background.paper",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          />

          {item.taken_out && (
            <Chip
              label="Taken Out"
              size="small"
              color="secondary"
              sx={{ position: "absolute", top: 8, right: 8, fontWeight: 600 }}
            />
          )}
        </Box>

        <CardContent sx={{ p: 2, flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
              {item.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
              {item.category_name || "Uncategorized"} • {item.location_path || "No location"}
            </Typography>
          </Box>

          <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <ExpiryChip status={item.expiry_status} dateStr={item.expiry_date} />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};
