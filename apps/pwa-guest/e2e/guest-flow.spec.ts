import { expect, test } from "@playwright/test";

test("guest flow reaches SUMIMASEN", async ({ page }) => {
  const telemetryEvents: string[] = [];

  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    const auth = await route.request().headerValue("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      await route.fulfill({ status: 401, contentType: "application/json", body: "{\"error\":\"missing_token\"}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: {
          liabilityAccepted: { allergy: true, religion: true }
        },
        menuItems: [
          { id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] },
          { id: "tea", name: "焙じ茶ラテ", price: 620, tags: ["RELAX"] }
        ],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["ADVENTURE"] }]
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    const body = route.request().postDataJSON() as { event?: string } | null;
    if (body?.event) {
      telemetryEvents.push(body.event);
    }
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await expect(page.getByTestId("gate-state")).toHaveText("gate: allowed");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("add-ramen").click();
  await page.getByTestId("tray-inc-ramen").click();
  await page.getByTestId("tray-dec-ramen").click();

  await expect(page.getByTestId("order-button")).toBeEnabled();
  await page.getByTestId("order-button").click();
  await expect(page.getByTestId("slip-no")).toContainText("No: S-");
  await expect(page.getByText("At:", { exact: false })).toBeVisible();
  await page.getByTestId("to-sumimasen-button").click();

  await expect(page.getByTestId("sumimasen-button")).toBeVisible();
  await expect.poll(() => telemetryEvents.length).toBeGreaterThanOrEqual(3);
  expect(telemetryEvents).toContain("consent");
  expect(telemetryEvents).toContain("mood");
  expect(telemetryEvents).toContain("sumimasen");
});

test("guest flow reaches SUMIMASEN in mock mode", async ({ page }) => {
  await page.goto("/s/test123?mock=1");

  await page.getByTestId("payment-status-select").selectOption("PAID");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("add-ramen").click();
  await page.getByTestId("order-button").click();
  await page.getByTestId("to-sumimasen-button").click();

  await expect(page.getByTestId("sumimasen-button")).toBeVisible();
});

test("guest flow is blocked when gate returns 403", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "kill_switch_blocked" })
    });
  });

  await page.goto("/s/test123");
  await expect(page.getByTestId("blocked-title")).toBeVisible();
});

test("guest flow can retry gate after transient block", async ({ page }) => {
  let called = 0;
  await page.route("**/api/gate?storeId=test123", async (route) => {
    called += 1;
    if (called === 1) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary_block" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  const blocked = page.getByTestId("blocked-title");
  if (await blocked.isVisible().catch(() => false)) {
    await page.getByTestId("retry-gate-button").click();
  }
  await expect(page.getByTestId("consent-checkbox")).toBeVisible();
});

test("guest respects lang query for initial locale", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123?lang=fr");
  await expect(page.getByText("Locale: FR / Payment: PAID")).toBeVisible();
});

test("guest awakening blocks unlock when liability setting is incomplete", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: {
          liabilityAccepted: { allergy: false, religion: false }
        },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await expect(page.getByTestId("consent-next-button")).toBeDisabled();
  await expect(page.getByText("店舗側の免責設定が未完了")).toBeVisible();
});

test("basic list mode hides okami panel", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("basic-list-button").click();
  await expect(page.getByTestId("basic-list-hint")).toBeVisible();
  await expect(page.getByTestId("okami-input")).toHaveCount(0);
});

test("basic list mode is blocked without explicit consent", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.goto("/s/test123");
  await page.getByTestId("basic-list-button").click();
  await expect(page.getByTestId("basic-list-consent-required")).toBeVisible();
  await expect(page.getByTestId("basic-list-hint")).toHaveCount(0);
});

