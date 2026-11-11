import React, { useRef, useState } from "react";
import { Box, Button, CircularProgress, type SxProps, type Theme } from "@mui/material";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";

export type PhotoInputSource = "camera" | "upload";

export interface PhotoCaptureButtonsProps {
  /** Invoked with selected or captured image files. */
  onFilesSelected: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  multiple?: boolean;
  size?: "small" | "medium" | "large";
  cameraLabel?: string;
  uploadLabel?: string;
  loadingLabel?: string;
  cameraVariant?: "text" | "outlined" | "contained";
  uploadVariant?: "text" | "outlined" | "contained";
  sx?: SxProps<Theme>;
}

/**
 * Reusable pair of photo acquisition controls: one button that invokes the device
 * camera (`capture="environment"`) and one button that opens a standard image file picker.
 */
export const PhotoCaptureButtons: React.FC<PhotoCaptureButtonsProps> = ({
  onFilesSelected,
  disabled = false,
  loading = false,
  multiple = true,
  size = "medium",
  cameraLabel = "Snap Photo",
  uploadLabel = "Upload Photo",
  loadingLabel,
  cameraVariant = "outlined",
  uploadVariant = "outlined",
  sx,
}) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSource, setPendingSource] = useState<PhotoInputSource | null>(null);

  const isBusy = Boolean(disabled || loading || pendingSource !== null);
  const spinnerSize = size === "small" ? 16 : size === "large" ? 20 : 18;

  const handleInputChange = async (
    source: PhotoInputSource,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    // Copy files before clearing input value so repeated selections of the same file still trigger onChange.
    const files = Array.from(fileList);
    e.target.value = "";
    setPendingSource(source);
    try {
      await onFilesSelected(files);
    } finally {
      setPendingSource(null);
    }
  };

  const actions: Array<{
    source: PhotoInputSource;
    label: string;
    variant: "text" | "outlined" | "contained";
    icon: React.ReactNode;
    inputRef: React.RefObject<HTMLInputElement | null>;
    capture?: "environment";
    allowMultiple?: boolean;
  }> = [
    {
      source: "camera",
      label: cameraLabel,
      variant: cameraVariant,
      icon: <PhotoCameraOutlinedIcon />,
      inputRef: cameraInputRef,
      capture: "environment",
    },
    {
      source: "upload",
      label: uploadLabel,
      variant: uploadVariant,
      icon: <AddPhotoAlternateOutlinedIcon />,
      inputRef: fileInputRef,
      allowMultiple: multiple,
    },
  ];

  return (
    <Box
      sx={[
        { display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {actions.map((action) => {
        const showSpinner = isBusy && pendingSource === action.source;
        return (
          <React.Fragment key={action.source}>
            <input
              ref={action.inputRef}
              type="file"
              accept="image/*"
              capture={action.capture}
              multiple={action.allowMultiple}
              style={{ display: "none" }}
              onChange={(e) => handleInputChange(action.source, e)}
            />
            <Button
              variant={action.variant}
              size={size}
              startIcon={
                showSpinner ? <CircularProgress size={spinnerSize} color="inherit" /> : action.icon
              }
              onClick={() => action.inputRef.current?.click()}
              disabled={isBusy}
            >
              {showSpinner && loadingLabel ? loadingLabel : action.label}
            </Button>
          </React.Fragment>
        );
      })}
    </Box>
  );
};
