export type BatchJobMeta = {
  batch_id: string;
  chunk_id: number;
  chunk_size: number;
  attempt: number;
  next_retry_at: number; // epoch ms
};

export function makeBatchId(store_id: string) {
  return `batch_${store_id}_${Date.now()}`;
}

export function chunkify<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function backoffMs(attempt: number) {
  const base = 60_000; // 1min
  const cap  = 6 * 60 * 60_000; // 6h cap
  const ms = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(ms, cap);
}

export function dueNow(meta?: Partial<BatchJobMeta>) {
  const t = meta?.next_retry_at ?? 0;
  return Date.now() >= t;
}
