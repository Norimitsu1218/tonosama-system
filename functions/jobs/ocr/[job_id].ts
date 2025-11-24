import { Env, isMock, store, json, bad } from "../../_utils";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const job_id = String(params.job_id || "");
  const job = store.jobs.get(job_id);
  if (!job) return bad(404, "JOB_NOT_FOUND", "job not found");

  if (isMock(env) && job.status === "running") {
    job.progress = Math.min(100, (job.progress || 0) + 25);
    if (job.progress >= 100) {
      job.status = "succeeded";
      job.steps.forEach((s:any)=>s.done=true);
    } else {
      const idx = Math.floor((job.progress||0)/34);
      job.steps.forEach((s:any,i:number)=>s.done=i<idx);
    }
    store.jobs.set(job_id, job);
  }

  return json({ ...job, candidates: job.candidates || [] });
};
