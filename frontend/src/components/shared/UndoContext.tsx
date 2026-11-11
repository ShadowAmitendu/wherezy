import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiException } from "../../api/client";
import { DEFAULT_UNDO_DURATION_MS, UndoSnackbar } from "./UndoSnackbar";

export const DATA_CHANGED_EVENT = "wherezy:data-changed";

export function notifyDataChanged(scope?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { scope } }));
  }
}

export function useOnUndoRefresh(onRefresh: () => void): void {
  const ref = useRef(onRefresh);

  useEffect(() => {
    ref.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const handler = () => {
      ref.current();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);
}

export interface UndoOptions {
  message: string;
  onUndo: () => Promise<void> | void;
  onUndone?: () => Promise<void> | void;
  undoLabel?: string;
  durationMs?: number;
}

interface ActiveUndoEntry extends UndoOptions {
  key: number;
}

interface UndoContextValue {
  showUndo: (options: UndoOptions) => void;
  dismissUndo: () => void;
}

const UndoContext = createContext<UndoContextValue>({
  showUndo: () => {},
  dismissUndo: () => {},
});

export const useUndo = (): UndoContextValue => useContext(UndoContext);

export const UndoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entry, setEntry] = useState<ActiveUndoEntry | null>(null);
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const keySeqRef = useRef(0);

  const showUndo = useCallback((options: UndoOptions) => {
    keySeqRef.current += 1;
    setErrorMessage(null);
    setUndoing(false);
    setEntry({
      ...options,
      key: keySeqRef.current,
    });
    setOpen(true);
  }, []);

  const dismissUndo = useCallback(() => {
    setOpen(false);
    setUndoing(false);
    setErrorMessage(null);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!entry || undoing) return;
    setUndoing(true);
    setErrorMessage(null);
    try {
      await entry.onUndo();
      if (entry.onUndone) {
        await entry.onUndone();
      }
      notifyDataChanged("undo");
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiException) {
        setErrorMessage(err.error.message);
      } else {
        setErrorMessage("Could not undo that action.");
      }
      console.error("Undo failed:", err);
    } finally {
      setUndoing(false);
    }
  }, [entry, undoing]);

  const value = useMemo<UndoContextValue>(
    () => ({
      showUndo,
      dismissUndo,
    }),
    [showUndo, dismissUndo]
  );

  return (
    <UndoContext.Provider value={value}>
      {children}
      <UndoSnackbar
        open={open}
        message={entry?.message || ""}
        onUndo={handleUndo}
        onClose={dismissUndo}
        autoHideDuration={entry?.durationMs ?? DEFAULT_UNDO_DURATION_MS}
        actionKey={entry?.key ?? 0}
        undoLabel={entry?.undoLabel}
        undoing={undoing}
        errorMessage={errorMessage}
      />
    </UndoContext.Provider>
  );
};
