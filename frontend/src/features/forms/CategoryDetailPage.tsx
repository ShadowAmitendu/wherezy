import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Button, Chip } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { FormBuilder } from "./FormBuilder";
import { renderMuiIcon } from "../../components/shared/IconPicker";
import { api } from "../../api/client";
import { Category, FieldDef } from "./types";

export const CategoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [category, setCategory] = useState<Category | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const cat = await api.getCategory(Number(id));
      setCategory(cat);
      setFields(cat.fields || []);
    } catch (err) {
      console.error(err);
      navigate("/categories");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  if (!category && !isLoading) {
    return null;
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/categories")}
        sx={{ mb: 2 }}
      >
        Back to Categories
      </Button>

      {category && (
        <>
          <PageHeader
            title={category.name}
            subtitle={`Custom fields for ${category.name}`}
            icon={renderMuiIcon(category.icon)}
            action={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                {category.track_expiry && (
                  <Chip
                    label={category.expiry_label || "Expiry date"}
                    color="warning"
                    size="small"
                  />
                )}
                <Button
                  variant="outlined"
                  startIcon={<Inventory2OutlinedIcon />}
                  onClick={() => navigate(`/items?category_id=${category.id}`)}
                >
                  View Items ({category.items_count || 0})
                </Button>
              </Box>
            }
          />

          <FormBuilder
            categoryId={category.id}
            fields={fields}
            onFieldsChanged={loadData}
          />
        </>
      )}
    </Box>
  );
};
