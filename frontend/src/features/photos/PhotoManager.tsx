import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Card,
  CardMedia,
  CardActions,
  Chip,
  Dialog,
  DialogContent,
  Tooltip,
} from "@mui/material";
import { AlertDialog } from "../../components/shared/AlertDialog";
import { PhotoCaptureButtons } from "../../components/shared/PhotoCaptureButtons";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ZoomInOutlinedIcon from "@mui/icons-material/ZoomInOutlined";
import { api, ApiException } from "../../api/client";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

export interface Photo {
  id: number;
  owner_type: "item" | "location";
  owner_id: number;
  file_name: string;
  thumb_name: string;
  width: number;
  height: number;
  bytes: number;
  is_cover: boolean;
  sort_order: number;
  created_at: string;
  url: string;
  thumb_url: string;
}

interface PhotoManagerProps {
  ownerType: "item" | "location";
  ownerId: number;
  readOnly?: boolean;
}

export const PhotoManager: React.FC<PhotoManagerProps> = ({
  ownerType,
  ownerId,
  readOnly = false,
}) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Zoom dialog state
  const [zoomPhoto, setZoomPhoto] = useState<Photo | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);

  const loadPhotos = useCallback(async () => {
    if (!ownerId) return;
    try {
      setIsLoading(true);
      if (ownerType === "item") {
        const item = await api.getItem(ownerId);
        setPhotos(item.photos || []);
      } else {
        const loc = await api.getLocation(ownerId);
        setPhotos(loc.photos || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const req =
      ownerType === "item"
        ? api.getItem(ownerId).then((item) => item.photos || [])
        : api.getLocation(ownerId).then((loc) => loc.photos || []);
    req
      .then((list) => {
        if (active) setPhotos(list);
      })
      .catch((err) => {
        if (active) console.error(err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerType, ownerId]);

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setErrorMsg(null);
    try {
      for (const file of files) {
        try {
          await api.uploadPhoto(ownerType, ownerId, file);
        } catch (err: any) {
          if (err instanceof ApiException) {
            setErrorMsg(err.error.message);
          } else {
            setErrorMsg("Failed to upload photo");
          }
          break;
        }
      }
      await loadPhotos();
    } finally {
      setIsUploading(false);
    }
  };

  const handleSetCover = async (photoId: number) => {
    try {
      await api.setCoverPhoto(photoId);
      await loadPhotos();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePhoto = async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePhoto(deleteTarget.id);
      setDeleteTarget(null);
      await loadPhotos();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      {/* Upload / Camera Buttons */}
      {!readOnly && (
        <PhotoCaptureButtons
          onFilesSelected={handleFilesSelected}
          loading={isUploading}
          cameraLabel="Take Photo"
          uploadLabel="Upload Photo"
          sx={{ mb: 2 }}
        />
      )}

      {/* Error Dialog */}
      <AlertDialog
        open={Boolean(errorMsg)}
        onClose={() => setErrorMsg(null)}
        title="Photo Error"
        message={errorMsg}
        severity="error"
      />

      {photos.length === 0 && !isLoading ? (
        <Typography variant="body2" color="text.secondary">
          No photos attached.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))",
            gap: 1.5,
          }}
        >
          {photos.map((photo) => (
            <Card
              key={photo.id}
              variant="outlined"
              sx={{
                position: "relative",
                border: photo.is_cover ? "2px solid" : "1px solid",
                borderColor: photo.is_cover ? "primary.main" : "divider",
                borderRadius: 1.5,
                overflow: "hidden",
                bgcolor: "transparent",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box
                sx={{
                  position: "relative",
                  aspectRatio: "4 / 3",
                  bgcolor: "action.hover",
                  overflow: "hidden",
                }}
              >
                {photo.is_cover && (
                  <Chip
                    label="Cover"
                    size="small"
                    color="primary"
                    sx={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      zIndex: 2,
                      height: 22,
                      fontSize: "0.68rem",
                      fontWeight: 600,
                    }}
                  />
                )}

                <CardMedia
                  component="img"
                  image={photo.thumb_url}
                  alt="Photo thumbnail"
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    cursor: "pointer",
                  }}
                  onClick={() => setZoomPhoto(photo)}
                />
              </Box>

              {!readOnly && (
                <CardActions
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "nowrap",
                    px: 0.75,
                    py: 0.5,
                    bgcolor: "action.hover",
                    borderTop: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Tooltip title={photo.is_cover ? "Primary Cover Photo" : "Set as Cover"}>
                    <IconButton
                      size="small"
                      color={photo.is_cover ? "primary" : "default"}
                      onClick={() => handleSetCover(photo.id)}
                      aria-label={photo.is_cover ? "Primary cover photo" : "Set as cover photo"}
                    >
                      {photo.is_cover ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
                    <Tooltip title="View full size">
                      <IconButton size="small" onClick={() => setZoomPhoto(photo)} aria-label="View full size">
                        <ZoomInOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete photo">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteTarget(photo)}
                        aria-label="Delete photo"
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardActions>
              )}
            </Card>
          ))}
        </Box>
      )}

      {/* Zoom Dialog */}
      <Dialog
        open={Boolean(zoomPhoto)}
        onClose={() => setZoomPhoto(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent sx={{ p: 0, bgcolor: "black", textAlign: "center" }}>
          {zoomPhoto && (
            <img
              src={zoomPhoto.url}
              alt="Full size view"
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                objectFit: "contain",
                display: "block",
                margin: "auto",
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Photo"
        message="Are you sure you want to delete this photo?"
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeletePhoto}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
};
