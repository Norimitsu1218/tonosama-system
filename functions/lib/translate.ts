// Production translation core for TONOSAMA.
// - Forces prod prompt per language
// - Optional QC automation after generation

import { callClaude, callGemini } from "./llm";
import { getProdPrompt, LANGS, LangCode } from "./prompt-registry";
import { qcCheckOne } from "./qc-automation";

export async function translateOne(env: any, job: any) {
  const provider = (env.LLM_PROVIDER || "claude").toLowerCase();
  const lang: LangCode = job.lang;

  const prompt = getProdPrompt(env, lang);

  const text =
    provider === "gemini"
      ? await callGemini(env, prompt, job)
      : await callClaude(env, prompt, job);

  if ((env.QC_AUTOMATION || "off") === "on") {
    await qcCheckOne(env, { ...job, text });
  }

  return { lang, text };
}

// Helper: expand approved item -> 14-lang jobs
export function expand14langs(baseJob: any) {
  return LANGS.map((lang) => ({ ...baseJob, lang }));
}
