"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeGuestLocale, type GuestLocale } from "../../../lib/guest-locale";
import { writeClickwrapSession } from "../../../lib/clickwrap-session";

type InfoEntryClientProps = {
  storeHash: string;
  initialLang: string | null;
};

const LANG_OPTIONS: Array<{ code: GuestLocale; label: string }> = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "fr", label: "Francais" },
  { code: "zh", label: "中文" }
];

export default function InfoEntryClient({ storeHash, initialLang }: InfoEntryClientProps) {
  const router = useRouter();
  const [consentChecked, setConsentChecked] = useState(false);
  const [lang, setLang] = useState<GuestLocale>(normalizeGuestLocale(initialLang));
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const ctaHref = useMemo(() => {
    const params = new URLSearchParams({ lang });
    return `/shops/menu/${encodeURIComponent(storeHash)}?${params.toString()}`;
  }, [lang, storeHash]);

  async function handleProceed() {
    if (!consentChecked || submitting) {
      return;
    }
    setSubmitting(true);
    setCheckoutError(null);
    writeClickwrapSession(storeHash, lang);

    try {
      const gateRes = await fetch(`/api/gate?storeId=${encodeURIComponent(storeHash)}`, {
        method: "GET",
        cache: "no-store"
      });
      if (!gateRes.ok) {
        setCheckoutError("gate unavailable");
        return;
      }
      const gateJson = (await gateRes.json()) as {
        allowed?: boolean;
        token?: string;
      };
      if (gateJson.allowed !== true || typeof gateJson.token !== "string") {
        setCheckoutError("store is not open for payment");
        return;
      }

      const checkoutRes = await fetch("/api/billing/checkout", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gateJson.token}`
        },
        body: JSON.stringify({ mood: "HUNGRY" })
      });
      if (!checkoutRes.ok) {
        setCheckoutError("checkout failed");
        return;
      }
      const checkoutJson = (await checkoutRes.json()) as {
        accepted?: boolean;
        checkoutRequired?: boolean;
        checkoutUrl?: string;
      };
      if (checkoutJson.accepted !== true) {
        setCheckoutError("checkout rejected");
        return;
      }
      if (checkoutJson.checkoutRequired && typeof checkoutJson.checkoutUrl === "string") {
        window.location.assign(checkoutJson.checkoutUrl);
        return;
      }
      router.replace(ctaHref);
    } catch {
      setCheckoutError("network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <section className="card flow-card">
        <p className="runtime-kicker">Info Layer</p>
        <h1>TONOSAMA / Info</h1>
        <p className="small">Store: {storeHash}</p>
        <p className="small">決済前の入口ページです。言語を選択し、規約に明示同意して次へ進みます。</p>
        <div className="locale-switch" aria-label="language switcher">
          {LANG_OPTIONS.map((option) => (
            <button
              key={option.code}
              className={`btn btn-quiet ${lang === option.code ? "is-active" : ""}`}
              type="button"
              onClick={() => setLang(option.code)}
              data-testid={`info-lang-${option.code}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="small">lang は ja/en/fr/zh に正規化します（legacy: 09 -&gt; en）。</p>
        <label className="checkline">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            data-testid="info-consent-checkbox"
          />
          <span>利用規約と注文フローに同意する（Clickwrap）</span>
        </label>
        <button
          className="btn btn-unlock"
          type="button"
          disabled={!consentChecked || submitting}
          onClick={() => {
            void handleProceed();
          }}
          data-testid="info-next-button"
        >
          {submitting ? "処理中..." : "翻訳メニューへ 198円"}
        </button>
        {checkoutError ? (
          <p className="small caution" data-testid="info-checkout-error">
            {checkoutError}
          </p>
        ) : null}
        <p className="small">
          Menu URL: <code>{ctaHref}</code>
        </p>
      </section>
    </main>
  );
}
