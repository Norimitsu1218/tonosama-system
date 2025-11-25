// CP4-PROMPTS: production prompt registry (14 langs)
// NOTE: keep it simple; real content can be swapped later.

export type Lang =
  | "en" | "ko" | "zh-Hans" | "zh-Hant" | "yue"
  | "th" | "fil" | "vi" | "id" | "es" | "de" | "fr" | "it" | "pt";

export function getProdPrompt(lang: Lang) {
  // TODO: replace bodies with final master prompt text per lang.
  // For now, return stable placeholders to prove wiring.
  const header = "You are a localization copywriter for a yakitori izakaya.";
  const rules = [
    "Write culturally localized paraphrase, not literal translation.",
    "Must include CROP: appearance, texture, taste+safety+numbers, light CTA.",
    "If yakitori first mention, briefly explain what yakitori is.",
    "Mention animal/part, doneness/heat level, remove harsh odor wording.",
    "Use EM-dash —, localize numbers/units."
  ].join("\\n");

  const body = `LANG=${lang}
${header}
RULES:
${rules}

OUTPUT JSON:
{
  "name_localized": "...",
  "body_localized": "..."
}
`;

  return body;
}

export function buildPrompt(lang: Lang, input: {
  name_ja: string;
  ja18s_final: string;
  price?: number;
  category?: string;
}) {
  const prod = getProdPrompt(lang);
  const user = [
    `name_ja: ${input.name_ja}`,
    input.category ? `category: ${input.category}` : "",
    input.price != null ? `price_jpy: ${input.price}` : "",
    `ja18s_final: ${input.ja18s_final}`
  ].filter(Boolean).join("\\n");

  return `${prod}\\nINPUT:\\n${user}`;
}
