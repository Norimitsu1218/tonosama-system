// Central registry for production prompts + rules.
// Replace text blocks with your real production prompts.
// Controlled by PROMPT_VERSION.

export type LangCode =
  | "en" | "ko" | "zh-Hans" | "zh-Hant" | "yue"
  | "th" | "tl" | "vi" | "id" | "es" | "de" | "fr" | "it" | "pt";

export const LANGS: LangCode[] = [
  "en","ko","zh-Hans","zh-Hant","yue","th","tl","vi","id","es","de","fr","it","pt"
];

export function getProdPrompt(env: any, lang: LangCode) {
  const base = `
You are TONOSAMA multilingual food localization editor.
Generate a localized 18-second read food review + how-to-eat + pairing.
Follow house style and safety. Output only in target language.
`.trim();

  const perLang: Record<string, string> = {
    en: base + `\nTone: friendly, precise, no exaggeration.`,
    ko: base + `\nTone: 자연스럽고 현지화, 과장 금지.`,
    "zh-Hans": base + `\nTone: 简洁地道，避免夸张.`,
    "zh-Hant": base + `\nTone: 簡潔道地，避免誇張.`,
    yue: base + `\nTone: 粵語口吻，簡潔自然.`,
    th: base + `\nTone: สุภาพ เป็นธรรมชาติ.`,
    tl: base + `\nTone: natural Tagalog, no hype.`,
    vi: base + `\nTone: tự nhiên, không phóng đại.`,
    id: base + `\nTone: alami, tidak berlebihan.`,
    es: base + `\nTone: muy natural, sin exagerar.`,
    de: base + `\nTone: sachlich, appetitlich, nicht übertreiben.`,
    fr: base + `\nTone: naturel, précis, pas d'exagération.`,
    it: base + `\nTone: naturale e locale, niente hype.`,
    pt: base + `\nTone: natural, sem exagero.`,
  };

  return (perLang[lang] || base).trim();
}

export const QC_RULES = {
  forbid: [/overclaim/i, /miracle/i],
  mustMention: ["yakitori"],
};
