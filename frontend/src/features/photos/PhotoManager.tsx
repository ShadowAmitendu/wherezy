import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Card,
  CardMedia,
  CardActions,
  Chip,
  Dialog,
  DialogContent,
  CircularProgress,
  Alert,
  Snackbar,
  Tooltip,
  Grid,
} from "@mui/material";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ZoomInOutlinedIcon from "@mui/icons-material/ZoomInOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = async () => {
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
  };

  useEffect(() => {
    loadPhotos();
  }, [ownerType, ownerId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMsg(null);

    for (let i = 0; i < files.length; i++) {
      try {
        await api.uploadPhoto(ownerType, ownerId, files[i]);
      } catch (err: any) {
        if (err instanceof ApiException) {
          setErrorMsg(err.error.message);
        } else {
          setErrorMsg("Failed to upload photo");
        }
        break;
      }
    }

    if (e.target) e.target.value = "";
    setIsUploading(false);
    await loadPhotos();
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
      {/* Upload Buttons */}
      {!readOnly && (
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            ref={cameraInputRef}
            onChange={handleFileSelect}
          />

          <Button
            variant="outlined"
            startIcon={<AddPhotoAlternateOutlinedIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            Upload Photo
          </Button>

          <Button
            variant="outlined"
            startIcon={<PhotoCameraOutlinedIcon />}
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading}
          >
            Take Photo
          </Button>

          {isUploading && <CircularProgress size={24} />}
        </Box>
      )}

      <Snackbar
        open={Boolean(errorMsg)}
        autoHideDuration={6000}
        onClose={() => setErrorMsg(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ zIndex: 2000, bottom: { xs: 24, sm: 32 } }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setErrorMsg(null)}
          sx={{
            minWidth: { xs: 280, sm: 380 },
            maxWidth: { xs: "90vw", sm: 540 },
            boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)",
            borderRadius: 1,
            alignItems: "center",
          }}
        >
          {errorMsg}
        </Alert>
      </Snackbar>

      {photos.length === 0 && !isLoading ? (
        <Typography variant="body2" color="text.secondary">
          No photos attached.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {photos.map((photo) => (
            <Grid key={photo.id} size={{ xs: 6, sm: 4, md: 3 }}>
              <Card
                sx={{
                  position: "relative",
                  border: photo.is_cover ? "2px solid" : "1px solid",
                  borderColor: photo.is_cover ? "primary.main" : "divider",
                  borderRadius: 2,
                }}
              >
                {photo.is_cover && (
                  <Chip
                    label="Cover"
                    size="small"
                    color="primary"
                    sx={{
                      position: "absolute",
                      top: 6,
                      left: 6,
                      zIndex: 2,
                      fontWeight: 600,
                    }}
                  />
                )}

                <CardMedia
                  component="img"
                  height="140"
                  image={photo.thumb_url}
                  alt="Photo thumbnail"
                  sx={{ objectFit: "cover", cursor: "pointer" }}
                  onClick={() => setZoomPhoto(photo)}
                />

                {!readOnly && (
                  <CardActions sx={{ justifyContent: "space-between", px: 1, py: 0.5 }}>
                    <Tooltip title={photo.is_cover ? "Primary Cover Photo" : "Set as Cover"}>
                      <IconButton
                        size="small"
                        color={photo.is_cover ? "primary" : "default"}
                        onClick={() => handleSetCover(photo.id)}
                      >
                        {photo.is_cover ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>

                    <Box>
                      <Tooltip title="View full size">
                        <IconButton size="small" onClick={() => setZoomPhoto(photo)}>
                          <ZoomInOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete photo">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(photo)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </CardActions>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
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
