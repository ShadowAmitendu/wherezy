/** Audio recording & validation helpers for voice-guided AI category creation. */

export const MAX_AUDIO_RECORD_SECONDS = 120;
export const MAX_AUDIO_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_FILE_BYTES = 15 * 1024 * 1024;

const PREFERRED_RECORDING_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

/** Select the best supported MediaRecorder MIME type for the current browser. */
export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  for (const candidate of PREFERRED_RECORDING_MIMES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

/** Return a canonical filename with matching extension for a recorded audio MIME type. */
export function audioFilenameForMime(mimeType: string): string {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  const ext = MIME_TO_EXTENSION[base] || "webm";
  return `voice_note.${ext}`;
}

/** Format recording seconds cleanly as MM:SS. */
export function formatRecordingDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Validate uploaded audio file size & basic audio type on the client before upload. */
export function validateAudioFile(file: File): string | null {
  if (file.size === 0) {
    return "The selected audio file is empty.";
  }
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return "Audio file is too large (maximum 15 MB).";
  }
  const type = (file.type || "").toLowerCase();
  const extOk = /\.(wav|mp3|m4a|mp4|ogg|oga|opus|webm|aac|flac|aiff)$/i.test(file.name);
  if (type && !type.startsWith("audio/") && type !== "video/webm" && type !== "application/ogg" && !extOk) {
    return "Unsupported audio format. Choose a WAV, MP3, M4A, OGG, AAC, FLAC, or WebM file.";
  }
  return null;
}

/** Validate uploaded photo size & basic image type on the client before upload. */
export function validateImageFile(file: File): string | null {
  if (file.size === 0) {
    return "The selected image file is empty.";
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return "Image file is too large (maximum 15 MB).";
  }
  const type = (file.type || "").toLowerCase();
  const extOk = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.name);
  if (type && !type.startsWith("image/") && !extOk) {
    return "Unsupported image format. Choose a JPG, PNG, WebP, HEIC, or GIF image.";
  }
  return null;
}
