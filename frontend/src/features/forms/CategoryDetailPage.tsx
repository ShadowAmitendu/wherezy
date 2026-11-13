import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkAddedIcon from "@mui/icons-material/BookmarkAdded";
import { PageHeader } from "../../components/shared/PageHeader";
import { useOnUndoRefresh } from "../../components/shared/UndoContext";
import { FormBuilder } from "./FormBuilder";
import { renderMuiIcon } from "../../components/shared/iconUtils";
import { api, ApiException } from "../../api/client";
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
  const [templateSuccess, setTemplateSuccess] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  useDocumentTitle(category ? category.name : "Categories");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleSaveAsTemplate = async () => {
    if (!category) return;
    setIsSavingTemplate(true);
    setTemplateSuccess(null);
    setTemplateError(null);
    try {
      const saved = await api.saveCategoryAsTemplate(category.id);
      setTemplateSuccess(saved.name);
    } catch (err: any) {
      if (err instanceof ApiException) {
        setTemplateError(err.error.message);
      } else {
        setTemplateError("Failed to save category as template");
      }
    } finally {
      setIsSavingTemplate(false);
    }
  };

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
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                {category.track_expiry && (
                  <Chip
                    label={category.expiry_label || "Expiry date"}
                    color="warning"
                    size="small"
                  />
                )}
                <Button
                  variant="outlined"
                  startIcon={isSavingTemplate ? <CircularProgress size={16} /> : <BookmarkBorderIcon />}
                  disabled={isSavingTemplate}
                  onClick={handleSaveAsTemplate}
                >
                  Save as Template
                </Button>
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

          {templateSuccess && (
            <Alert
              severity="success"
              icon={<BookmarkAddedIcon fontSize="inherit" />}
              onClose={() => setTemplateSuccess(null)}
              action={
                <Button color="inherit" size="small" onClick={() => navigate("/categories")}>
                  View in Templates
                </Button>
              }
              sx={{ mb: 2.5 }}
            >
              Saved as reusable custom template &quot;{templateSuccess}&quot;! You can now use and customize it whenever creating categories.
            </Alert>
          )}

          {templateError && (
            <Alert
              severity="error"
              onClose={() => setTemplateError(null)}
              sx={{ mb: 2.5 }}
            >
              {templateError}
            </Alert>
          )}

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
