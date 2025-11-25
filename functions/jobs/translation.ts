import { Env, store, json, isMock, bad } from "../_utils";
import { realGetMenu, realUpsertMenuItem } from "../_real/store";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  if (!body?.store_id || !Array.isArray(body.items)) {
    return bad(422, "INVALID", "store_id/items required");
  }

  if (isMock(env)) {
    body.items.forEach((it:any)=>{
      const i = store.menu.findIndex(x=>x.item_id===it.item_id);
      if (i>=0) store.menu[i].translation_status="queued";
    });
    return json({ status: "queued", count: body.items.length });
  }

  const menu = await realGetMenu(env, body.store_id);
  const totalItems = menu.length;
  const approvedCount = menu.filter((x:any) => x.owner_approved === true).length;
  const qcOkItems = menu.filter((x:any) => String(x.qc_status || "").toLowerCase() === "ok");
  const qcOkCount = qcOkItems.length;
  const ja18sNonemptyCount = menu.filter((x:any) => Boolean(x.ja18s_final)).length;

  const eligible = menu.filter((x:any) =>
    x.owner_approved === true &&
    String(x.qc_status || "").toLowerCase() === "ok" &&
    Boolean(x.ja18s_final)
  );

  const eligibleSample = eligible.slice(0,3).map((it:any) => ({
    item_id: it.item_id,
    owner_approved: it.owner_approved,
    qc_status: it.qc_status,
    ja18s_final: it.ja18s_final,
  }));

  let queuedCount = 0;
  for (const it of body.items) {
    const item = menu.find((x:any)=>x.item_id===it.item_id);
    if (!item) continue;
    if (item.qc_status !== "ok" || item.owner_approved !== true || !item.ja18s_final) continue;

    const merged = { ...item, translation_status: "queued", translation_error: null };
    await realUpsertMenuItem(env, body.store_id, merged);
    queuedCount++;
  }

  return json({
    status:"queued",
    count: queuedCount,
    total_items: totalItems,
    approved_count: approvedCount,
    qc_ok_count: qcOkCount,
    ja18s_final_nonempty_count: ja18sNonemptyCount,
    eligible_count: eligible.length,
    eligible_sample: eligibleSample,
  });
};
