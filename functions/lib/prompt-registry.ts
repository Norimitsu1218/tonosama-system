/**
 * CP4-PROMPTS: Production localization (not translation) prompt registry
 * - Single source of truth for all 14 languages
 * - CROP + S2 quality rules baked into prompt itself
 */

export const LANGS = [
  "en","ko","zh-Hans","zh-Hant","yue","th","fil","vi","id","es","de","fr","it","pt",
] as const;

export type Lang = typeof LANGS[number];

const COMMON_RULES = `
ROLE: You are a top-tier localizer for Japanese yakitori menus.
TASK: Do NOT translate. Create a culturally natural localized expression.

INPUTS:
- ja_name: Japanese menu name (signal, not to be translated literally)
- ja18s_final: Japanese 18-sec food report (signal for intent)

OUTPUT JSON ONLY:
{
  "name_localized": "...",
  "body_localized": "..."
}

HARD RULES:
- Keep it within ~18 seconds silent read in target language.
- Use CROP:
  C) Appearance/visual cue (short)
  R) Texture/mouthfeel (short)
  O) Flavor + safety/heat level + numbers if present (short)
  P) Pairing + light CTA (short)
- First occurrence of "yakitori" must include a tiny explanation.
- Always mention the animal part clearly when inferrable (chicken, pork, etc.).
- Mention doneness / heat level if relevant (grilled, charcoal, juicy, etc.).
- Localize numbers/currency to the locale.
- Avoid overclaim / miracle / unsafe promises.
- Tone: natural, appetizing, not hype.
`;

const PER_LANG_TONE: Record<string, string> = {
  en: "Persona: foodie journalist, concise and vivid.",
  ko: "Persona: 미식가 블로거, 자연스럽고 과장 없이.",
  "zh-Hans": "Persona: 本地美食达人，口吻自然。",
  "zh-Hant": "Persona: 在地美食推薦者，語氣親切。",
  yue: "Persona: 粤语美食KOL，自然口语。",
  th: "Persona: นักชิมท้องถิ่น สุภาพเป็นกันเอง.",
  fil: "Persona: casual foodie, warm and clear.",
  vi: "Persona: người sành ăn địa phương, gọn gàng.",
  id: "Persona: foodie lokal, jelas tanpa berlebihan.",
  es: "Persona: crítico gastronómico local, natural.",
  de: "Persona: sachlich, appetitlich, präzise.",
  fr: "Persona: gourmet local, naturel et précis.",
  it: "Persona: buongustaio locale, naturale.",
  pt: "Persona: foodie local, natural e direto.",
};

/**
 * >>> ここに“14言語本番プロンプト本文”を貼る <<<
 * - lang毎に差分がある場合は perLang 内で上書き
 * - ない場合は COMMON_RULES + tone が使われる
 */
const PROD_BODY: Partial<Record<Lang, string>> = {
  // en: `<<<PASTE_PROD_PROMPT_BODY_HERE>>>`,
  // ko: `<<<PASTE_PROD_PROMPT_BODY_HERE>>>`,
};

export function buildPrompt(lang: Lang) {
  const body = (PROD_BODY[lang] || "").trim();
  const tone = PER_LANG_TONE[lang] || "";
  const merged = [COMMON_RULES, tone, body].filter(Boolean).join("\n\n").trim();
  return merged;
}

/** QC hint rules exported for CP4-QC-AUTO */
export const QC_RULES = {
  forbid: [/overclaim/i, /miracle/i, /cure/i, /100% safe/i],
  mustMention: ["yakitori"],
};
