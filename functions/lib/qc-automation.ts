/**
 * CP4-QC-AUTO: Automated QC for localized outputs.
 * - Accepts { name_localized, body_localized }
 * - Throws on NG so caller can mark translation_status=error
 */

import { QC_RULES, Lang } from "./prompt-registry";

export type LocalizedOut = {
  lang: Lang;
  name_localized: string;
  body_localized: string;
  price?: number | string;
};

export async function qcCheckOne(env: any, out: LocalizedOut) {
  const body = String(out.body_localized || "");
  const name = String(out.name_localized || "");

  // forbid patterns
  const forbidHit =
    (QC_RULES.forbid || []).find((r) => r.test(body) || r.test(name));

  // mustMention keywords (simple baseline)
  const mustMiss =
    (QC_RULES.mustMention || []).find((k) => !body.toLowerCase().includes(String(k).toLowerCase()));

  if (forbidHit || mustMiss) {
    const reason = forbidHit
      ? `forbid:${String(forbidHit)}`
      : `mustMention:${String(mustMiss)}`;
    throw new Error(`QC NG: ${reason}`);
  }

  return { status: "ok", reason: null };
}
