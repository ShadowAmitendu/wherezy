import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { DEFAULT_UNDO_DURATION_MS, UndoSnackbar } from "./UndoSnackbar";

const testTheme = createTheme();

function renderUndoSnackbar(props: React.ComponentProps<typeof UndoSnackbar>): string {
  return renderToStaticMarkup(
    <ThemeProvider theme={testTheme}>
      <UndoSnackbar {...props} />
    </ThemeProvider>
  );
}

describe("UndoSnackbar", () => {
  it("uses a 10-second default duration", () => {
    expect(DEFAULT_UNDO_DURATION_MS).toBe(10000);
  });

  it("renders message, 10s timer readout, UNDO button, and full progressbar when open", () => {
    const html = renderUndoSnackbar({
      open: true,
      message: 'Deleted "Cordless Drill"',
      onUndo: () => {},
      onClose: () => {},
    });

    expect(html).toContain("Deleted &quot;Cordless Drill&quot;");
    expect(html).toContain("UNDO");
    expect(html).toContain("10s");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Undo time remaining"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-label="Dismiss undo notification"');
  });

  it("renders partial remaining seconds and error feedback when provided", () => {
    const html = renderUndoSnackbar({
      open: true,
      message: 'Moved "Camping Tent"',
      onUndo: () => {},
      onClose: () => {},
      autoHideDuration: 10000,
      undoing: true,
      errorMessage: "Item no longer in trash",
    });

    expect(html).toContain("Moved &quot;Camping Tent&quot;");
    expect(html).toContain("Undoing...");
    expect(html).toContain("Item no longer in trash");
    expect(html).toContain('role="progressbar"');
  });

  it("renders nothing when closed", () => {
    const html = renderUndoSnackbar({
      open: false,
      message: 'Deleted "Drill"',
      onUndo: () => {},
      onClose: () => {},
    });

    expect(html).toBe("");
  });
});
