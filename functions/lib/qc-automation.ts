// QC automation calling /qc/gemini endpoint + minimal rules
import { QC_RULES } from "./prompt-registry";

export async function qcCheckOne(env: any, job: any) {
  const base = env.BASE_URL || "http://localhost:8788";
  const res = await fetch(new URL("/qc/gemini", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lang: job.lang,
      text: job.text,
      item_id: job.item_id,
      store_id: job.store_id,
    }),
  });

  const qc = await res.json().catch(() => ({}));

  const forbidHit = (QC_RULES.forbid || []).find((r) => r.test(job.text));
  const mustMiss = (QC_RULES.mustMention || []).find((k) => !job.text.includes(k));

  if (forbidHit || mustMiss || qc?.status === "ng") {
    const reason =
      qc?.reason ||
      (forbidHit ? `forbid:${String(forbidHit)}` : "") ||
      (mustMiss ? `mustMention:${mustMiss}` : "unknown");
    throw new Error(`QC NG: ${reason}`);
  }
  return qc;
}
