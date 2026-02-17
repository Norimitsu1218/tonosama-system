export type GuestLocale = "ja" | "en" | "fr" | "zh";

const LEGACY_LOCALE_MAP: Record<string, GuestLocale> = {
  "09": "en"
};

export function isGuestLocale(value: string): value is GuestLocale {
  return value === "ja" || value === "en" || value === "fr" || value === "zh";
}

export function normalizeGuestLocale(raw: string | null | undefined): GuestLocale {
  if (!raw) {
    return "en";
  }
  if (isGuestLocale(raw)) {
    return raw;
  }
  return LEGACY_LOCALE_MAP[raw] ?? "en";
}

