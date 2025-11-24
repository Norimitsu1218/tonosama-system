// CP3-TRUTH: truth-preserving merge-upsert + defaults

export function canonicalDefaults(item: any) {
  item.owner_approved ??= false;
  item.qc_status ??= "needs_review";
  item.qc_reason ??= null;
  item.ja18s_final ??= "";
  item.translation_status ??= "idle";
  item.translations ??= item.translations || {};
  return item;
}

// prev を壊さないアップサート（incomingの未指定/NULLはprevを保持）
export function mergeUpsert(prev: any, incoming: any) {
  const next = { ...(prev || {}), ...(incoming || {}) };

  const truthKeys = [
    "owner_approved",
    "qc_status",
    "qc_reason",
    "ja18s_final",
    "translation_status",
    "translations",
  ];

  for (const k of truthKeys) {
    if (incoming?.[k] === undefined || incoming?.[k] === null) {
      next[k] = prev?.[k];
    }
  }
  return canonicalDefaults(next);
}
