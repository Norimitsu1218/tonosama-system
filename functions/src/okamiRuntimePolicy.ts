import type { OkamiKind } from "./okamiEngine";

export type OkamiExecutionMode = "speed" | "robustness" | "scalability";

export function parseExecutionMode(input: unknown): OkamiExecutionMode {
  if (input === "robustness" || input === "scalability") {
    return input;
  }
  return "speed";
}

export function selectGeminiModel(kind: OkamiKind, mode: OkamiExecutionMode): string {
  const flashModel = process.env.GEMINI_MODEL_FLASH ?? "gemini-2.5-flash";
  const proModel = process.env.GEMINI_MODEL_PRO ?? "gemini-2.5-pro";

  if (kind === "SECURITY" || mode === "robustness") {
    return proModel;
  }
  if (mode === "scalability") {
    return flashModel;
  }
  return flashModel;
}

