import { Env } from "../_utils";

type Translations = Record<string, { name: string; desc: string }>;

const LANG_KEYS = [
  "en","ko","zh_hans","zh_hant","zh_yue","th","tl","vi","id","es","de","fr","it","pt"
];

function mustTranslationsShape(x:any): asserts x is { translations: Translations } {
  if (!x || typeof x !== "object" || !x.translations || typeof x.translations !== "object") {
    throw new Error("LLM_INVALID_JSON: missing translations");
  }
  for (const k of LANG_KEYS) {
    const v = x.translations[k];
    if (!v || typeof v.name !== "string" || typeof v.desc !== "string") {
      throw new Error(`LLM_INVALID_JSON: translations.${k} shape invalid`);
    }
  }
}

function buildPrompt(item:any){
  const nameJA = item?.name_ja || "";
  const price = item?.price ?? "";
  const category = item?.category || "";
  const ja18 = item?.ja18s_final || item?.ja18s_draft || "";

  return [
    "あなたは日本の焼き鳥店の多言語メニュー編集長AI。翻訳ではなく文化ローカライズ意訳を行う。",
    "必ず次の厳格JSONのみで返す。余計な文字、コードフェンス禁止。",
    "",
    "【入力】",
    `品名(日本語): ${nameJA}`,
    `価格(JPY): ${price}`,
    `カテゴリ: ${category}`,
    `18秒文(日本語): ${ja18}`,
    "",
    "【出力JSONスキーマ】",
    "{",
    '  "translations": {',
    '    "en": {"name":"", "desc":""},',
    '    "ko": {"name":"", "desc":""},',
    '    "zh_hans": {"name":"", "desc":""},',
    '    "zh_hant": {"name":"", "desc":""},',
    '    "zh_yue": {"name":"", "desc":""},',
    '    "th": {"name":"", "desc":""},',
    '    "tl": {"name":"", "desc":""},',
    '    "vi": {"name":"", "desc":""},',
    '    "id": {"name":"", "desc":""},',
    '    "es": {"name":"", "desc":""},',
    '    "de": {"name":"", "desc":""},',
    '    "fr": {"name":"", "desc":""},',
    '    "it": {"name":"", "desc":""},',
    '    "pt": {"name":"", "desc":""}',
    "  }",
    "}",
    "",
    "【品質条件】",
    "- 各言語: 18秒黙読相当の短さ（目安100-160文字程度 / 言語により自然な範囲で）",
    "- CROP必須: 外観/食感/味(安全性含む)/軽いCTA",
    "- 初出のyakitoriは短く説明、動物名・部位名を明記",
    "- 数値はローカライズ表記、誇張禁止",
    "",
    "ではJSONのみで出力せよ。"
  ].join("\n");
}

async function geminiGenerate(env:Env, prompt:string){
  const key = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  if (!key) throw new Error("GEMINI_API_KEY missing");

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
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

  const data:any = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("") || "";

  const jsonStr = text.match(/\{[\s\S]*\}/)?.[0] || "{}";
  const parsed = JSON.parse(jsonStr);
  mustTranslationsShape(parsed);
  return parsed;
}

// 将来Claude対応：LLM_PROVIDER=claude でここに分岐させるだけ
async function claudeGenerate(_env:Env, _prompt:string){
  throw new Error("CLAUDE_ADAPTER_NOT_IMPLEMENTED_YET");
}

export async function llmTranslateItem(env:Env, item:any){
  const provider = (env.LLM_PROVIDER || "gemini").toLowerCase();
  const prompt = buildPrompt(item);

  if (provider === "claude") {
    return claudeGenerate(env, prompt);
  }
  return geminiGenerate(env, prompt);
}
