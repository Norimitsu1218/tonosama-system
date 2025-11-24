import { Env, isMock, store, json } from "../_utils";

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  const job_id = "ocr_" + Date.now();
  const job = {
    job_id,
    status: "running",
    progress: 0,
    steps: [
      { label: "OCR中", done: false },
      { label: "品目抽出中", done: false },
      { label: "18秒文候補生成中", done: false },
    ],
    candidates: [],
    error_code: null,
  };

  if (isMock(env)) {
    // mock candidates
    job.candidates = [{
      item_id: "draft_001",
      name_ja: "ねぎま",
      price: 220,
      category: "焼き鳥",
      image_status: "none",
      ja18s_draft: "香ばしい鶏ももと長ねぎを…（18秒文）",
      status: "needs_review",
      qc_status: "needs_review",
      qc_reason: "価格/部位の要確認"
    }];
  }

  store.jobs.set(job_id, job);
  return json({ job_id, status: job.status });
};
