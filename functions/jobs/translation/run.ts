import { Env, json, isMock, bad } from "../../_utils";
import { realGetMenu, realUpsertMenuItem } from "../../_real/store";

// Free用：queued を同期で一括処理（今はスタブで done にする）
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  const store_id = body?.store_id;
  if (!store_id) return bad(422, "INVALID", "store_id required");

  // mock: 何もしないで OK
  if (isMock(env)) return json({ drained: 0, note: "mock skip" });

  const menu = await realGetMenu(env, store_id);
  const queued = menu.filter((x:any)=>x.translation_status==="queued");
  let drained = 0;

  for (const item of queued) {
    // TODO: Claude 14言語生成（Paid/Queues移行時にここをconsumerへ）
    item.translation_status = "done";
    drained++;
    await realUpsertMenuItem(env, store_id, item);
  }

  return json({ drained, note:"free drain stub -> marked done" });
};