test("guest can retry bundle fetch after fallback", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  let bundleCalls = 0;
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    bundleCalls += 1;
    if (bundleCalls === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{\"error\":\"temporary\"}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "premium", name: "特選盛り", price: 2800, tags: ["ADVENTURE"] }],
        drinks: [{ id: "sake", name: "純米大吟醸", price: 1200, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-adventure").click();
  await expect(page.getByText("Store data unavailable", { exact: false })).toBeVisible();
  await expect(page.getByTestId("retry-bundle-button")).toBeVisible();
  await page.getByTestId("retry-bundle-button").click();
  await expect(page.getByText("特選盛り")).toBeVisible();
});

test("discovery sort changes order by price", async ({ page }) => {
  await page.goto("/s/test123?mock=1");
  await page.getByTestId("payment-status-select").selectOption("PAID");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("discovery-sort").selectOption("PRICE_DESC");
  await expect(page.locator(".menu-item").first()).toContainText("濃厚とんこつラーメン");
});

test("discovery sort persists after reload", async ({ page }) => {
  await page.goto("/s/test123?mock=1");
  await page.getByTestId("payment-status-select").selectOption("PAID");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("discovery-sort").selectOption("PRICE_ASC");
  await page.reload();
  await page.getByTestId("payment-status-select").selectOption("PAID");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await expect(page.getByTestId("discovery-sort")).toHaveValue("PRICE_ASC");
});

test("guest-pays mode shows checkout button and redirects on success response", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/billing/flip", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accepted: true,
        mode: "GUEST_PAYS",
        amountYen: 198,
        mood: "HUNGRY",
        idempotencyKey: "k1"
      })
    });
  });
  await page.route("**/api/billing/checkout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accepted: true,
        mode: "GUEST_PAYS",
        amountYen: 198,
        checkoutRequired: true,
        checkoutUrl: "/s/test123?checkout=success&session_id=cs_test",
        checkoutSessionId: "cs_test",
        idempotencyKey: "k2"
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await expect(page.getByTestId("billing-checkout-button")).toBeVisible();
  await page.getByTestId("billing-checkout-button").click();
  await expect(page).toHaveURL(/checkout=success/);
  await expect(page.getByText("Payment confirmed", { exact: false })).toBeVisible();
});

test("checkout cancel query shows cancel notice", async ({ page }) => {
  await page.goto("/s/test123?mock=1&checkout=cancel");
  await page.getByTestId("payment-status-select").selectOption("PAID");
  await expect(page.getByText("Payment canceled", { exact: false })).toBeVisible();
});

test("okami uses API classification and blocks on SECURITY", async ({ page }) => {
  const telemetryEvents: string[] = [];
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/okami/answer", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "SECURITY",
        text: "Safety check required.",
        blocked: true
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    const body = route.request().postDataJSON() as { event?: string } | null;
    if (body?.event) {
      telemetryEvents.push(body.event);
    }
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("okami-input").fill("allergy check");
  await page.getByTestId("okami-ask-button").click();
  await expect(page.getByTestId("sumimasen-button")).toBeVisible();
  expect(telemetryEvents).toContain("okami_ask");
  expect(telemetryEvents).toContain("okami_blocked");
});

test("okami shows api source label when API answer is used", async ({ page }) => {
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/okami/answer", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "RULE",
        text: "Rule answer",
        blocked: false
      })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("okami-input").fill("wifi?");
  await page.getByTestId("okami-ask-button").click();
  await expect(page.getByText("[RULE/api]", { exact: false })).toBeVisible();
});

test("okami falls back to local classification when API is unavailable", async ({ page }) => {
  const telemetryEvents: string[] = [];
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/okami/answer", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "okami_not_ready" })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    const body = route.request().postDataJSON() as { event?: string } | null;
    if (body?.event) {
      telemetryEvents.push(body.event);
    }
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("okami-input").fill("wifi?");
  await page.getByTestId("okami-ask-button").click();
  await expect(page.getByText("[RULE/fallback]", { exact: false })).toBeVisible();
  expect(telemetryEvents).toContain("okami_ask");
  expect(telemetryEvents).toContain("okami_fallback");
});

test("okami rate-limited path shows notice and emits telemetry", async ({ page }) => {
  const telemetryEvents: string[] = [];
  await page.route("**/api/gate?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        allowed: true,
        token: "token-for-e2e",
        exp: Math.floor(Date.now() / 1000) + 600,
        paymentStatus: "PAID"
      })
    });
  });
  await page.route("**/api/storeBundle?storeId=test123", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentStatus: "PAID",
        store: { liabilityAccepted: { allergy: true, religion: true } },
        menuItems: [{ id: "ramen", name: "濃厚とんこつラーメン", price: 980, tags: ["HUNGRY"] }],
        drinks: [{ id: "cola", name: "クラフトコーラ", price: 540, tags: ["RELAX"] }]
      })
    });
  });
  await page.route("**/api/okami/answer", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "rate_limited" })
    });
  });
  await page.route("**/api/telemetry", async (route) => {
    const body = route.request().postDataJSON() as { event?: string } | null;
    if (body?.event) {
      telemetryEvents.push(body.event);
    }
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/s/test123");
  await page.getByTestId("consent-checkbox").check();
  await page.getByTestId("consent-next-button").click();
  await page.getByTestId("mood-hungry").click();
  await page.getByTestId("okami-input").fill("wifi?");
  await page.getByTestId("okami-ask-button").click();
  await expect(page.getByText("Okami is rate-limited", { exact: false })).toBeVisible();
  expect(telemetryEvents).toContain("okami_fallback");
  expect(telemetryEvents).toContain("okami_rate_limited");
});

