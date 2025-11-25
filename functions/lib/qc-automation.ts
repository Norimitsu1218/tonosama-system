/**
 * CP4-QC-AUTO: Automated QC for localized outputs.
 * - Accepts { name_localized, body_localized }
 * - Throws on NG so caller can mark translation_status=error
 */

import { QC_RULES, Lang } from "./prompt-registry";

const LANGUAGE_RULES: Partial<Record<Lang, { forbid?: RegExp[]; mustMention?: string[] }>> = {
  en: { forbid: [/cure/i], mustMention: ["yakitori"] },
  ko: { mustMention: ["yakitori"] },
  "zh-Hans": { mustMention: ["yakitori"] },
};

export type LocalizedOut = {
  lang: Lang;
  name_localized: string;
  body_localized: string;
  price?: number | string;
};

export async function qcCheckOne(env: any, out: LocalizedOut) {
  const body = String(out.body_localized || "");
  const name = String(out.name_localized || "");

  const langRules = LANGUAGE_RULES[out.lang] || {};
  const forbidList = [...(QC_RULES.forbid || []), ...(langRules.forbid || [])];
  const mustList = [...(QC_RULES.mustMention || []), ...(langRules.mustMention || [])];

  // forbid patterns
  const forbidHit = forbidList.find((r) => r.test(body) || r.test(name));

  // mustMention keywords (simple baseline)
  const mustMiss = mustList.find((k) => !body.toLowerCase().includes(String(k).toLowerCase()));

  if (forbidHit || mustMiss) {
    const reason = forbidHit
      ? `forbid:${String(forbidHit)}`
      : `mustMention:${String(mustMiss)}`;
    throw new Error(`QC NG: ${reason}`);
  }

  return { status: "ok", reason: null };
}
