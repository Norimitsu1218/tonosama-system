export type OkamiKind = "SECURITY" | "RULE" | "PLACE" | "SOUL";

export type OkamiContext = {
  storeName?: string;
  address?: string;
  mapUrl?: string;
  businessRules?: {
    supportsCashless?: boolean;
    hasWifi?: boolean;
    hasOtoshi?: boolean;
  };
};

export type OkamiResult = {
  kind: OkamiKind;
  text: string;
  blocked: boolean;
};

export function classifyOkami(prompt: string): OkamiKind {
  const q = prompt.toLowerCase();
  if (/(allergy|allerg|danger|safe|nut|peanut|宗教|religion|medical|薬)/.test(q)) {
    return "SECURITY";
  }
  if (/(wifi|wi-fi|cash|card|charge|tip|open|close|hours|営業時間|支払い)/.test(q)) {
    return "RULE";
  }
  if (/(where|map|station|toilet|restroom|address|行き方|場所|地図)/.test(q)) {
    return "PLACE";
  }
  return "SOUL";
}

export function buildOkamiResult(kind: OkamiKind, context?: OkamiContext): OkamiResult {
  if (kind === "SECURITY") {
    return {
      kind,
      blocked: true,
      text: "Safety check required. Please confirm directly with staff. Moving to SUMIMASEN guidance."
    };
  }

  if (kind === "RULE") {
    const rules = [
      `cashless:${context?.businessRules?.supportsCashless ? "yes" : "no"}`,
      `wifi:${context?.businessRules?.hasWifi ? "yes" : "no"}`,
      `otoshi:${context?.businessRules?.hasOtoshi ? "yes" : "no"}`
    ].join(" / ");
    return {
      kind,
      blocked: false,
      text: `Rule answer ready. ${rules}`
    };
  }

  if (kind === "PLACE") {
    const place = [context?.storeName, context?.address, context?.mapUrl ? `map:${context.mapUrl}` : ""]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" / ");
    return {
      kind,
      blocked: false,
      text: place.length > 0 ? `Place guidance ready. ${place}` : "Place guidance ready."
    };
  }

  return {
    kind,
    blocked: false,
    text: "Soul story ready. Explain the chef's philosophy and pairing context in a concise way."
  };
}

export function runOkamiLocal(prompt: string, context?: OkamiContext): OkamiResult {
  const kind = classifyOkami(prompt);
  return buildOkamiResult(kind, context);
}