test("owner APIs can be mocked without breaking runtime", async ({ page }) => {
  await page.route("**/api/owner/itemAction", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, id: "log-1" })
    });
  });
  await page.route("**/api/approvalLog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, id: "log-2" })
    });
  });
  await page.route("**/api/owner/telemetry?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        storeId: "test123",
        range: "today",
        days: [
          {
            date: "2026-02-14",
            gate_allowed: 10,
            consent: 6,
            tray_add: 4,
            slip: 3,
            sumimasen: 2,
            mood_hungry: 2,
            mood_relax: 2,
            mood_adventure: 2,
            consent_rate: 0.6,
            order_intent_rate: 0.5,
            call_staff_rate: 0.6667
          }
        ]
      })
    });
  });
  await page.route("**/api/owner/billingStatus?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        storeId: "test123",
        range: "today",
        days: [
          {
            date: "2026-02-14",
            checkout_completed_count: 2,
            checkout_completed_amount: 396,
            avg_amount_per_checkout: 198
          }
        ],
        totals: {
          checkout_completed_count: 2,
          checkout_completed_amount: 396,
          avg_amount_per_checkout: 198
        }
      })
    });
  });
  await page.route("**/api/owner/menuVisionImport", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, id: "vision-1", menuCount: 3, drinkCount: 1 })
    });
  });
  await page.route("**/api/owner/shopCardVisionParse", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        id: "vision-2",
        name: "鮨 とのさま",
        address: "東京都千代田区",
        phone: "03-1234-5678",
        website: "https://example.jp"
      })
    });
  });

  await page.goto("/s/test123?mock=1");
  const statuses = await page.evaluate(async () => {
    const itemAction = await fetch("/api/owner/itemAction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OWNER-TOKEN": "test-token",
        "X-REQ-TS": String(Date.now()),
        "X-REQ-NONCE": `nonce-${Date.now()}-a`
      },
      body: JSON.stringify({
        action: "approve",
        storeId: "test123",
        itemId: "ramen",
        intent: "owner_item_review",
        allowed_use: "owner_runtime"
      })
    });
    const approvalLog = await fetch("/api/approvalLog", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OWNER-TOKEN": "test-token",
        "X-REQ-TS": String(Date.now()),
        "X-REQ-NONCE": `nonce-${Date.now()}-b`
      },
      body: JSON.stringify({
        action: "manifest_publish",
        storeId: "test123",
        intent: "manifest_publish",
        allowed_use: "ops_review"
      })
    });
    const telemetry = await fetch("/api/owner/telemetry?storeId=test123&range=today", {
      method: "GET",
      headers: {
        "X-OWNER-TOKEN": "test-token",
        "X-REQ-TS": String(Date.now()),
        "X-REQ-NONCE": `nonce-${Date.now()}-c`
      }
    });
    const billingStatus = await fetch("/api/owner/billingStatus?storeId=test123&range=today", {
      method: "GET",
      headers: {
        "X-OWNER-TOKEN": "test-token",
        "X-REQ-TS": String(Date.now()),
        "X-REQ-NONCE": `nonce-${Date.now()}-f`
      }
    });
    const visionMenu = await fetch("/api/owner/menuVisionImport", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OWNER-TOKEN": "test-token",
        "X-REQ-TS": String(Date.now()),
        "X-REQ-NONCE": `nonce-${Date.now()}-d`
      },
      body: JSON.stringify({
        action: "vision_import",
        storeId: "test123",
        frames: [{ kind: "food", name: "特選盛り" }],
        intent: "multimodal_menu_import",
        allowed_use: "owner_runtime"
      })
    });
    const visionCard = await fetch("/api/owner/shopCardVisionParse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OWNER-TOKEN": "test-token",
        "X-REQ-TS": String(Date.now()),
        "X-REQ-NONCE": `nonce-${Date.now()}-e`
      },
      body: JSON.stringify({
        storeId: "test123",
        blocks: ["鮨 とのさま", "東京都千代田区", "03-1234-5678"],
        intent: "shop_card_vision_parse",
        allowed_use: "owner_runtime"
      })
    });
    const telemetryJson = (await telemetry.json()) as { days?: unknown[] };
    const billingJson = (await billingStatus.json()) as { days?: unknown[] };
    return [
      itemAction.status,
      approvalLog.status,
      telemetry.status,
      billingStatus.status,
      visionMenu.status,
      visionCard.status,
      Array.isArray(telemetryJson.days),
      Array.isArray(billingJson.days)
    ];
  });

  expect(statuses).toEqual([200, 200, 200, 200, 200, 200, true, true]);
  await expect(page.getByTestId("payment-status-select")).toBeVisible();
});
