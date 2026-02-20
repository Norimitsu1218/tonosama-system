import { Firestore } from "@google-cloud/firestore";
import { computeApprovalHash, type ApprovalAction, type ApprovalChainPayload } from "./auditHashCore";

function readStoreId(): string {
  const arg = process.argv.slice(2).find((value) => value.startsWith("--storeId="));
  if (arg) {
    return arg.replace("--storeId=", "");
  }
  const fromEnv = process.env.STORE_ID;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  throw new Error("missing_store_id");
}

async function verifyStoreApprovalHashChainWithFirestore(storeId: string): Promise<boolean> {
  const db = new Firestore();
  const snapshot = await db
    .collection("approval_log")
    .where("storeId", "==", storeId)
    .get();


  const docs = [...snapshot.docs].sort((a, b) => {
    const aMs = Number(a.get("createdAtMs") ?? 0);
    const bMs = Number(b.get("createdAtMs") ?? 0);
    return aMs - bMs;
  });

  let prevHash = "GENESIS";
  for (const row of docs) {
    const payload: ApprovalChainPayload = {
      actor: "owner",
      action: row.get("action") as ApprovalAction,
      storeId: String(row.get("storeId")),
      itemId: (row.get("itemId") as string | null) ?? null,
      reason: (row.get("reason") as string | null) ?? null,
      sourceHash: (row.get("sourceHash") as string | null) ?? null,
      intent: String(row.get("intent")),
      allowed_use: String(row.get("allowed_use")),
      createdAtMs: Number(row.get("createdAtMs")),
    };

    const expected = computeApprovalHash(prevHash, payload);
    if (row.get("prevHash") !== prevHash || row.get("hash") !== expected) {
      return false;
    }
    prevHash = expected;
  }
  return true;
}

async function main() {
  const storeId = readStoreId();
  const ok = await verifyStoreApprovalHashChainWithFirestore(storeId);
  if (!ok) {
    process.stderr.write(`approval hash chain verification failed for storeId=${storeId}\n`);
    process.exit(1);
  }
  process.stdout.write(`approval hash chain is valid for storeId=${storeId}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(String((error as Error)?.stack ?? error) + "\n");
  process.exit(1);
});
