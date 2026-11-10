import React from "react";
import {
  Card,
  CardActionArea,
  CardContent,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { renderMuiIcon } from "../../components/shared/IconPicker";
import { Category } from "./types";

export interface CategoryCardProps {
  category: Category;
  onClick: (category: Category) => void;
  onEdit: (category: Category, e: React.MouseEvent) => void;
  onDelete: (category: Category, e: React.MouseEvent) => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  onClick,
  onEdit,
  onDelete,
}) => {
  return (
    <Card
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 124,
        display: "flex",
        flexDirection: "column",
        borderLeft: `6px solid ${category.color || "#1976d2"}`,
        transition: "transform 0.15s, box-shadow 0.15s",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: 4,
        },
      }}
    >
      <CardActionArea
        onClick={() => onClick(category)}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "space-between",
        }}
      >
        <CardContent
          sx={{
            p: 2,
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 110,
            "&:last-child": { pb: 2 },
          }}
        >
          {/* Top section: Icon, Name, Items count, Actions */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: `${category.color}20`,
                  color: category.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {renderMuiIcon(category.icon, "medium")}
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
                  {category.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {category.items_count || 0} items
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex" }}>
              <Tooltip title="Edit Category Details">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(category, e);
                  }}
                  aria-label={`Edit ${category.name}`}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete Category">
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(category, e);
                  }}
                  aria-label={`Delete ${category.name}`}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Bottom section: Expiry tracking badge or standard badge */}
          <Box sx={{ mt: 1.5, minHeight: 24, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            {category.track_expiry ? (
              <Chip
                label={category.expiry_label || "Expiry date"}
                size="small"
                color="warning"
                variant="outlined"
              />
            ) : (
              <Chip
                label="Standard items"
                size="small"
                variant="outlined"
                sx={{ opacity: 0.65, borderColor: "divider" }}
              />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};
