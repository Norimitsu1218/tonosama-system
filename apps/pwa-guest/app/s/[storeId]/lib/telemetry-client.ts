type TelemetryEvent =
  | "gate_allowed"
  | "consent"
  | "mood"
  | "tray_add"
  | "slip"
  | "sumimasen"
  | "okami_ask"
  | "okami_api"
  | "okami_blocked"
  | "okami_fallback"
  | "okami_rate_limited";
type TelemetryMood = "Hungry" | "Relax" | "Adventure";

type TelemetryPayload = {
  mood?: TelemetryMood;
};

const REQUEST_TIMEOUT_MS = 1500;

export async function emitTelemetry(
  gateToken: string | null,
  event: TelemetryEvent,
  payload?: TelemetryPayload
): Promise<void> {
  if (!gateToken || typeof window === "undefined") {
    return;
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gateToken}`
      },
      body: JSON.stringify({
        event,
        mood: payload?.mood,
        ts: Date.now(),
        schema: 1
      }),
      keepalive: true,
      signal: controller?.signal
    });
  } catch {
    return;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}
