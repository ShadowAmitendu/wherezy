import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BulkSelectionBar } from "./BulkSelectionBar";
import { resolveDataGridSelectionIds } from "./selectionUtils";

const noop = vi.fn();

describe("BulkSelectionBar & selectionUtils", () => {
  it("resolves DataGrid include and exclude (header select-all) selection models", () => {
    const visibleRows = [{ id: 10 }, { id: 20 }, { id: 30 }];

    expect(
      resolveDataGridSelectionIds({ type: "include", ids: new Set([10, 30]) }, visibleRows)
    ).toEqual([10, 30]);

    expect(
      resolveDataGridSelectionIds({ type: "exclude", ids: new Set() }, visibleRows)
    ).toEqual([10, 20, 30]);

    expect(
      resolveDataGridSelectionIds({ type: "exclude", ids: new Set([20]) }, visibleRows)
    ).toEqual([10, 30]);

    expect(resolveDataGridSelectionIds(["5", 15], visibleRows)).toEqual([5, 15]);
  });

  it("renders full bulk action options when items are selected and user can write", () => {
    const html = renderToStaticMarkup(
      <BulkSelectionBar
        selectedCount={3}
        canWrite
        onClear={noop}
        onMove={noop}
        onManageTags={noop}
        onMarkTakenOut={noop}
        onMarkReturned={noop}
        onSetExpiry={noop}
        onPackInBox={noop}
        onRetire={noop}
        onPrintLabels={noop}
        onDelete={noop}
      />
    );

    expect(html).toContain("3 items selected");
    expect(html).toContain("Clear");
    expect(html).toContain("Move");
    expect(html).toContain("Tags");
    expect(html).toContain("More Actions");
    expect(html).toContain("Print Labels");
    expect(html).toContain("Delete");
  });

  it("hides write actions for read-only users while preserving Print Labels and Clear", () => {
    const html = renderToStaticMarkup(
      <BulkSelectionBar
        selectedCount={1}
        canWrite={false}
        onClear={noop}
        onMove={noop}
        onManageTags={noop}
        onMarkTakenOut={noop}
        onMarkReturned={noop}
        onSetExpiry={noop}
        onPackInBox={noop}
        onRetire={noop}
        onPrintLabels={noop}
        onDelete={noop}
      />
    );

    expect(html).toContain("1 item selected");
    expect(html).toContain("Print Labels");
    expect(html).toContain("Clear");
    expect(html).not.toContain("Move");
    expect(html).not.toContain("Delete");
  });
});
