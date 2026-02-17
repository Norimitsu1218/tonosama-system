export type OkamiClass = "SECURITY" | "RULE" | "PLACE" | "SOUL";

export type OkamiAnswer = {
  kind: OkamiClass;
  text: string;
  blocked: boolean;
};

export type OkamiRequestResult =
  | { status: "ok"; answer: OkamiAnswer }
  | { status: "rate_limited" | "unauthorized" | "unavailable" };

export type OkamiExecutionMode = "speed" | "robustness" | "scalability";

export async function requestOkamiAnswer(
  token: string | null,
  prompt: string,
  mode: OkamiExecutionMode = "speed"
): Promise<OkamiRequestResult> {
  if (!token) {
    return { status: "unauthorized" };
  }
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { status: "unavailable" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch("/api/okami/answer", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ prompt: trimmed, mode }),
      signal: controller.signal
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { status: "unauthorized" };
      }
      if (res.status === 429) {
        return { status: "rate_limited" };
      }
      return { status: "unavailable" };
    }
    const json = (await res.json()) as Partial<OkamiAnswer>;
    if (
      (json.kind !== "SECURITY" && json.kind !== "RULE" && json.kind !== "PLACE" && json.kind !== "SOUL") ||
      typeof json.text !== "string" ||
      typeof json.blocked !== "boolean"
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      answer: {
        kind: json.kind,
        text: json.text,
        blocked: json.blocked
      }
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
