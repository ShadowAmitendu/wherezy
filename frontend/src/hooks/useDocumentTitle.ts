import { useEffect } from "react";

export const APP_NAME = "Wherezy";

/**
 * Sets the browser document title to `Wherezy - {pageName}` (or `Wherezy` if omitted).
 */
export function useDocumentTitle(pageName?: string): void {
  useEffect(() => {
    document.title = pageName ? `${APP_NAME} - ${pageName}` : APP_NAME;
  }, [pageName]);
}
