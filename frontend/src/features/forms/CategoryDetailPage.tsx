import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Alert, Box, Button, Chip } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { PageHeader } from "../../components/shared/PageHeader";
import { useOnUndoRefresh } from "../../components/shared/UndoContext";
import { FormBuilder } from "./FormBuilder";
import { renderMuiIcon } from "../../components/shared/iconUtils";
import { api } from "../../api/client";
import { Category, FieldDef } from "./types";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

export const CategoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const initialAiSummary =
    typeof (location.state as { aiSummary?: unknown } | null)?.aiSummary === "string"
      ? ((location.state as { aiSummary: string }).aiSummary)
      : null;
  const [aiBanner, setAiBanner] = useState<string | null>(initialAiSummary);
  const [category, setCategory] = useState<Category | null>(null);
  useDocumentTitle(category ? category.name : "Categories");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const cat = await api.getCategory(Number(id));
      setCategory(cat);
      setFields(cat.fields || []);
    } catch (err) {
      console.error(err);
      navigate("/categories");
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useOnUndoRefresh(() => {
    void loadData();
  });

  useEffect(() => {
    if (!id) return;
    let active = true;
    api
      .getCategory(Number(id))
      .then((cat) => {
        if (!active) return;
        setCategory(cat);
        setFields(cat.fields || []);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        navigate("/categories");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, navigate]);

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

          {aiBanner && (
            <Alert
              severity="success"
              icon={<AutoAwesomeIcon fontSize="inherit" />}
              onClose={() => setAiBanner(null)}
              sx={{ mb: 2.5 }}
            >
              <strong>AI Category Created & Optimized:</strong> {aiBanner}
            </Alert>
          )}

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
