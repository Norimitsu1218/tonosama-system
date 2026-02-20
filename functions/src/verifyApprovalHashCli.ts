import { applicationDefault, getApps, initializeApp, type Credential } from "firebase-admin/app";
import { GoogleAuth } from "google-auth-library";
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

function buildGoogleAuthCredential(): Credential {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  return {
    async getAccessToken() {
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token || !token.token) {
        throw new Error("missing_access_token");
      }
      return {
        access_token: token.token,
        expires_in: 3600,
      };
    },
  };
}

function ensureAdminApp(): void {
  if (getApps().length > 0) {
    return;
  }

  try {
    // Prefer ADC first. On some runners, firebase-admin rejects external_account
    // files via this path, so we fall back to GoogleAuth-based credentials.
    initializeApp({ credential: applicationDefault() });
  } catch {
    initializeApp({ credential: buildGoogleAuthCredential() });
  }
}

async function main() {
  const storeId = readStoreId();
  ensureAdminApp();

  const ok = await verifyStoreApprovalHashChain(storeId);
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
