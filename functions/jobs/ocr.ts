import { Env, store, json, bad, isMock } from "../_utils";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  // body optional (image urls etc). mock ignores mostly
  const body = await request.json().catch(()=>({}));

  const job_id = `ocr_${Date.now()}`;
  const job:any = {
    job_id,
    status: "running",
    progress: 0,
    steps: [
      { label: "OCR中", done: false },
      { label: "品目抽出中", done: false },
      { label: "18秒文候補生成中", done: false },
    ],
    candidates: [],
    error_code: null
  };

  if (isMock(env)) {
    const store_id = body.store_id || "store_dev_0001";

    job.candidates = [
      {
        store_id,
        item_id: "draft_001",
        name_ja: "ねぎま",
        price: 220,
        category: "焼き鳥",
        image_status: "none",
        ja18s_draft: "香ばしい鶏ももと長ねぎを…（18秒文）",
        status: "needs_review",
        qc_status: "needs_review",
        qc_reason: "価格/部位の要確認",
        owner_approved: false,
        ja18s_final: ""
      }
    ];

    // ★ seed mock MENU_MASTER drafts
    store.menu = store.menu || [];
    for (const c of job.candidates) {
      const exists = store.menu.find((x:any)=>x.item_id === c.item_id);
      if (!exists) store.menu.push({ ...c });
    }

    store.jobs.set(job_id, job);
  } else {
    // real: TODO kick OCR pipeline
    store.jobs.set(job_id, job);
  }

  return json({ job_id, status: job.status });
};
