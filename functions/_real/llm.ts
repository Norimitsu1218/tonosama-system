import { Env } from "../_utils";

/**
 * LLM Provider switch:
 *   env.LLM_PROVIDER = "gemini" | "claude"
 *   (今は gemini のみ実装、claude は後で差し替え)
 */
export async function llmGenerate14Lang(env: Env, input: {
  store_id: string;
  item_id: string;
  name_ja: string;
  price: number;
  ja18s_final: string;
}) {
  const provider = (env.LLM_PROVIDER || "gemini").toLowerCase();

  if (provider === "claude") {
    // ---- Claude 版はここで実装予定 ----
    // return claudeGenerate14Lang(env, input);
    throw new Error("CLAUDE_NOT_IMPLEMENTED");
  }

  return geminiGenerate14Lang(env, input);
}

/** Gemini 実装（REST） */
async function geminiGenerate14Lang(env: Env, input: any) {
  const apiKey = env.GEMINI_API_KEY;
  const model  = env.GEMINI_MODEL || "gemini-2.0-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 14言語のローカライズ意訳を JSON で返させる
  const prompt = `
You are a professional multilingual yakitori menu localizer.
Given Japanese menu item info, produce localized names + short food report (18-second read) for 14 languages:
EN, KR, ZH-Hans, ZH-Hant, YUE, TH, TL, VI, ID, ES, DE, FR, IT, PT.
Return STRICT JSON only with this schema:
{
  "translations": {
    "en": {"name":"...", "desc":"..."},
    "ko": {"name":"...", "desc":"..."},
    "zh_hans": {...},
    "zh_hant": {...},
    "yue": {...},
    "th": {...},
    "tl": {...},
    "vi": {...},
    "id": {...},
    "es": {...},
    "de": {...},
    "fr": {...},
    "it": {...},
    "pt": {...}
  }
}

Japanese Input:
- store_id: ${input.store_id}
- item_id: ${input.item_id}
- name_ja: ${input.name_ja}
- price_jpy: ${input.price}
- ja18s_final: ${input.ja18s_final}
`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }]}],
      generationConfig: { temperature: 0.7 }
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`gemini error ${res.status}: ${t}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("") || "";

  // JSON だけ抜き出して parse（多少の余計な文字に耐える）
  const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || "{}";
  return JSON.parse(jsonStr);
}
