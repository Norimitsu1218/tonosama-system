type EventName =
  | "gate_allowed"
  | "consent"
  | "mood"
  | "tray_add"
  | "slip"
  | "sumimasen";

type DailyEventStore = {
  day: string;
  counts: Record<EventName, number>;
};

const EVENT_KEY = "tonosama_guest_events_v1";
const BEHAVIOR_KEY = "tonosama_guest_behavior_v1";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyCounts(): Record<EventName, number> {
  return {
    gate_allowed: 0,
    consent: 0,
    mood: 0,
    tray_add: 0,
    slip: 0,
    sumimasen: 0
  };
}

function readStore(): DailyEventStore {
  if (typeof window === "undefined") {
    return { day: today(), counts: emptyCounts() };
  }
  const raw = window.localStorage.getItem(EVENT_KEY);
  if (!raw) {
    return { day: today(), counts: emptyCounts() };
  }
  try {
    const parsed = JSON.parse(raw) as DailyEventStore;
    if (!parsed || typeof parsed.day !== "string" || typeof parsed.counts !== "object") {
      window.localStorage.removeItem(EVENT_KEY);
      return { day: today(), counts: emptyCounts() };
    }
    if (parsed.day !== today()) {
      return { day: today(), counts: emptyCounts() };
    }
    return {
      day: parsed.day,
      counts: { ...emptyCounts(), ...parsed.counts }
    };
  } catch {
    window.localStorage.removeItem(EVENT_KEY);
    return { day: today(), counts: emptyCounts() };
  }
}

export function trackEvent(name: EventName): void {
  if (typeof window === "undefined") {
    return;
  }
  const current = readStore();
  current.counts[name] += 1;
  window.localStorage.setItem(EVENT_KEY, JSON.stringify(current));
}

export function trackBehaviorSample(input: { locale: string; dwellMs: number; scrollPx: number; orderedItems: number }): void {
  if (typeof window === "undefined") {
    return;
  }
  const day = today();
  const raw = window.localStorage.getItem(BEHAVIOR_KEY);
  const base =
    raw &&
    (() => {
      try {
        return JSON.parse(raw) as {
          day: string;
          samples: number;
          totalDwellMs: number;
          totalScrollPx: number;
          totalOrderedItems: number;
          localeCounts: Record<string, number>;
        };
      } catch {
        return null;
      }
    })();
  const next =
    base && base.day === day
      ? base
      : {
          day,
          samples: 0,
          totalDwellMs: 0,
          totalScrollPx: 0,
          totalOrderedItems: 0,
          localeCounts: {} as Record<string, number>
        };
  next.samples += 1;
  next.totalDwellMs += Math.max(0, input.dwellMs);
  next.totalScrollPx += Math.max(0, input.scrollPx);
  next.totalOrderedItems += Math.max(0, input.orderedItems);
  next.localeCounts[input.locale] = (next.localeCounts[input.locale] ?? 0) + 1;
  window.localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(next));
}
