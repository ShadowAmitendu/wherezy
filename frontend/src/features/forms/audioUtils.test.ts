import { describe, expect, it } from "vitest";
import {
  audioFilenameForMime,
  formatRecordingDuration,
  MAX_AUDIO_FILE_BYTES,
  MAX_IMAGE_FILE_BYTES,
  validateAudioFile,
  validateImageFile,
} from "./audioUtils";

describe("audioUtils", () => {
  it("maps audio MIME types to clean filenames", () => {
    expect(audioFilenameForMime("audio/webm;codecs=opus")).toBe("voice_note.webm");
    expect(audioFilenameForMime("audio/mp4")).toBe("voice_note.m4a");
    expect(audioFilenameForMime("audio/ogg; codecs=opus")).toBe("voice_note.ogg");
    expect(audioFilenameForMime("audio/mpeg")).toBe("voice_note.mp3");
    expect(audioFilenameForMime("")).toBe("voice_note.webm");
  });

  it("formats recording duration as MM:SS", () => {
    expect(formatRecordingDuration(0)).toBe("00:00");
    expect(formatRecordingDuration(7)).toBe("00:07");
    expect(formatRecordingDuration(65)).toBe("01:05");
    expect(formatRecordingDuration(-4)).toBe("00:00");
  });

  it("validates audio file size and extension", () => {
    const emptyFile = new File([], "empty.webm", { type: "audio/webm" });
    expect(validateAudioFile(emptyFile)).toContain("empty");

    const okFile = new File([new Uint8Array(128)], "memo.m4a", { type: "audio/mp4" });
    expect(validateAudioFile(okFile)).toBeNull();

    const badFile = new File([new Uint8Array(128)], "doc.pdf", { type: "application/pdf" });
    expect(validateAudioFile(badFile)).toContain("Unsupported");

    const giantBlob = { size: MAX_AUDIO_FILE_BYTES + 1, name: "big.mp3", type: "audio/mp3" } as File;
    expect(validateAudioFile(giantBlob)).toContain("15 MB");
  });

  it("validates image file size and extension", () => {
    const emptyImg = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(validateImageFile(emptyImg)).toContain("empty");

    const okImg = new File([new Uint8Array(128)], "label.webp", { type: "image/webp" });
    expect(validateImageFile(okImg)).toBeNull();

    const okExtImg = new File([new Uint8Array(128)], "receipt.heic", { type: "" });
    expect(validateImageFile(okExtImg)).toBeNull();

    const badImg = new File([new Uint8Array(128)], "notes.txt", { type: "text/plain" });
    expect(validateImageFile(badImg)).toContain("Unsupported");

    const giantImg = {
      size: MAX_IMAGE_FILE_BYTES + 1,
      name: "huge.png",
      type: "image/png",
    } as File;
    expect(validateImageFile(giantImg)).toContain("15 MB");
  });
});
