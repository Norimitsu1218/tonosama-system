type Mood = "HUNGRY" | "RELAX" | "ADVENTURE";

export type BillingFlipResult = {
  accepted: boolean;
  mode: "STORE_PAYS" | "GUEST_PAYS";
  amountYen: number;
  mood: Mood;
  idempotencyKey: string;
};

export type BillingCheckoutResult = {
  accepted: boolean;
  mode: "STORE_PAYS" | "GUEST_PAYS";
  amountYen: number;
  checkoutRequired: boolean;
  checkoutUrl?: string;
  checkoutSessionId?: string;
  idempotencyKey: string;
};

export async function runBillingFlip(token: string | null, mood: Mood): Promise<BillingFlipResult | null> {
  if (!token) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch("/api/billing/flip", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ mood }),
      signal: controller.signal
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as BillingFlipResult;
    if (!json.accepted) {
      return null;
    }
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runBillingCheckout(token: string | null, mood: Mood): Promise<BillingCheckoutResult | null> {
  if (!token) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ mood }),
      signal: controller.signal
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as BillingCheckoutResult;
    if (!json.accepted) {
      return null;
    }
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
