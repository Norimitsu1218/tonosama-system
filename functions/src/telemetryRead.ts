import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { verifyOwnerRequest } from "./ownerAuth";
import { getOwnerClientHash, isOwnerRateLimited } from "./ownerRateLimit";

type RangeType = "today" | "yesterday" | "7d" | "30d";

type DailyCounters = {
  gate_allowed: number;
  consent: number;
  okami_ask: number;
  okami_api: number;
  okami_blocked: number;
  okami_fallback: number;
  okami_rate_limited: number;
  tray_add: number;
  slip: number;
  sumimasen: number;
  mood_hungry: number;
  mood_relax: number;
  mood_adventure: number;
};

type RateMetrics = {
  consent_rate: number;
  order_intent_rate: number;
  call_staff_rate: number;
};

type DailyRow = DailyCounters &
  RateMetrics & {
    date: string;
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

function floorRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export function expandRangeDates(range: RangeType, now = new Date()): Date[] {
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

export function computeRates(counters: DailyCounters): RateMetrics {
  return {
    consent_rate: floorRate(counters.consent, counters.gate_allowed),
    order_intent_rate: floorRate(counters.slip, counters.consent),
    call_staff_rate: floorRate(counters.sumimasen, counters.slip)
  };
}

function emptyCounters(): DailyCounters {
  return {
    gate_allowed: 0,
    consent: 0,
    okami_ask: 0,
    okami_api: 0,
    okami_blocked: 0,
    okami_fallback: 0,
    okami_rate_limited: 0,
    tray_add: 0,
    slip: 0,
    sumimasen: 0,
    mood_hungry: 0,
    mood_relax: 0,
    mood_adventure: 0
  };
}

function normalizeDailyCounters(input: unknown): DailyCounters {
  if (typeof input !== "object" || input === null) {
    return emptyCounters();
  }
  const row = input as Record<string, unknown>;
  return {
    gate_allowed: readNumber(row.gate_allowed),
    consent: readNumber(row.consent),
    okami_ask: readNumber(row.okami_ask),
    okami_api: readNumber(row.okami_api),
    okami_blocked: readNumber(row.okami_blocked),
    okami_fallback: readNumber(row.okami_fallback),
    okami_rate_limited: readNumber(row.okami_rate_limited),
    tray_add: readNumber(row.tray_add),
    slip: readNumber(row.slip),
    sumimasen: readNumber(row.sumimasen),
    mood_hungry: readNumber(row.mood_hungry),
    mood_relax: readNumber(row.mood_relax),
    mood_adventure: readNumber(row.mood_adventure)
  };
}

export const ownerTelemetry = onRequest({ cors: true }, async (req, res) => {
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

  const dates = expandRangeDates(range);
  const docs = await Promise.all(
    dates.map((date) => getFirestore().doc(`telemetry_daily/${storeId}_${toYmdCompact(date)}`).get())
  );

  const days: DailyRow[] = docs.map((doc, index) => {
    const counters = normalizeDailyCounters(doc.data());
    return {
      date: toYmd(dates[index]),
      ...counters,
      ...computeRates(counters)
    };
  });

  const totals = days.reduce<DailyCounters>(
    (acc, day) => ({
      gate_allowed: acc.gate_allowed + day.gate_allowed,
      consent: acc.consent + day.consent,
      okami_ask: acc.okami_ask + day.okami_ask,
      okami_api: acc.okami_api + day.okami_api,
      okami_blocked: acc.okami_blocked + day.okami_blocked,
      okami_fallback: acc.okami_fallback + day.okami_fallback,
      okami_rate_limited: acc.okami_rate_limited + day.okami_rate_limited,
      tray_add: acc.tray_add + day.tray_add,
      slip: acc.slip + day.slip,
      sumimasen: acc.sumimasen + day.sumimasen,
      mood_hungry: acc.mood_hungry + day.mood_hungry,
      mood_relax: acc.mood_relax + day.mood_relax,
      mood_adventure: acc.mood_adventure + day.mood_adventure
    }),
    emptyCounters()
  );

  res.status(200).json({
    storeId,
    range,
    days,
    totals: {
      ...totals,
      ...computeRates(totals)
    }
  });
});
