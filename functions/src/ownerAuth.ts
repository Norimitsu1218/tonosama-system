import { getFirestore } from "firebase-admin/firestore";

type OwnerRequest = {
  header(name: string): string | undefined;
};

function readOwnerToken(req: OwnerRequest): string | null {
  const raw = req.header("x-owner-token");
  if (!raw) {
    return null;
  }
  return raw.trim().length > 0 ? raw.trim() : null;
}

function readNonce(req: OwnerRequest): string | null {
  const raw = req.header("x-req-nonce");
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function readTimestamp(req: OwnerRequest): number | null {
  const raw = req.header("x-req-ts");
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export async function verifyOwnerRequest(
  req: OwnerRequest,
  storeId: string
): Promise<{ ok: true } | { ok: false; status: 403 | 409 }> {
  const expected = process.env.OWNER_API_TOKEN;
  if (!expected || expected.trim().length === 0) {
    return { ok: false, status: 403 };
  }
  const provided = readOwnerToken(req);
  if (!provided) {
    return { ok: false, status: 403 };
  }
  if (provided !== expected) {
    return { ok: false, status: 403 };
  }

  const ts = readTimestamp(req);
  const nonce = readNonce(req);
  if (ts === null || nonce === null) {
    return { ok: false, status: 403 };
  }
  if (Math.abs(Date.now() - ts) > 5 * 60_000) {
    return { ok: false, status: 403 };
  }

  try {
    await getFirestore().doc(`control/nonces/${nonce}`).create({
      storeId,
      createdAtMs: ts
    });
    return { ok: true };
  } catch {
    return { ok: false, status: 409 };
  }
}
