// CP4-QC-AUTO: lightweight QC rules (per lang)
// Throw on NG; caller handles try/catch and marks translation_status:error.

const forbid = [
  "raw translation", "literally", "not sure", "unknown",
];

const mustMention = [
  "texture", "taste",
];

export function qcCheckOne(lang: string, text: string) {
  const low = text.toLowerCase();

  for (const f of forbid) {
    if (low.includes(f)) throw new Error(`QC_FORBID:${f}`);
  }
  for (const m of mustMention) {
    if (!low.includes(m)) throw new Error(`QC_MISSING:${m}`);
  }
  return true;
}
