import { getApps, initializeApp } from "firebase-admin/app";
import { verifyStoreApprovalHashChain } from "./auditHash";

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

async function main() {
  const storeId = readStoreId();
  if (getApps().length === 0) {
    initializeApp();
  }
  const ok = await verifyStoreApprovalHashChain(storeId);
  if (!ok) {
    process.stderr.write(`approval hash chain verification failed for storeId=${storeId}\n`);
    process.exit(1);
  }
  process.stdout.write(`approval hash chain is valid for storeId=${storeId}\n`);
}

void main();
