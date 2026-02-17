import { isGuestLocale, type GuestLocale } from "./guest-locale";

type ClickwrapSession = {
  acceptedAt: number;
  lang: GuestLocale;
};

const CLICKWRAP_TTL_MS = 2 * 60 * 60 * 1000;

function clickwrapKey(storeId: string): string {
  return `tonosama_clickwrap_${storeId}`;
}

export function writeClickwrapSession(storeId: string, lang: GuestLocale): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: ClickwrapSession = {
    acceptedAt: Date.now(),
    lang
  };
  window.sessionStorage.setItem(clickwrapKey(storeId), JSON.stringify(payload));
}

export function readClickwrapSession(storeId: string): ClickwrapSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(clickwrapKey(storeId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ClickwrapSession>;
    const candidateLang = parsed.lang;
    if (!parsed || typeof parsed.acceptedAt !== "number" || !candidateLang || !isGuestLocale(candidateLang)) {
      return null;
    }
    if (Date.now() - parsed.acceptedAt > CLICKWRAP_TTL_MS) {
      return null;
    }
    return { acceptedAt: parsed.acceptedAt, lang: candidateLang };
  } catch {
    return null;
  }
}
