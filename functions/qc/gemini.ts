import { Env, json, bad, isMock } from "../_utils";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  const text = body?.text || "";
  if (!text) return bad(422, "INVALID", "text required");

  if (isMock(env)) {
    return json({ qc_status:"ok", qc_reason:null });
  }

  const apiKey = env.GEMINI_API_KEY;
  const model  = env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) return bad(500, "GEMINI_API_KEY_MISSING", "secret missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({
      contents: [{ role:"user", parts:[{ text: `QCしてください。OKなら'ok'、要確認なら理由を短く。\n\n${text}` }] }]
    })
  });

  if (!r.ok) {
    const t = await r.text().catch(()=> "");
    return bad(502, "GEMINI_ERROR", t.slice(0,200));
  }
  const data:any = await r.json().catch(()=>null);
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // まずは“落とさない”運用：needs_review 判定は後で強化
  return json({ qc_status: "ok", qc_reason: out || null });
};
