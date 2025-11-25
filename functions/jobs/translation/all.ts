import { realGetMenu, realUpsertMenuItem } from "../../_real/menu";
import { makeBatchId, chunkify } from "../../lib/batch";

export const onRequestPost: PagesFunction = async (ctx) => {
  const { request, env } = ctx;
  const { store_id } = await request.json<any>();
  if (!store_id) return new Response("store_id required", { status: 400 });

  const menu = await realGetMenu(env as any, store_id);
  const items = (menu.items || [])
    .filter((it: any) => it.owner_approved === true && it.qc_status === "ok");

  const chunkSize = Number((env as any).BATCH_CHUNK_SIZE || 20);
  const chunks = chunkify(items, chunkSize);
  const batch_id = makeBatchId(store_id);

  let queued = 0;
  for (let c = 0; c < chunks.length; c++) {
    for (const it of chunks[c]) {
      const incoming = {
        translation_status: "queued",
        batch_id,
        chunk_id: c,
        chunk_size: chunkSize,
        attempt: 0,
        next_retry_at: 0,
      };
      await realUpsertMenuItem(env as any, store_id, it.item_id, incoming);
      queued++;
    }
  }

  return Response.json({ debug, { status: "queued", count: queued, batch_id, chunks: chunks.length });
};
