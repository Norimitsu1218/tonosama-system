import { onRequest } from "firebase-functions/v2/https";
import { verifyGateToken } from "./token";
import { readStoreBundle } from "./storeData";
import { evaluateKillSwitch } from "./killSwitch";

function isValidStoreId(storeId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(storeId);
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

export const storeBundle = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const storeId = req.query.storeId;
  if (typeof storeId !== "string" || !isValidStoreId(storeId)) {
    res.status(400).json({ error: "invalid_store_id" });
    return;
  }

  const killSwitch = await evaluateKillSwitch(storeId);
  if (killSwitch.blocked) {
    res.status(403).json({ error: "kill_switch_blocked" });
    return;
  }

  const secret = process.env.GATE_TOKEN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "bundle_not_ready" });
    return;
  }

  const bearer = parseBearerToken(req.header("authorization"));
  if (!bearer) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const verified = verifyGateToken(bearer, secret, storeId, Math.floor(Date.now() / 1000));
  if (!verified) {
    res.status(403).json({ error: "invalid_token" });
    return;
  }

  try {
    const bundle = await readStoreBundle(storeId);
    const etag = `"${bundle.bundleVersion}"`;
    const ifNoneMatch = req.header("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.set("Cache-Control", "private, max-age=30");
      res.set("ETag", etag);
      res.status(304).end();
      return;
    }
    res.set("Cache-Control", "private, max-age=30");
    res.set("ETag", etag);
    res.status(200).json(bundle);
  } catch {
    res.status(503).json({ error: "bundle_unavailable" });
  }
});
