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

export function setupGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    logError({
      message: String(message),
      stack: error?.stack || `${source}:${lineno}:${colno}`,
      component: "window.onerror",
      severity: "error",
      metadata: { source, lineno, colno },
    });
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const err = event.reason;
    logError({
      message: err?.message || String(err),
      stack: err?.stack || "",
      component: "unhandledrejection",
      severity: "error",
      metadata: { reason: String(err) },
    });
  };
}
