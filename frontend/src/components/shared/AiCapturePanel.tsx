import React, { useRef } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keyframes } from "@mui/material/styles";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import MicNoneIcon from "@mui/icons-material/MicNone";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { formatRecordingDuration, MAX_AUDIO_RECORD_SECONDS } from "../../features/forms/audioUtils";
import type { UseAiMediaRecorderResult } from "./useAiMediaRecorder";

const pulseRecord = keyframes`
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(1.12); }
  100% { opacity: 1; transform: scale(1); }
`;

export interface AiCapturePanelProps {
  media: UseAiMediaRecorderResult;
  aiConfigured: boolean;
  disabled?: boolean;
  promptLabel: string;
  promptPlaceholder: string;
  examples?: { label: string; prompt: string }[];
  allowImage?: boolean;
  imageSectionTitle?: string;
  imageSectionSubtitle?: string;
  promptRows?: number;
  autoFocusPrompt?: boolean;
  onNavigateSettings?: () => void;
}

/** Shared prompt + voice recording/upload + optional photo capture panel for AI dialogs. */
export const AiCapturePanel: React.FC<AiCapturePanelProps> = ({
  media,
  aiConfigured,
  disabled = false,
  promptLabel,
  promptPlaceholder,
  examples,
  allowImage = false,
  imageSectionTitle = "Photo / Label / Receipt (Optional)",
  imageSectionSubtitle = "Snap or upload an image so AI reads labels, expiry dates, and specs",
  promptRows = 2,
  autoFocusPrompt = false,
  onNavigateSettings,
}) => {
  const navigate = useNavigate();
  const { currentProfile } = useAuth();
  const canOpenSettings =
    currentProfile?.role === "admin" || currentProfile?.role === "co_admin";

  const audioInputRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const imageCameraRef = useRef<HTMLInputElement>(null);

  return (
    <Stack spacing={1.75}>
      {!aiConfigured && (
        <Alert
          severity="warning"
          action={
            canOpenSettings ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  onNavigateSettings?.();
                  navigate("/settings");
                }}
              >
                Settings
              </Button>
            ) : undefined
          }
        >
          AI provider is not configured yet.{" "}
          {canOpenSettings
            ? "Configure a Local LLM (Ollama / LM Studio) or add a Gemini API key in Settings."
            : "Ask an admin to configure a Local LLM or Gemini API key in Settings."}
        </Alert>
      )}

      {media.mediaError && (
        <Alert severity="error" onClose={media.clearMediaError}>
          {media.mediaError}
        </Alert>
      )}

      <TextField
        label={promptLabel}
        placeholder={promptPlaceholder}
        value={media.prompt}
        onChange={(e) => media.setPrompt(e.target.value)}
        multiline
        minRows={promptRows}
        maxRows={6}
        fullWidth
        disabled={disabled}
        autoFocus={autoFocusPrompt}
      />

      {examples && examples.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            Try an example:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {examples.map((ex) => (
              <Chip
                key={ex.label}
                label={ex.label}
                size="small"
                variant="outlined"
                onClick={() => media.setPrompt(ex.prompt)}
                disabled={disabled}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Voice note capture / upload */}
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.25,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <MicNoneIcon color={media.isRecording ? "error" : "primary"} />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Voice Message (Optional)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Speak naturally instead of typing everything manually
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {!media.isRecording ? (
              <>
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  startIcon={<MicNoneIcon />}
                  onClick={() => void media.startRecording()}
                  disabled={disabled}
                >
                  {media.audioDraft ? "Re-record" : "Record"}
                </Button>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    media.selectAudioFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<UploadFileOutlinedIcon />}
                  onClick={() => audioInputRef.current?.click()}
                  disabled={disabled}
                >
                  Audio
                </Button>
              </>
            ) : (
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<StopCircleOutlinedIcon />}
                onClick={media.stopRecording}
              >
                Stop Recording
              </Button>
            )}
          </Box>
        </Box>

        {media.isRecording && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1.25 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: "error.main",
                animation: `${pulseRecord} 1.2s ease-in-out infinite`,
              }}
            />
            <Typography
              variant="body2"
              sx={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
              color="error.main"
            >
              Recording {formatRecordingDuration(media.recordSeconds)} /{" "}
              {formatRecordingDuration(MAX_AUDIO_RECORD_SECONDS)}
            </Typography>
          </Box>
        )}

        {media.audioDraft && !media.isRecording && (
          <Box
            sx={{
              mt: 1.25,
              pt: 1.25,
              borderTop: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.25,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flexGrow: 1 }}>
              <GraphicEqIcon color="secondary" fontSize="small" />
              <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>
                {media.audioDraft.label}
              </Typography>
            </Box>
            <audio
              controls
              src={media.audioDraft.previewUrl}
              style={{ height: 32, maxWidth: "100%" }}
            />
            <IconButton
              size="small"
              color="error"
              onClick={media.clearAudio}
              disabled={disabled}
              aria-label="Remove voice recording"
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Paper>

      {/* Optional photo capture / upload */}
      {allowImage && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1.25,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <PhotoCameraIcon color="primary" />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {imageSectionTitle}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {imageSectionSubtitle}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <input
                ref={imageCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  media.selectImageFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<PhotoCameraIcon />}
                onClick={() => imageCameraRef.current?.click()}
                disabled={disabled}
              >
                Camera
              </Button>
              <input
                ref={imageUploadRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  media.selectImageFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadFileOutlinedIcon />}
                onClick={() => imageUploadRef.current?.click()}
                disabled={disabled}
              >
                Photo
              </Button>
            </Box>
          </Box>

          {media.imageDraft && (
            <Box
              sx={{
                mt: 1.25,
                pt: 1.25,
                borderTop: "1px solid",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
                <Box
                  component="img"
                  src={media.imageDraft.previewUrl}
                  alt={media.imageDraft.label}
                  sx={{
                    width: 48,
                    height: 48,
                    objectFit: "cover",
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    flexShrink: 0,
                  }}
                />
                <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>
                  {media.imageDraft.label}
                </Typography>
              </Box>
              <IconButton
                size="small"
                color="error"
                onClick={media.clearImage}
                disabled={disabled}
                aria-label="Remove attached photo"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Paper>
      )}
    </Stack>
  );
};
