import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupGlobalErrorHandlers } from "./lib/errorLogger";
import { GlobalErrorBoundary } from "./components/ui/GlobalErrorBoundary";

async function cleanupStaleModuleCaches() {
  const shouldCleanup = sessionStorage.getItem("stale-module-reload") || sessionStorage.getItem("chunk_reload");
  if (!shouldCleanup) return;

  sessionStorage.removeItem("stale-module-reload");
  sessionStorage.removeItem("chunk_reload");

  try {
    window.localStorage.removeItem("memo-query-cache");
  } catch {
    // ignore
  }

  if ("caches" in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    } catch {
      // ignore
    }
  }
}

void cleanupStaleModuleCaches();
setupGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
