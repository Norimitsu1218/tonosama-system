import { Env, isMock, store, json, bad } from "../../_utils";

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const job_id = params.job_id as string;
  const job = store.jobs.get(job_id);
  if (!job) return bad("job not found", 404, "not_found");

  if (isMock(env)) {
    if (job.status === "running") {
      job.progress = Math.min(100, job.progress + 18);
      if (job.progress > 10) job.steps[0].done = true;
      if (job.progress > 45) job.steps[1].done = true;
      if (job.progress >= 100) {
        job.steps[2].done = true;
        job.status = "succeeded";
        job.candidates = [
          {
            item_id: "draft_001",
            name_ja: "ねぎま",
            price: 220,
            category: "焼き鳥",
            image_status: "none",
            ja18s_draft: "香ばしい鶏ももと長ねぎを…（18秒文）",
            status: "needs_review",
            qc_status: "needs_review",
            qc_reason: "価格/部位の要確認"
          }
        ];
      }
      store.jobs.set(job_id, job);
    }
    return json({ ...job, candidates: job.candidates || [] });
  }

  return json({ ...job, candidates: job.candidates || [] });
};
