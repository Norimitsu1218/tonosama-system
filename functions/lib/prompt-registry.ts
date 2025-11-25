// CP4-PROMPTS: Production localization prompt registry
// Single source of truth for real localization jobs.

export const LANGS = [
  "en","ko","zh-Hans","zh-Hant","yue","th","tl","vi","id","es","de","fr","it","pt",
] as const;

type LangCode = typeof LANGS[number];

const BASE_PROMPT = (lang: string) => `
You are a native ${lang} food editor for a yakitori izakaya.
TASK: Do NOT translate literally. Localize and re-express for ${lang} speakers.

INPUT:
- ja_name: Japanese menu name
- ja18s_final: 18-second Japanese food note describing how to eat and pair.

OUTPUT JSON:
{
  "name_localized": "...",
  "body_localized": "..."
}

RULES:
- CROP required: Appearance / Texture / Flavor(+safety) / Numbers / Pairing + gentle CTA.
- First mention of "yakitori" must briefly explain what yakitori is and why the cut matters.
- Mention the animal (chicken/pork/etc.) and doneness/heat level when relevant.
- Localize numbers, currency, and units.
- Avoid miraculous claims; keep tone natural, appetizing, and grounded.
`.trim();

const perLang: Record<LangCode, string> = {
  en: `${BASE_PROMPT("English")}\nTone: friendly, clear, never exaggerated; safety cues feel confident.`,
  ko: `${BASE_PROMPT("Korean")}\nTone: 자연스럽고 과장 금지, 강조는 식감과 조리법에.`,
  "zh-Hans": `${BASE_PROMPT("Simplified Chinese")}\nTone: 口吻自然，强调食材、火候与安全。`,
  "zh-Hant": `${BASE_PROMPT("Traditional Chinese")}\nTone: 口吻親切、避免誇張、清楚交代口感與搭配。`,
  yue: `${BASE_PROMPT("Cantonese")}\nTone: 自然地道，唔好誇張，強調炭火/口感/配搭。`,
  th: `${BASE_PROMPT("Thai")}\nTone: เป็นธรรมชาติ ไม่เว่อร์ เน้นกลิ่น สี และรสสัมผัส.`,
  tl: `${BASE_PROMPT("Filipino")}\nTone: natural, hindi OA, binibigyang-diin ang lasa at texture ng karne.`,
  vi: `${BASE_PROMPT("Vietnamese")}\nTone: tự nhiên, không phóng đại, nhấn vào hương vị và kết cấu.`,
  id: `${BASE_PROMPT("Bahasa Indonesia")}\nTone: natural, tidak lebay, jelas menyebutkan bahan dan tingkat matang.`,
  es: `${BASE_PROMPT("Spanish")}\nTone: muy natural, sin exagerar, menciona el corte, la cocción y el acompañamiento.`,
  de: `${BASE_PROMPT("German")}\nTone: sachlich und appetitlich, keine Übertreibung, präzise zu Struktur und Hitze.`,
  fr: `${BASE_PROMPT("French")}\nTone: naturel et précis, pas d'exagération, évoque la texture et le pairing.`,
  it: `${BASE_PROMPT("Italian")}\nTone: naturale, niente hype, descrivi parte animale, temperatura e abbinamenti.`,
  pt: `${BASE_PROMPT("Portuguese")}\nTone: natural, sem exagero, destaque suculência, temperatura e sugestão de drink.`,
};

export function getProdPrompt(env: any, lang: LangCode) {
  return perLang[lang] || BASE_PROMPT("multi-language");
}

export const QC_RULES = {
  forbid: [/overclaim/i, /miracle/i, /100%/i],
  mustMention: ["yakitori"],
};
