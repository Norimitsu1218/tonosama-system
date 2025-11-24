import { Env, json, bad, isMock } from "../_utils";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null);
  if (!body) return bad(400,"BAD_JSON","invalid json");
  if (isMock(env)) return json({ qc_status:"ok", qc_reason:null });

  // real: TODO call Gemini API
  // env.GEMINI_API_KEY / env.GEMINI_MODEL をPagesの環境変数で渡す
  return bad(501,"REAL_QC_NOT_IMPLEMENTED","gemini qc not implemented yet");
};
