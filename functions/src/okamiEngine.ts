export type OkamiKind = "SECURITY" | "RULE" | "PLACE" | "SOUL";

export type OkamiResponse = {
  kind: OkamiKind;
  text: string;
  blocked: boolean;
};

export type OkamiContext = {
  storeName: string | null;
  address: string | null;
  mapUrl: string | null;
  businessRules: {
    supportsCashless: boolean;
    hasWifi: boolean;
    hasOtoshi: boolean;
  } | null;
};

export interface OkamiEngine {
  classify(prompt: string): OkamiKind;
  buildResponse(kind: OkamiKind): OkamiResponse;
  applyContext(base: OkamiResponse, context: OkamiContext): OkamiResponse;
}

export function classifyPromptDeterministic(input: string): OkamiKind {
  const q = input.toLowerCase();
  if (/(allergy|allerg|danger|safe|nut|peanut|宗教|religion|alcohol for children|medical|薬)/.test(q)) {
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

export function buildResponseDeterministic(kind: OkamiKind): OkamiResponse {
  if (kind === "SECURITY") {
    return {
      kind,
      text: "Safety check required. Please confirm directly with staff. Moving to SUMIMASEN guidance.",
      blocked: true
    };
  }
  if (kind === "RULE") {
    return {
      kind,
      text: "Rule answer ready. Please confirm payment, Wi-Fi, and operation hours with this store's rules.",
      blocked: false
    };
  }
  if (kind === "PLACE") {
    return {
      kind,
      text: "Place guidance ready. Use map/address details from the store profile.",
      blocked: false
    };
  }
  return {
    kind,
    text: "Soul story ready. Explain the chef's philosophy and pairing context in a concise way.",
    blocked: false
  };
}

export function applyContextDeterministic(base: OkamiResponse, context: OkamiContext): OkamiResponse {
  if (base.kind === "RULE") {
    const rules = [
      `cashless:${context.businessRules?.supportsCashless ? "yes" : "no"}`,
      `wifi:${context.businessRules?.hasWifi ? "yes" : "no"}`,
      `otoshi:${context.businessRules?.hasOtoshi ? "yes" : "no"}`
    ].join(" / ");
    return { ...base, text: `${base.text} ${rules}` };
  }
  if (base.kind === "PLACE") {
    const place = [context.storeName ?? "", context.address ?? "", context.mapUrl ? `map:${context.mapUrl}` : ""]
      .filter((x) => x.length > 0)
      .join(" / ");
    return { ...base, text: place ? `${base.text} ${place}` : base.text };
  }
  return base;
}

export const deterministicOkamiEngine: OkamiEngine = {
  classify: classifyPromptDeterministic,
  buildResponse: buildResponseDeterministic,
  applyContext: applyContextDeterministic
};
