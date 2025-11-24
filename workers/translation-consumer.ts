export interface Env {
  TRANSLATION_Q: Queue;
  MENU_KV: KVNamespace;
  PAYMENT_KV: KVNamespace;
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

export default {
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { store_id, item_id } = msg.body || {};
      if (!store_id || !item_id) { msg.ack(); continue; }

      // TODO: ここで Claude 14言語生成 → MENU_KV 更新
      // いまは“消費した”だけログに残すスタブ
      console.log("[translation-consumer] got", store_id, item_id);

      msg.ack();
    }
  }
} satisfies ExportedHandler<Env>;
