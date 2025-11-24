import type { Env } from "../_utils";

/**
 * claudeGenerate:
 * prompt を Claude に投げて JSON を返す。
 * 返り値は { translations: { lang: {name, desc}, ... } } を想定。
 */
export async function claudeGenerate(env: Env, prompt: string) {
  const key = env.CLAUDE_API_KEY;
  const model = env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";
  if (!key) throw new Error("CLAUDE_API_KEY missing");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`claude error ${res.status}: ${t}`);
  }

  const data = await res.json();
  const text =
    data?.content?.map((p:any)=> (p?.text || "")).join("") || "";

  const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || "{}";
  return JSON.parse(jsonStr);
}
