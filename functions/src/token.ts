import { createHmac, timingSafeEqual } from "node:crypto";

type PaymentStatus = "PAID" | "TRIAL" | "NG";

type GatePayload = {
  aud: "guest";
  storeId: string;
  paymentStatus: PaymentStatus;
  iat: number;
  exp: number;
};

function signPayload(payloadEncoded: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
}

function secureCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function decodePayload(encoded: string): GatePayload | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<GatePayload>;
    if (
      parsed.aud !== "guest" ||
      (parsed.paymentStatus !== "PAID" && parsed.paymentStatus !== "TRIAL" && parsed.paymentStatus !== "NG") ||
      typeof parsed.storeId !== "string" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return parsed as GatePayload;
  } catch {
    return null;
  }
}

export function issueGateToken(payload: GatePayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signPayload(encoded, secret)}`;
}

export function verifyGateToken(
  token: string,
  secret: string,
  expectedStoreId: string | undefined,
  nowEpoch: number
): GatePayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }
  const expected = signPayload(encoded, secret);
  if (!secureCompare(signature, expected)) {
    return null;
  }
  const payload = decodePayload(encoded);
  if (!payload) {
    return null;
  }
  if (payload.aud !== "guest") {
    return null;
  }
  if (expectedStoreId && payload.storeId !== expectedStoreId) {
    return null;
  }
  if (payload.exp <= nowEpoch || payload.iat > nowEpoch + 30) {
    return null;
  }
  return payload;
}

export type { GatePayload, PaymentStatus };
