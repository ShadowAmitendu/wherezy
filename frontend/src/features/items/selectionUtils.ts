import type { GridRowId, GridRowSelectionModel } from "@mui/x-data-grid";
import { api, ApiException } from "../../api/client";
import type { UndoOptions } from "../../components/shared/UndoContext";

export interface BulkSkipEntry {
  id: number;
  name: string;
  reason: string;
}

export interface RunBulkItemsArgs {
  ids: number[];
  action: string;
  params?: Record<string, unknown>;
  pastTenseLabel: string;
  showUndo?: (opts: UndoOptions) => void;
  allowUndo?: boolean;
  onSuccess: () => void | Promise<void>;
  onNotice?: (message: string) => void;
}

/**
 * Resolve concrete row IDs from MUI DataGrid v9's include/exclude selection model
 * (or legacy array selection models) against the currently displayed rows.
 */
export function resolveDataGridSelectionIds(
  selection: GridRowSelectionModel | GridRowId[],
  visibleRows: ReadonlyArray<{ id: number }>
): number[] {
  if (Array.isArray(selection)) {
    return selection.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  }
  if (!selection || typeof selection !== "object" || !(selection.ids instanceof Set)) {
    return [];
  }
  if (selection.type === "exclude") {
    return visibleRows
      .filter((row) => !selection.ids.has(row.id))
      .map((row) => row.id);
  }
  return Array.from(selection.ids)
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

export function extractBulkErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiException) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Execute a `/api/items/bulk` operation, refresh table data, handle skipped reasons,
 * and register a 10-second batch Undo snackbar when a reversible `batch_id` is returned.
 */
export async function runBulkItemsRequest({
  ids,
  action,
  params = {},
  pastTenseLabel,
  showUndo,
  allowUndo = true,
  onSuccess,
  onNotice,
}: RunBulkItemsArgs): Promise<void> {
  if (ids.length === 0) return;
  const res = await api.bulkItems({ ids, action, params });
  const changed = Number(res?.changed ?? 0);
  const skipped: BulkSkipEntry[] = Array.isArray(res?.skipped) ? res.skipped : [];

  if (changed === 0 && skipped.length > 0) {
    const summary = skipped
      .slice(0, 3)
      .map((s) => `${s.name}: ${s.reason}`)
      .join("; ");
    const suffix = skipped.length > 3 ? ` (+${skipped.length - 3} more)` : "";
    throw new Error(`No items updated — ${summary}${suffix}`);
  }

  await onSuccess();

  const countText = `${changed} ${changed === 1 ? "item" : "items"}`;
  const skipText = skipped.length > 0 ? ` (${skipped.length} skipped)` : "";
  const message = `${pastTenseLabel} ${countText}${skipText}`;

  if (allowUndo && res?.batch_id && showUndo) {
    const batchId = String(res.batch_id);
    showUndo({
      message,
      onUndo: async () => {
        await api.undoBatch(batchId);
      },
    });
  } else if (onNotice) {
    onNotice(message);
  }
}
