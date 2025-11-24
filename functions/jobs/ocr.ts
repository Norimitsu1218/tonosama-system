import { Env, store, json, bad, isMock } from "../_utils";
import { realUpsertMenuItem } from "../_real/store";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=> ({} as any));
  const store_id = body.store_id || "store_dev_0001";
  const job_id = `ocr_${Date.now()}`;

  const job:any = {
    job_id,
    status: "running",
    progress: 0,
    steps: [
      { label: "OCR中", done:false },
      { label: "品目抽出中", done:false },
      { label: "18秒文候補生成中", done:false }
    ],
    candidates: [
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
        owner_approved:false,
        ja18s_final:"",
        translation_status:"idle"
      }
    ],
    error_code: null
  };

  if (isMock(env)) {
    store.jobs.set(job_id, job);
    // mock seed
    job.candidates.forEach((c:any)=>{
      const exists = store.menu.find((x:any)=>x.item_id===c.item_id);
      if(!exists) store.menu.push(c);
    });
    return json({ job_id, status: job.status });
  }

  // real: candidatesをKVへseed（次で本物OCRに置換）
  // input があれば adapter で candidates を上書き
  try {
    const body = await request.json().catch(()=>null) as any;
    const hasInput = body?.image_urls?.length || body?.pdf_url;
    if (hasInput) {
      const { realOcrExtract } = await import("../_real/ocr");
      job.candidates = await realOcrExtract(env, {
        store_id,
        image_urls: body.image_urls,
        pdf_url: body.pdf_url
      });
    }
  } catch (e) {
    // ignore input parse errors
  }

  for (const c of job.candidates) {
    await realUpsertMenuItem(env, store_id, c);
  }
  return json({ job_id, status: job.status });
};
