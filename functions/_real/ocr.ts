import type { Env } from "../_utils";

/**
 * realOcrExtract:
 * 画像/PDFを受け取り candidates を返す想定。
 * 今は stub。後で Google Vision / Textract / 何でも差し替え。
 */
export async function realOcrExtract(env: Env, input: {
  store_id: string;
  image_urls?: string[];
  pdf_url?: string;
}) {
  // TODO: replace with real OCR
  return [
    {
      store_id: input.store_id,
      item_id: `draft_${Date.now()}`,
      name_ja: "（OCR仮）ねぎま",
      price: 220,
      category: "焼き鳥",
      image_status: "none",
      ja18s_draft: "（OCR仮）香ばしい鶏ももと長ねぎを…（18秒文）",
      status: "needs_review",
      qc_status: "needs_review",
      qc_reason: "価格/部位の要確認",
      owner_approved: false,
      ja18s_final: "",
      translation_status: "idle"
    }
  ];
}
