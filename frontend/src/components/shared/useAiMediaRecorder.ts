import { useCallback, useEffect, useRef, useState } from "react";
import {
  audioFilenameForMime,
  MAX_AUDIO_RECORD_SECONDS,
  pickSupportedAudioMimeType,
  validateAudioFile,
  validateImageFile,
} from "../../features/forms/audioUtils";

export interface AiAudioDraft {
  blob: Blob;
  filename: string;
  previewUrl: string;
  label: string;
}

export interface AiImageDraft {
  file: File;
  previewUrl: string;
  label: string;
}

export interface UseAiMediaRecorderResult {
  prompt: string;
  setPrompt: (value: string) => void;
  audioDraft: AiAudioDraft | null;
  imageDraft: AiImageDraft | null;
  isRecording: boolean;
  recordSeconds: number;
  mediaError: string | null;
  clearMediaError: () => void;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  selectAudioFile: (file: File | null | undefined) => void;
  clearAudio: () => void;
  selectImageFile: (file: File | null | undefined) => void;
  clearImage: () => void;
  resetAll: () => void;
}

/** Shared voice recording, audio upload, and photo attachment state with object-URL cleanup. */
export function useAiMediaRecorder(active: boolean): UseAiMediaRecorderResult {
  const [prompt, setPrompt] = useState("");
  const [audioDraft, setAudioDraft] = useState<AiAudioDraft | null>(null);
  const [imageDraft, setImageDraft] = useState<AiImageDraft | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const recordSecondsRef = useRef<number>(0);

  const cleanupHardware = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore already stopped recorder
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopStreamAndTimer = useCallback(() => {
    cleanupHardware();
    setIsRecording(false);
  }, [cleanupHardware]);

  const clearAudio = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioDraft(null);
  }, []);

  const clearImage = useCallback(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setImageDraft(null);
  }, []);

  const resetAll = useCallback(() => {
    stopStreamAndTimer();
    clearAudio();
    clearImage();
    setPrompt("");
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    setMediaError(null);
  }, [clearAudio, clearImage, stopStreamAndTimer]);

  useEffect(() => {
    if (!active) {
      cleanupHardware();
    }
  }, [active, cleanupHardware]);

  useEffect(() => {
    return () => {
      cleanupHardware();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    };
  }, [cleanupHardware]);

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setMediaError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      setMediaError(
        window.isSecureContext
          ? "Voice recording is not available in this browser. Upload an audio file or type details instead."
          : "Live microphone recording requires HTTPS (or localhost) on mobile/LAN browsers. Upload a voice clip or type details instead."
      );
      return;
    }

    try {
      clearAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const selectedMime = pickSupportedAudioMimeType();
      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;
      setRecordSeconds(0);
      recordSecondsRef.current = 0;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        const finalMime = recorder.mimeType || selectedMime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        chunksRef.current = [];
        if (blob.size > 0) {
          const previewUrl = URL.createObjectURL(blob);
          audioUrlRef.current = previewUrl;
          const mins = Math.floor(recordSecondsRef.current / 60);
          const secs = recordSecondsRef.current % 60;
          const duration = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
          setAudioDraft({
            blob,
            filename: audioFilenameForMime(finalMime),
            previewUrl,
            label: `Voice note (${duration})`,
          });
        }
      };

      recorder.start(250);
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
        if (recordSecondsRef.current >= MAX_AUDIO_RECORD_SECONDS) {
          stopRecording();
        }
      }, 1000);
    } catch (err: any) {
      stopStreamAndTimer();
      setMediaError(
        err?.name === "NotAllowedError"
          ? "Microphone permission denied. Allow microphone access, upload a clip, or type a prompt."
          : "Could not access microphone. Try uploading an audio file or typing a prompt."
      );
    }
  }, [clearAudio, stopRecording, stopStreamAndTimer]);

  const selectAudioFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const err = validateAudioFile(file);
      if (err) {
        setMediaError(err);
        return;
      }
      setMediaError(null);
      stopStreamAndTimer();
      clearAudio();
      const previewUrl = URL.createObjectURL(file);
      audioUrlRef.current = previewUrl;
      setAudioDraft({
        blob: file,
        filename: file.name,
        previewUrl,
        label: `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`,
      });
    },
    [clearAudio, stopStreamAndTimer]
  );

  const selectImageFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const err = validateImageFile(file);
      if (err) {
        setMediaError(err);
        return;
      }
      setMediaError(null);
      clearImage();
      const previewUrl = URL.createObjectURL(file);
      imageUrlRef.current = previewUrl;
      setImageDraft({
        file,
        previewUrl,
        label: `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`,
      });
    },
    [clearImage]
  );

  return {
    prompt,
    setPrompt,
    audioDraft,
    imageDraft,
    isRecording,
    recordSeconds,
    mediaError,
    clearMediaError: () => setMediaError(null),
    startRecording,
    stopRecording,
    selectAudioFile,
    clearAudio,
    selectImageFile,
    clearImage,
    resetAll,
  };
}
