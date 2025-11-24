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
  // S68-03 SLOT:
  // ここをあなたの「本番14言語ローカライズ意訳プロンプト全文」に置換するだけで完了。
  // 形式: langCode: `...prompt...`
  en: base + `
[TBD PROD PROMPT EN]`,
  ko: base + `
[TBD PROD PROMPT KO]`,
  "zh-Hans": base + `
[TBD PROD PROMPT ZH-HANS]`,
  "zh-Hant": base + `
[TBD PROD PROMPT ZH-HANT]`,
  yue: base + `
[TBD PROD PROMPT YUE]`,
  th: base + `
[TBD PROD PROMPT TH]`,
  tl: base + `
[TBD PROD PROMPT TL]`,
  vi: base + `
[TBD PROD PROMPT VI]`,
  id: base + `
[TBD PROD PROMPT ID]`,
  es: base + `
[TBD PROD PROMPT ES]`,
  de: base + `
[TBD PROD PROMPT DE]`,
  fr: base + `
[TBD PROD PROMPT FR]`,
  it: base + `
[TBD PROD PROMPT IT]`,
  pt: base + `
[TBD PROD PROMPT PT]`,
};

  return (perLang[lang] || base).trim();
}

export const QC_RULES = {
  forbid: [/overclaim/i, /miracle/i],
  mustMention: ["yakitori"],
};
