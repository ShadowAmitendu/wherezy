import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { getHashRedirectForDirectPath } from "./features/notfound/routeUtils.ts";

const hashFallbackTarget = getHashRedirectForDirectPath(
  window.location.pathname,
  window.location.search,
  window.location.hash,
);
if (hashFallbackTarget) {
  window.history.replaceState(null, "", hashFallbackTarget);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
