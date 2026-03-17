import { supabase } from "@/integrations/supabase/client";

interface LogErrorParams {
  message: string;
  stack?: string;
  component?: string;
  severity?: "error" | "warning" | "info";
  metadata?: Record<string, unknown>;
}

let isLogging = false;

export async function logError({
  message,
  stack = "",
  component = "",
  severity = "error",
  metadata = {},
}: LogErrorParams) {
  // Prevent recursive logging
  if (isLogging) return;
  isLogging = true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    await (supabase as any).from("app_error_logs").insert({
      user_id: userId,
      error_message: message.slice(0, 2000),
      error_stack: (stack || "").slice(0, 5000),
      component_name: component,
      route: window.location.pathname,
      severity,
      metadata: {
        ...metadata,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      },
    });
  } catch {
    // Silently fail - don't break the app because of logging
  } finally {
    isLogging = false;
  }
}

function isStaleModuleError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('does not provide an export named') || normalized.includes('failed to fetch dynamically imported module');
}

function recoverFromStaleModuleError() {
  const key = 'stale-module-reload';
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');

  try {
    window.localStorage.removeItem('memo-query-cache');
  } catch {
    // ignore
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .finally(() => window.location.reload());
    return;
  }

  window.location.reload();
}

export function setupGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    const text = String(message);
    logError({
      message: text,
      stack: error?.stack || `${source}:${lineno}:${colno}`,
      component: "window.onerror",
      severity: "error",
      metadata: { source, lineno, colno },
    });

    if (isStaleModuleError(text)) recoverFromStaleModuleError();
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const err = event.reason;
    const message = err?.message || String(err);
    logError({
      message,
      stack: err?.stack || "",
      component: "unhandledrejection",
      severity: "error",
      metadata: { reason: String(err) },
    });

    if (isStaleModuleError(message)) recoverFromStaleModuleError();
  };
}
