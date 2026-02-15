import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { verifyOwnerRequest } from "./ownerAuth";
import { getOwnerClientHash, isOwnerRateLimited } from "./ownerRateLimit";

type RangeType = "today" | "yesterday" | "7d" | "30d";

type DailyCounters = {
  checkout_completed_count: number;
  checkout_completed_amount: number;
  gate_allowed: number;
};

type DailyRow = DailyCounters & {
  date: string;
  avg_amount_per_checkout: number;
  checkout_per_gate_rate: number;
};

function isValidStoreId(storeId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(storeId);
}

function parseRange(value: unknown): RangeType | null {
  if (value === "today" || value === "yesterday" || value === "7d" || value === "30d") {
    return value;
  }
  return null;
}

function toYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toYmdCompact(date: Date): string {
  return toYmd(date).replaceAll("-", "");
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export function expandBillingRangeDates(range: RangeType, now = new Date()): Date[] {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "today") {
    return [base];
  }
  if (range === "yesterday") {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 1);
    return [d];
  }
  const days = range === "30d" ? 30 : 7;
  const out: Date[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - offset);
    out.push(d);
  }
  return out;
}

function emptyCounters(): DailyCounters {
  return {
    checkout_completed_count: 0,
    checkout_completed_amount: 0,
    gate_allowed: 0
  };
}

function normalizeDailyCounters(input: unknown): DailyCounters {
  if (typeof input !== "object" || input === null) {
    return emptyCounters();
  }
  const row = input as Record<string, unknown>;
  return {
    checkout_completed_count: readNumber(row.checkout_completed_count),
    checkout_completed_amount: readNumber(row.checkout_completed_amount),
    gate_allowed: readNumber(row.gate_allowed)
  };
}

export function computeAvgAmount(counters: DailyCounters): number {
  if (counters.checkout_completed_count <= 0) {
    return 0;
  }
  return Math.round((counters.checkout_completed_amount / counters.checkout_completed_count) * 100) / 100;
}

export function computeCheckoutPerGateRate(counters: DailyCounters): number {
  if (counters.gate_allowed <= 0) {
    return 0;
  }
  return Math.round((counters.checkout_completed_count / counters.gate_allowed) * 10000) / 10000;
}

export const ownerBillingStatus = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const storeId = req.query.storeId;
  const rangeRaw = req.query.range;
  if (typeof storeId !== "string" || !isValidStoreId(storeId)) {
    res.status(400).json({ error: "invalid_store_id" });
    return;
  }
  const range = parseRange(rangeRaw);
  if (!range) {
    res.status(400).json({ error: "invalid_range" });
    return;
  }

  const auth = await verifyOwnerRequest(req, storeId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }
  const clientHash = getOwnerClientHash(req);
  if (isOwnerRateLimited(storeId, clientHash)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const dates = expandBillingRangeDates(range);
  const billingDocs = await Promise.all(
    dates.map((date) => getFirestore().doc(`billing_daily/${storeId}_${toYmdCompact(date)}`).get())
  );
  const telemetryDocs = await Promise.all(
    dates.map((date) => getFirestore().doc(`telemetry_daily/${storeId}_${toYmdCompact(date)}`).get())
  );

  const days: DailyRow[] = billingDocs.map((doc, index) => {
    const counters = normalizeDailyCounters(doc.data());
    const telemetry = telemetryDocs[index].data() as Record<string, unknown> | undefined;
    counters.gate_allowed = readNumber(telemetry?.gate_allowed);
    return {
      date: toYmd(dates[index]),
      ...counters,
      avg_amount_per_checkout: computeAvgAmount(counters),
      checkout_per_gate_rate: computeCheckoutPerGateRate(counters)
    };
  });

  const totals = days.reduce<DailyCounters>(
    (acc, day) => ({
      checkout_completed_count: acc.checkout_completed_count + day.checkout_completed_count,
      checkout_completed_amount: acc.checkout_completed_amount + day.checkout_completed_amount,
      gate_allowed: acc.gate_allowed + day.gate_allowed
    }),
    emptyCounters()
  );

  res.status(200).json({
    storeId,
    range,
    days,
    totals: {
      ...totals,
      avg_amount_per_checkout: computeAvgAmount(totals),
      checkout_per_gate_rate: computeCheckoutPerGateRate(totals)
    }
  });
});
