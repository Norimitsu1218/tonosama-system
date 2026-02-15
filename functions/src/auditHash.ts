import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { computeApprovalHash, type ApprovalAction, type ApprovalChainPayload } from "./auditHashCore";

export type ApprovalEntryInput = {
  actor: "owner";
  action: ApprovalAction;
  storeId: string;
  itemId?: string | null;
  reason?: string | null;
  sourceHash?: string | null;
  intent: string;
  allowed_use: string;
};

export async function appendApprovalLogEntry(input: ApprovalEntryInput): Promise<{ id: string; hash: string }> {
  const db = getFirestore();
  const latest = await db
    .collection("approval_log")
    .where("storeId", "==", input.storeId)
    .orderBy("createdAtMs", "desc")
    .limit(1)
    .get();

  const prevHash = latest.empty ? "GENESIS" : String(latest.docs[0].get("hash") ?? "GENESIS");
  const createdAtMs = Date.now();
  const payload: ApprovalChainPayload = {
    actor: input.actor,
    action: input.action,
    storeId: input.storeId,
    itemId: input.itemId ?? null,
    reason: input.reason ?? null,
    sourceHash: input.sourceHash ?? null,
    intent: input.intent,
    allowed_use: input.allowed_use,
    createdAtMs
  };
  const hash = computeApprovalHash(prevHash, payload);
  const docRef = db.collection("approval_log").doc();
  await docRef.set({
    ...payload,
    prevHash,
    hash,
    ts: FieldValue.serverTimestamp()
  });
  return { id: docRef.id, hash };
}

export async function verifyStoreApprovalHashChain(storeId: string): Promise<boolean> {
  const snapshot = await getFirestore()
    .collection("approval_log")
    .where("storeId", "==", storeId)
    .orderBy("createdAtMs", "asc")
    .get();
  let prevHash = "GENESIS";
  for (const row of snapshot.docs) {
    const payload: ApprovalChainPayload = {
      actor: "owner",
      action: row.get("action") as ApprovalAction,
      storeId: String(row.get("storeId")),
      itemId: (row.get("itemId") as string | null) ?? null,
      reason: (row.get("reason") as string | null) ?? null,
      sourceHash: (row.get("sourceHash") as string | null) ?? null,
      intent: String(row.get("intent")),
      allowed_use: String(row.get("allowed_use")),
      createdAtMs: Number(row.get("createdAtMs"))
    };
    const expected = computeApprovalHash(prevHash, payload);
    if (row.get("prevHash") !== prevHash || row.get("hash") !== expected) {
      return false;
    }
    prevHash = expected;
  }
  return true;
}

export { computeApprovalHash };
