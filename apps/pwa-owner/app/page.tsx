"use client";

import { useMemo, useState } from "react";

type ItemAction = "approve" | "reject" | "soldout_toggle";
type TelemetryRange = "today" | "yesterday" | "7d" | "30d";

type OwnerTelemetryDay = {
  date: string;
  gate_allowed: number;
  consent: number;
  okami_ask?: number;
  okami_api?: number;
  okami_blocked?: number;
  okami_fallback?: number;
  okami_rate_limited?: number;
  tray_add: number;
  slip: number;
  sumimasen: number;
  mood_hungry: number;
  mood_relax: number;
  mood_adventure: number;
  consent_rate: number;
  order_intent_rate: number;
  call_staff_rate: number;
};

type OwnerTelemetryResponse = {
  storeId: string;
  range: TelemetryRange;
  days: OwnerTelemetryDay[];
  totals?: Omit<OwnerTelemetryDay, "date">;
};

type OwnerBillingDay = {
  date: string;
  checkout_completed_count: number;
  checkout_completed_amount: number;
  avg_amount_per_checkout: number;
  gate_allowed: number;
  checkout_per_gate_rate: number;
};

type OwnerBillingResponse = {
  storeId: string;
  range: TelemetryRange;
  days: OwnerBillingDay[];
  totals?: Omit<OwnerBillingDay, "date">;
};

const OWNER_API_BASE = process.env.NEXT_PUBLIC_OWNER_API_BASE ?? "";
const SUMIMASEN_RATE_THRESHOLD = 0.15;
const BILLING_AVG_THRESHOLD = 180;

function endpoint(path: string): string {
  if (!OWNER_API_BASE) {
    return path;
  }
  return `${OWNER_API_BASE}${path}`;
}

function createNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

export default function OwnerPage() {
  const [storeId, setStoreId] = useState("");
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState("");
  const [ownerToken, setOwnerToken] = useState("");
  const [telemetryRange, setTelemetryRange] = useState<TelemetryRange>("today");
  const [telemetryData, setTelemetryData] = useState<OwnerTelemetryResponse | null>(null);
  const [telemetryDelta, setTelemetryDelta] = useState<{
    consent_rate: number;
    order_intent_rate: number;
    call_staff_rate: number;
  } | null>(null);
  const [telemetryBusy, setTelemetryBusy] = useState(false);
  const [telemetryMessage, setTelemetryMessage] = useState<string | null>(null);
  const [billingData, setBillingData] = useState<OwnerBillingResponse | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingDelta, setBillingDelta] = useState<{
    checkout_completed_count: number;
    checkout_completed_amount: number;
    avg_amount_per_checkout: number;
    checkout_per_gate_rate: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [supportsCashless, setSupportsCashless] = useState(true);
  const [hasWifi, setHasWifi] = useState(true);
  const [hasOtoshi, setHasOtoshi] = useState(false);
  const [foundationMessage, setFoundationMessage] = useState<string | null>(null);
  const [costStatus, setCostStatus] = useState<{ totalYen: number; byAction: Record<string, number> } | null>(null);
  const [salesSeats, setSalesSeats] = useState("18");
  const [salesAvgSpend, setSalesAvgSpend] = useState("3200");
  const [salesTurns, setSalesTurns] = useState("2");
  const [salesGroups, setSalesGroups] = useState("3");
  const [salesResult, setSalesResult] = useState<{
    estimatedDailyBaseYen: number;
    estimatedMonthlyLiftYen: number;
    estimatedAnnualLiftYen: number;
  } | null>(null);
  const [businessModel, setBusinessModel] = useState<"CASHBACK" | "HOSPITALITY">("CASHBACK");
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopLogoUrl, setShopLogoUrl] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [lpHeroImageUrl, setLpHeroImageUrl] = useState("");
  const [lpHeroVideoUrl, setLpHeroVideoUrl] = useState("");
  const [liabilityAllergyAccepted, setLiabilityAllergyAccepted] = useState(false);
  const [liabilityReligionAccepted, setLiabilityReligionAccepted] = useState(false);
  const [shopCardRawText, setShopCardRawText] = useState("");
  const [shopCardVisionBlocks, setShopCardVisionBlocks] = useState("shop logo\n鮨 とのさま\n東京都千代田区...\n03-1234-5678\nhttps://example.jp");
  const [storeQrUrl, setStoreQrUrl] = useState("");
  const [contractAccepted, setContractAccepted] = useState(false);
  const [antiSocialAccepted, setAntiSocialAccepted] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [menuImportText, setMenuImportText] = useState(
    JSON.stringify(
      {
        menuItems: [
          { id: "item1", name: "特製定食", price: 1200 },
          { id: "item2", name: "旬魚の刺身", price: 1400 },
          { id: "item3", name: "山椒煮込み", price: 980 }
        ],
        drinks: [{ id: "drink1", name: "地酒 辛口", price: 780 }]
      },
      null,
      2
    )
  );
  const [menuVisionText, setMenuVisionText] = useState(
    JSON.stringify(
      {
        frames: [
          { kind: "food", name: "炙り鯖定食", price: 1350, tags: ["HUNGRY"], notes: "charcoal grilled" },
          { kind: "food", name: "白子ポン酢", price: 980, tags: ["ADVENTURE"], notes: "seasonal offal" },
          { kind: "food", name: "旬菜おひたし", price: 620, tags: ["RELAX"], notes: "light starter" },
          { kind: "drink", name: "純米吟醸", price: 890, tags: ["RELAX"], notes: "dry sake" }
        ]
      },
      null,
      2
    )
  );
  const [pairingOverridesText, setPairingOverridesText] = useState(
    JSON.stringify(
      {
        item1: ["drink1"]
      },
      null,
      2
    )
  );
  const [soulPhilosophy, setSoulPhilosophy] = useState("");
  const [soulFast, setSoulFast] = useState("");
  const [soulVolume, setSoulVolume] = useState("");
  const [soulAdventure, setSoulAdventure] = useState("");
  const [soulPairing, setSoulPairing] = useState("");
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [collectionStatus, setCollectionStatus] = useState<{
    readinessScore: number;
    missing: string[];
    menuItems: number;
    drinks: number;
  } | null>(null);

  const canSubmit = useMemo(() => {
    return storeId.trim().length > 0 && itemId.trim().length > 0 && ownerToken.trim().length > 0;
  }, [itemId, ownerToken, storeId]);
  const canFetchTelemetry = useMemo(() => {
    return storeId.trim().length > 0 && ownerToken.trim().length > 0;
  }, [ownerToken, storeId]);

  const canRunPipeline = useMemo(() => {
    return storeId.trim().length > 0 && ownerToken.trim().length > 0;
  }, [ownerToken, storeId]);

  const b2bChecklist = useMemo(() => {
    return [
      { key: "source", label: "source URL", ok: sourceUrl.trim().startsWith("https://") },
      { key: "liability", label: "liability accepted", ok: liabilityAllergyAccepted && liabilityReligionAccepted },
      { key: "menu", label: "menu JSON", ok: menuImportText.includes("menuItems") },
      { key: "vision", label: "vision payload", ok: menuVisionText.includes("\"frames\"") && shopCardVisionBlocks.trim().length > 0 },
      { key: "pairing", label: "pairing overrides", ok: pairingOverridesText.includes("{") && pairingOverridesText.includes("}") },
      { key: "soul", label: "soul interview", ok: soulPhilosophy.trim().length > 0 && soulPairing.trim().length > 0 },
      { key: "contract", label: "contract checks", ok: contractAccepted && antiSocialAccepted },
      { key: "qr", label: "permanent URL", ok: storeQrUrl.trim().length > 0 }
    ];
  }, [
    antiSocialAccepted,
    contractAccepted,
    liabilityAllergyAccepted,
    liabilityReligionAccepted,
    menuImportText,
    menuVisionText,
    soulPairing,
    pairingOverridesText,
    soulPhilosophy,
    sourceUrl,
    shopCardVisionBlocks,
    storeQrUrl
  ]);

  const b2bProgress = useMemo(() => {
    const okCount = b2bChecklist.filter((row) => row.ok).length;
    return {
      okCount,
      total: b2bChecklist.length,
      ratio: b2bChecklist.length === 0 ? 0 : okCount / b2bChecklist.length
    };
  }, [b2bChecklist]);

  function ownerHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-OWNER-TOKEN": ownerToken.trim(),
      "X-REQ-TS": String(Date.now()),
      "X-REQ-NONCE": createNonce()
    };
  }

  async function postAction(action: ItemAction) {
    if (!canSubmit || busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        action,
        storeId: storeId.trim(),
        itemId: itemId.trim(),
        reason: reason.trim() || undefined,
        intent: "owner_item_review",
        allowed_use: "owner_runtime"
      };
      const res = await fetch(endpoint("/api/owner/itemAction"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setMessage({ ok: false, text: `操作失敗: ${res.status}` });
        return;
      }
      setMessage({ ok: true, text: `操作成功: ${action}` });
    } catch {
      setMessage({ ok: false, text: "操作失敗: network_error" });
    } finally {
      setBusy(false);
    }
  }

  async function requestTelemetry(range: TelemetryRange): Promise<OwnerTelemetryResponse> {
    const params = new URLSearchParams({
      storeId: storeId.trim(),
      range
    });
    const res = await fetch(endpoint(`/api/owner/telemetry?${params.toString()}`), {
      method: "GET",
      headers: ownerHeaders()
    });
    if (res.status === 403) {
      throw new Error("blocked");
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      throw new Error(retryAfter ? `rate:${retryAfter}` : "rate");
    }
    if (!res.ok) {
      throw new Error("unavailable");
    }
    const json = (await res.json()) as OwnerTelemetryResponse;
    if (!json || !Array.isArray(json.days)) {
      throw new Error("unavailable");
    }
    return json;
  }

  async function requestBilling(range: TelemetryRange): Promise<OwnerBillingResponse> {
    const params = new URLSearchParams({
      storeId: storeId.trim(),
      range
    });
    const res = await fetch(endpoint(`/api/owner/billingStatus?${params.toString()}`), {
      method: "GET",
      headers: ownerHeaders()
    });
    if (res.status === 403) {
      throw new Error("blocked");
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      throw new Error(retryAfter ? `rate:${retryAfter}` : "rate");
    }
    if (!res.ok) {
      throw new Error("unavailable");
    }
    const json = (await res.json()) as OwnerBillingResponse;
    if (!json || !Array.isArray(json.days)) {
      throw new Error("unavailable");
    }
    return json;
  }

  async function fetchStoreStatus() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const params = new URLSearchParams({ storeId: storeId.trim() });
      const res = await fetch(endpoint(`/api/owner/storeStatus?${params.toString()}`), {
        method: "GET",
        headers: ownerHeaders()
      });
      if (!res.ok) {
        setFoundationMessage(`Store status failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as {
        paymentStatus?: string;
        liabilityAccepted?: { allergy?: boolean; religion?: boolean };
        dataCollection?: {
          readinessScore?: number;
          missing?: string[];
          menuItems?: number;
          drinks?: number;
        };
      };
      setCollectionStatus(
        json.dataCollection
          ? {
              readinessScore: Number(json.dataCollection.readinessScore ?? 0),
              missing: Array.isArray(json.dataCollection.missing)
                ? json.dataCollection.missing.filter((x): x is string => typeof x === "string")
                : [],
              menuItems: Number(json.dataCollection.menuItems ?? 0),
              drinks: Number(json.dataCollection.drinks ?? 0)
            }
          : null
      );
      setFoundationMessage(
        `paymentStatus=${json.paymentStatus ?? "unknown"} / liability(allergy:${json.liabilityAccepted?.allergy === true ? "yes" : "no"}, religion:${
          json.liabilityAccepted?.religion === true ? "yes" : "no"
        })`
      );
    } catch {
      setFoundationMessage("Store status failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function fetchCostStatus() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const params = new URLSearchParams({ storeId: storeId.trim() });
      const res = await fetch(endpoint(`/api/owner/costStatus?${params.toString()}`), {
        method: "GET",
        headers: ownerHeaders()
      });
      if (!res.ok) {
        setFoundationMessage(`Cost status failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as { totalYen: number; byAction: Record<string, number> };
      setCostStatus({
        totalYen: Number(json.totalYen ?? 0),
        byAction: typeof json.byAction === "object" && json.byAction !== null ? json.byAction : {}
      });
      setFoundationMessage("Cost status loaded");
    } catch {
      setFoundationMessage("Cost status failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function saveBusinessRules() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/businessRules"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          sourceUrl: sourceUrl.trim(),
          supportsCashless,
          hasWifi,
          hasOtoshi,
          mapUrl: mapUrl.trim() || undefined,
          lpHeroImageUrl: lpHeroImageUrl.trim() || undefined,
          lpHeroVideoUrl: lpHeroVideoUrl.trim() || undefined,
          liabilityAllergyAccepted,
          liabilityReligionAccepted,
          intent: "foundation_setup",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Business rules saved" : `Business rules failed: ${res.status}`);
    } catch {
      setFoundationMessage("Business rules failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function runSalesDiagnosis() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    setSalesResult(null);
    try {
      const res = await fetch(endpoint("/api/owner/salesDiagnosis"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          seats: Number(salesSeats),
          avgSpendYen: Number(salesAvgSpend),
          turnsPerDay: Number(salesTurns),
          extraInboundGroupsPerDay: Number(salesGroups),
          intent: "inbound_opportunity_diagnosis",
          allowed_use: "owner_runtime"
        })
      });
      if (!res.ok) {
        setFoundationMessage(`Sales diagnosis failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as {
        estimatedDailyBaseYen: number;
        estimatedMonthlyLiftYen: number;
        estimatedAnnualLiftYen: number;
      };
      setSalesResult(json);
      setFoundationMessage("Sales diagnosis completed");
    } catch {
      setFoundationMessage("Sales diagnosis failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function importMenu() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const parsed = JSON.parse(menuImportText) as { menuItems: unknown[]; drinks?: unknown[] };
      const res = await fetch(endpoint("/api/owner/menuImport"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          menuItems: parsed.menuItems,
          drinks: parsed.drinks ?? [],
          intent: "source_import",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Menu imported" : `Menu import failed: ${res.status}`);
    } catch {
      setFoundationMessage("Menu import failed: invalid_json");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function importMenuVision() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const parsed = JSON.parse(menuVisionText) as { frames: unknown[] };
      const res = await fetch(endpoint("/api/owner/menuVisionImport"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          frames: parsed.frames,
          intent: "multimodal_menu_import",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Vision menu imported" : `Vision menu import failed: ${res.status}`);
    } catch {
      setFoundationMessage("Vision menu import failed: invalid_json");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function importPairingOverrides() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const parsed = JSON.parse(pairingOverridesText) as Record<string, string[]>;
      const res = await fetch(endpoint("/api/owner/pairingOverrides"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          pairings: parsed,
          intent: "owner_pairing_override",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Pairing overrides imported" : `Pairing override failed: ${res.status}`);
    } catch {
      setFoundationMessage("Pairing override failed: invalid_json");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function captureSoul() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/soulCapture"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          philosophy: soulPhilosophy,
          hungryFast: soulFast,
          hungryVolume: soulVolume,
          adventureIngredient: soulAdventure,
          salesPitchDrink: soulPairing,
          intent: "soul_capture",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Soul captured" : `Soul capture failed: ${res.status}`);
    } catch {
      setFoundationMessage("Soul capture failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function crystallizeMaster() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/crystallize"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          intent: "crystallize_menu_master",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "MENU_MASTER ready" : `Crystallize failed: ${res.status}`);
    } catch {
      setFoundationMessage("Crystallize failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function saveBusinessModel() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/businessModel"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          model: businessModel,
          intent: "business_model_selection",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Business model saved" : `Business model failed: ${res.status}`);
    } catch {
      setFoundationMessage("Business model failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function importShopCard() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/shopCardImport"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          name: shopName,
          address: shopAddress,
          phone: shopPhone,
          logoUrl: shopLogoUrl,
          intent: "shop_card_import",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Shop card imported" : `Shop card import failed: ${res.status}`);
    } catch {
      setFoundationMessage("Shop card import failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function parseShopCardRawText() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/shopCardParse"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          rawText: shopCardRawText,
          intent: "shop_card_parse",
          allowed_use: "owner_runtime"
        })
      });
      if (!res.ok) {
        setFoundationMessage(`Shop card parse failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as { name?: string; address?: string; phone?: string; website?: string };
      if (json.name) setShopName(json.name);
      if (json.address) setShopAddress(json.address);
      if (json.phone) setShopPhone(json.phone);
      if (json.website) setSourceUrl(json.website);
      setFoundationMessage("Shop card parsed");
    } catch {
      setFoundationMessage("Shop card parse failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function parseShopCardVisionBlocks() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const blocks = shopCardVisionBlocks
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      const res = await fetch(endpoint("/api/owner/shopCardVisionParse"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          blocks,
          intent: "shop_card_vision_parse",
          allowed_use: "owner_runtime"
        })
      });
      if (!res.ok) {
        setFoundationMessage(`Shop card vision parse failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as { name?: string; address?: string; phone?: string; website?: string };
      if (json.name) setShopName(json.name);
      if (json.address) setShopAddress(json.address);
      if (json.phone) setShopPhone(json.phone);
      if (json.website) setSourceUrl(json.website);
      setFoundationMessage("Shop card vision parsed");
    } catch {
      setFoundationMessage("Shop card vision parse failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function fetchStoreQr() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    setStoreQrUrl("");
    try {
      const params = new URLSearchParams({ storeId: storeId.trim() });
      const res = await fetch(endpoint(`/api/owner/storeQr?${params.toString()}`), {
        method: "GET",
        headers: ownerHeaders()
      });
      if (!res.ok) {
        setFoundationMessage(`Store QR failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as { permanentUrl?: string };
      setStoreQrUrl(json.permanentUrl ?? "");
      setFoundationMessage("Store QR ready");
    } catch {
      setFoundationMessage("Store QR failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function acceptContract() {
    if (!canRunPipeline || pipelineBusy || !contractAccepted || !antiSocialAccepted) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/contractAccept"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          acceptTerms: contractAccepted,
          acceptAntiSocialClause: antiSocialAccepted,
          intent: "digital_contract_accept",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Contract accepted" : `Contract accept failed: ${res.status}`);
    } catch {
      setFoundationMessage("Contract accept failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function activateAccount() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/activateAccount"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          intent: "activation_after_payment",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Account activated (PAID)" : `Activate failed: ${res.status}`);
    } catch {
      setFoundationMessage("Activate failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function publishTrends() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setFoundationMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/publishTrends"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          intent: "publish_global_food_trends",
          allowed_use: "owner_runtime"
        })
      });
      setFoundationMessage(res.ok ? "Global trends updated" : `Publish trends failed: ${res.status}`);
    } catch {
      setFoundationMessage("Publish trends failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function startInitialFeeCheckout() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    setPipelineBusy(true);
    setCheckoutMessage(null);
    try {
      const res = await fetch(endpoint("/api/owner/initialFeeCheckout"), {
        method: "POST",
        headers: ownerHeaders(),
        body: JSON.stringify({
          storeId: storeId.trim(),
          intent: "initial_fee_checkout",
          allowed_use: "owner_runtime"
        })
      });
      if (!res.ok) {
        setCheckoutMessage(`Checkout request failed: ${res.status}`);
        return;
      }
      const json = (await res.json()) as { amountYen: number; checkoutStatus: string };
      setCheckoutMessage(`Checkout requested: ¥${json.amountYen} (${json.checkoutStatus})`);
    } catch {
      setCheckoutMessage("Checkout request failed: network_error");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function fetchTelemetry() {
    if (!canFetchTelemetry || telemetryBusy) {
      return;
    }
    setTelemetryBusy(true);
    setTelemetryMessage(null);
    setTelemetryDelta(null);
    try {
      const json = await requestTelemetry(telemetryRange);
      setTelemetryData(json);
    } catch (error) {
      if (error instanceof Error && error.message === "blocked") {
        setTelemetryMessage("Blocked (auth)");
        setTelemetryData(null);
        return;
      }
      if (error instanceof Error && error.message.startsWith("rate")) {
        const retryAfter = error.message.split(":")[1];
        setTelemetryMessage(retryAfter ? `Rate limited (retry after ${retryAfter}s)` : "Rate limited");
        setTelemetryData(null);
        return;
      }
      setTelemetryMessage("Unavailable");
      setTelemetryData(null);
    } finally {
      setTelemetryBusy(false);
    }
  }

  async function compareTelemetryDelta() {
    if (!canFetchTelemetry || telemetryBusy) {
      return;
    }
    setTelemetryBusy(true);
    setTelemetryMessage(null);
    try {
      const [seven, month] = await Promise.all([requestTelemetry("7d"), requestTelemetry("30d")]);
      const sevenTotals = seven.totals;
      const monthTotals = month.totals;
      if (!sevenTotals || !monthTotals) {
        setTelemetryMessage("Unavailable");
        setTelemetryDelta(null);
        return;
      }
      setTelemetryDelta({
        consent_rate: Math.round((sevenTotals.consent_rate - monthTotals.consent_rate) * 10000) / 10000,
        order_intent_rate:
          Math.round((sevenTotals.order_intent_rate - monthTotals.order_intent_rate) * 10000) / 10000,
        call_staff_rate: Math.round((sevenTotals.call_staff_rate - monthTotals.call_staff_rate) * 10000) / 10000
      });
    } catch (error) {
      if (error instanceof Error && error.message === "blocked") {
        setTelemetryMessage("Blocked (auth)");
      } else if (error instanceof Error && error.message.startsWith("rate")) {
        const retryAfter = error.message.split(":")[1];
        setTelemetryMessage(retryAfter ? `Rate limited (retry after ${retryAfter}s)` : "Rate limited");
      } else {
        setTelemetryMessage("Unavailable");
      }
      setTelemetryDelta(null);
    } finally {
      setTelemetryBusy(false);
    }
  }

  async function fetchBillingStatus() {
    if (!canFetchTelemetry || telemetryBusy) {
      return;
    }
    setTelemetryBusy(true);
    setBillingMessage(null);
    try {
      const json = await requestBilling(telemetryRange);
      setBillingData(json);
    } catch (error) {
      if (error instanceof Error && error.message === "blocked") {
        setBillingMessage("Blocked (auth)");
        setBillingData(null);
      } else if (error instanceof Error && error.message.startsWith("rate")) {
        const retryAfter = error.message.split(":")[1];
        setBillingMessage(retryAfter ? `Rate limited (retry after ${retryAfter}s)` : "Rate limited");
        setBillingData(null);
      } else {
        setBillingMessage("Unavailable");
        setBillingData(null);
      }
    } finally {
      setTelemetryBusy(false);
    }
  }

  async function compareBillingDelta() {
    if (!canFetchTelemetry || telemetryBusy) {
      return;
    }
    setTelemetryBusy(true);
    setBillingMessage(null);
    try {
      const [seven, month] = await Promise.all([requestBilling("7d"), requestBilling("30d")]);
      const sevenTotals = seven.totals;
      const monthTotals = month.totals;
      if (!sevenTotals || !monthTotals) {
        setBillingMessage("Unavailable");
        setBillingDelta(null);
        return;
      }
      setBillingDelta({
        checkout_completed_count: sevenTotals.checkout_completed_count - monthTotals.checkout_completed_count,
        checkout_completed_amount: sevenTotals.checkout_completed_amount - monthTotals.checkout_completed_amount,
        avg_amount_per_checkout:
          Math.round((sevenTotals.avg_amount_per_checkout - monthTotals.avg_amount_per_checkout) * 100) / 100,
        checkout_per_gate_rate:
          Math.round((sevenTotals.checkout_per_gate_rate - monthTotals.checkout_per_gate_rate) * 10000) / 10000
      });
    } catch (error) {
      if (error instanceof Error && error.message === "blocked") {
        setBillingMessage("Blocked (auth)");
      } else if (error instanceof Error && error.message.startsWith("rate")) {
        const retryAfter = error.message.split(":")[1];
        setBillingMessage(retryAfter ? `Rate limited (retry after ${retryAfter}s)` : "Rate limited");
      } else {
        setBillingMessage("Unavailable");
      }
      setBillingDelta(null);
    } finally {
      setTelemetryBusy(false);
    }
  }

  async function runQuickB2BFlow() {
    if (!canRunPipeline || pipelineBusy) {
      return;
    }
    await fetchStoreStatus();
    await saveBusinessRules();
    await runSalesDiagnosis();
    await fetchStoreQr();
    await fetchCostStatus();
  }

  return (
    <main>
      <section className="panel">
        <h1>Owner Controls</h1>
        <p>承認 / 差戻し / sold out をFunctions経由で実行します。</p>
        <p className="small">
          B2B readiness: {b2bProgress.okCount}/{b2bProgress.total} ({Math.round(b2bProgress.ratio * 100)}%)
        </p>
        <div className="actions">
          {b2bChecklist.map((row) => (
            <span key={row.key} className={`status ${row.ok ? "ok" : "err"}`}>
              {row.label}: {row.ok ? "OK" : "TODO"}
            </span>
          ))}
        </div>

        <div className="row">
          <label htmlFor="store-id">storeId</label>
          <input
            id="store-id"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="store id"
            autoComplete="off"
          />
        </div>

        <div className="row">
          <label htmlFor="item-id">itemId</label>
          <input
            id="item-id"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="item id"
            autoComplete="off"
          />
        </div>

        <div className="row">
          <label htmlFor="reason">reason (optional)</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="reject reason"
            rows={3}
          />
        </div>

        <div className="row">
          <label htmlFor="owner-token">owner token</label>
          <input
            id="owner-token"
            type="password"
            value={ownerToken}
            onChange={(e) => setOwnerToken(e.target.value)}
            placeholder="OWNER_API_TOKEN"
            autoComplete="off"
          />
        </div>

        <div className="actions">
          <button type="button" onClick={() => void postAction("approve")} disabled={!canSubmit || busy}>
            承認
          </button>
          <button type="button" onClick={() => void postAction("reject")} disabled={!canSubmit || busy}>
            差戻し
          </button>
          <button type="button" onClick={() => void postAction("soldout_toggle")} disabled={!canSubmit || busy}>
            sold out
          </button>
        </div>

        {message ? <p className={`status ${message.ok ? "ok" : "err"}`}>{message.text}</p> : null}
      </section>

      <section className="panel">
        <h2>Foundation Pipeline</h2>
        <p>Safe URL / Business Rules / Source Import / Soul Voice / Crystallize</p>

        <div className="row">
          <label htmlFor="source-url">source URL (https only)</label>
          <input
            id="source-url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://official-site.example"
            autoComplete="off"
          />
        </div>
        <p className="small">Blocked domains: tabelog.com / retty.me / hotpepper.jp / gurunavi.com / yelp.com</p>
        {sourceUrl.includes("tabelog.com") || sourceUrl.includes("retty.me") ? (
          <p className="status err">Unsafe source URL is blocked by policy.</p>
        ) : null}

        <div className="actions">
          <label>
            <input type="checkbox" checked={supportsCashless} onChange={(e) => setSupportsCashless(e.target.checked)} />
            cashless
          </label>
          <label>
            <input type="checkbox" checked={hasWifi} onChange={(e) => setHasWifi(e.target.checked)} />
            wifi
          </label>
          <label>
            <input type="checkbox" checked={hasOtoshi} onChange={(e) => setHasOtoshi(e.target.checked)} />
            otoshi
          </label>
        </div>
        <div className="row">
          <label htmlFor="map-url">map URL (optional)</label>
          <input id="map-url" value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://maps.example/..." />
        </div>
        <div className="row">
          <label htmlFor="lp-hero-image-url">LP hero image URL (optional)</label>
          <input
            id="lp-hero-image-url"
            value={lpHeroImageUrl}
            onChange={(e) => setLpHeroImageUrl(e.target.value)}
            placeholder="https://cdn.example/hero.jpg"
          />
        </div>
        <div className="row">
          <label htmlFor="lp-hero-video-url">LP hero video URL (optional)</label>
          <input
            id="lp-hero-video-url"
            value={lpHeroVideoUrl}
            onChange={(e) => setLpHeroVideoUrl(e.target.value)}
            placeholder="https://cdn.example/hero.mp4"
          />
        </div>
        <div className="actions">
          <label>
            <input
              type="checkbox"
              checked={liabilityAllergyAccepted}
              onChange={(e) => setLiabilityAllergyAccepted(e.target.checked)}
            />
            Allergy liability accepted
          </label>
          <label>
            <input
              type="checkbox"
              checked={liabilityReligionAccepted}
              onChange={(e) => setLiabilityReligionAccepted(e.target.checked)}
            />
            Religion liability accepted
          </label>
        </div>

        <div className="actions">
          <button type="button" onClick={() => void fetchStoreStatus()} disabled={!canRunPipeline || pipelineBusy}>
            Store Status
          </button>
          <button type="button" onClick={() => void fetchCostStatus()} disabled={!canRunPipeline || pipelineBusy}>
            Cost Status
          </button>
          <button type="button" onClick={() => void runSalesDiagnosis()} disabled={!canRunPipeline || pipelineBusy}>
            Sales Diagnosis
          </button>
          <button type="button" onClick={() => void saveBusinessRules()} disabled={!canRunPipeline || pipelineBusy}>
            Save Rules
          </button>
          <button type="button" onClick={() => void runQuickB2BFlow()} disabled={!canRunPipeline || pipelineBusy}>
            Quick B2B Flow
          </button>
        </div>
        <div className="row">
          <label htmlFor="sales-seats">seats</label>
          <input id="sales-seats" value={salesSeats} onChange={(e) => setSalesSeats(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="sales-spend">avg spend (JPY)</label>
          <input id="sales-spend" value={salesAvgSpend} onChange={(e) => setSalesAvgSpend(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="sales-turns">turns/day</label>
          <input id="sales-turns" value={salesTurns} onChange={(e) => setSalesTurns(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="sales-groups">extra inbound groups/day</label>
          <input id="sales-groups" value={salesGroups} onChange={(e) => setSalesGroups(e.target.value)} />
        </div>
        {salesResult ? (
          <p className="small">
            base/day: ¥{salesResult.estimatedDailyBaseYen} / lift/month: ¥{salesResult.estimatedMonthlyLiftYen} / lift/year:
            ¥{salesResult.estimatedAnnualLiftYen}
          </p>
        ) : null}
        {costStatus ? (
          <p className="small">
            Cost total: ¥{costStatus.totalYen} / actions: {Object.keys(costStatus.byAction).length}
          </p>
        ) : null}
        <p className="small">
          Cost comparison: bilingual staff ~¥200,000+/month vs TONOSAMA owner flow automation.
        </p>
        <p className="small">
          Competitive edge: dictionary-like translationではなく、店舗在庫に基づく提案で客単価向上を狙います。
        </p>

        <div className="row">
          <label htmlFor="menu-import">menu/drinks JSON</label>
          <textarea
            id="menu-import"
            value={menuImportText}
            onChange={(e) => setMenuImportText(e.target.value)}
            rows={12}
          />
        </div>

        <div className="actions">
          <button type="button" onClick={() => void importMenu()} disabled={!canRunPipeline || pipelineBusy}>
            Menu Import
          </button>
          <button type="button" onClick={() => void importMenuVision()} disabled={!canRunPipeline || pipelineBusy}>
            Vision Menu Import
          </button>
          <button type="button" onClick={() => void importPairingOverrides()} disabled={!canRunPipeline || pipelineBusy}>
            Pairing Override
          </button>
        </div>
        <div className="row">
          <label htmlFor="menu-vision">vision frames JSON (multimodal output)</label>
          <textarea
            id="menu-vision"
            value={menuVisionText}
            onChange={(e) => setMenuVisionText(e.target.value)}
            rows={10}
          />
        </div>
        <div className="row">
          <label htmlFor="pairing-overrides">pairing overrides JSON (foodId {"->"} [drinkId,...])</label>
          <textarea
            id="pairing-overrides"
            value={pairingOverridesText}
            onChange={(e) => setPairingOverridesText(e.target.value)}
            rows={8}
          />
        </div>

        <div className="row">
          <label htmlFor="soul-philosophy">Soul philosophy</label>
          <textarea
            id="soul-philosophy"
            value={soulPhilosophy}
            onChange={(e) => setSoulPhilosophy(e.target.value)}
            rows={3}
            placeholder="この料理への偏愛を記入"
          />
        </div>
        <div className="row">
          <label htmlFor="soul-fast">Hungry: fastest dish</label>
          <input id="soul-fast" value={soulFast} onChange={(e) => setSoulFast(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="soul-volume">Hungry: most volume dish</label>
          <input id="soul-volume" value={soulVolume} onChange={(e) => setSoulVolume(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="soul-adv">Adventure ingredient</label>
          <input id="soul-adv" value={soulAdventure} onChange={(e) => setSoulAdventure(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="soul-pair">Sales pitch drink</label>
          <input id="soul-pair" value={soulPairing} onChange={(e) => setSoulPairing(e.target.value)} />
        </div>
        <div className="actions">
          <button type="button" onClick={() => void captureSoul()} disabled={!canRunPipeline || pipelineBusy}>
            Capture Soul
          </button>
          <button type="button" onClick={() => void parseShopCardRawText()} disabled={!canRunPipeline || pipelineBusy}>
            Parse Card Text
          </button>
          <button type="button" onClick={() => void parseShopCardVisionBlocks()} disabled={!canRunPipeline || pipelineBusy}>
            Parse Card Vision
          </button>
          <button type="button" onClick={() => void importShopCard()} disabled={!canRunPipeline || pipelineBusy}>
            Shop Card Import
          </button>
          <button type="button" onClick={() => void crystallizeMaster()} disabled={!canRunPipeline || pipelineBusy}>
            Crystallize
          </button>
        </div>
        <div className="row">
          <label htmlFor="shop-card-raw">shop card raw text (OCR paste)</label>
          <textarea
            id="shop-card-raw"
            value={shopCardRawText}
            onChange={(e) => setShopCardRawText(e.target.value)}
            rows={4}
            placeholder="名刺OCRのテキストを貼り付け"
          />
        </div>
        <div className="row">
          <label htmlFor="shop-card-vision">shop card vision blocks (multimodal output)</label>
          <textarea
            id="shop-card-vision"
            value={shopCardVisionBlocks}
            onChange={(e) => setShopCardVisionBlocks(e.target.value)}
            rows={5}
            placeholder="vision block lines"
          />
        </div>
        <div className="row">
          <label htmlFor="shop-name">shop name</label>
          <input id="shop-name" value={shopName} onChange={(e) => setShopName(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="shop-address">shop address</label>
          <input id="shop-address" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="shop-phone">shop phone</label>
          <input id="shop-phone" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="shop-logo">logo URL (optional)</label>
          <input id="shop-logo" value={shopLogoUrl} onChange={(e) => setShopLogoUrl(e.target.value)} />
        </div>
        <div className="row">
          <label htmlFor="business-model">business model</label>
          <select
            id="business-model"
            value={businessModel}
            onChange={(e) => setBusinessModel(e.target.value as "CASHBACK" | "HOSPITALITY")}
          >
            <option value="CASHBACK">CASHBACK (198 guest / 11 cashback)</option>
            <option value="HOSPITALITY">HOSPITALITY (187 store pays)</option>
          </select>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void fetchStoreQr()} disabled={!canRunPipeline || pipelineBusy}>
            Get Permanent URL
          </button>
          <button type="button" onClick={() => void saveBusinessModel()} disabled={!canRunPipeline || pipelineBusy}>
            Save Model
          </button>
          <button type="button" onClick={() => void publishTrends()} disabled={!canRunPipeline || pipelineBusy}>
            Publish Trends
          </button>
          <button type="button" onClick={() => void activateAccount()} disabled={!canRunPipeline || pipelineBusy}>
            Activate (PAID)
          </button>
        </div>
        {storeQrUrl ? (
          <p className="small">
            Permanent URL: <a href={storeQrUrl}>{storeQrUrl}</a>
          </p>
        ) : null}
        {storeQrUrl ? (
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                if (typeof navigator === "undefined" || !navigator.clipboard) {
                  return;
                }
                void navigator.clipboard.writeText(storeQrUrl);
                setFoundationMessage("Permanent URL copied");
              }}
            >
              Copy Permanent URL
            </button>
          </div>
        ) : null}
        <div className="actions">
          <button type="button" onClick={() => void startInitialFeeCheckout()} disabled={!canRunPipeline || pipelineBusy}>
            Request Initial Fee Checkout (¥49,800)
          </button>
        </div>
        {checkoutMessage ? <p className="small">{checkoutMessage}</p> : null}
        <div className="actions">
          <label>
            <input type="checkbox" checked={contractAccepted} onChange={(e) => setContractAccepted(e.target.checked)} />
            Terms accepted
          </label>
          <label>
            <input type="checkbox" checked={antiSocialAccepted} onChange={(e) => setAntiSocialAccepted(e.target.checked)} />
            Anti-social clause accepted
          </label>
          <button
            type="button"
            onClick={() => void acceptContract()}
            disabled={!canRunPipeline || pipelineBusy || !contractAccepted || !antiSocialAccepted}
          >
            Contract Accept
          </button>
        </div>

        {foundationMessage ? <p className="status">{foundationMessage}</p> : null}
        {collectionStatus ? (
          <p className="small">
            Data readiness: {Math.round(collectionStatus.readinessScore * 100)}% / menu:{collectionStatus.menuItems} / drinks:
            {collectionStatus.drinks} / missing:
            {collectionStatus.missing.length > 0 ? ` ${collectionStatus.missing.join(", ")}` : " none"}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Telemetry</h2>
        <p>店舗ファネル（today / yesterday / 7d / 30d）</p>
        <div className="row">
          <label htmlFor="telemetry-range">range</label>
          <select
            id="telemetry-range"
            value={telemetryRange}
            onChange={(e) => setTelemetryRange(e.target.value as TelemetryRange)}
          >
            <option value="today">today</option>
            <option value="yesterday">yesterday</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
        </div>
        <div className="actions">
          <button type="button" onClick={() => void fetchTelemetry()} disabled={!canFetchTelemetry || telemetryBusy}>
            Fetch
          </button>
          <button type="button" onClick={() => void compareTelemetryDelta()} disabled={!canFetchTelemetry || telemetryBusy}>
            Compare 7d vs 30d
          </button>
          <button type="button" onClick={() => void fetchBillingStatus()} disabled={!canFetchTelemetry || telemetryBusy}>
            Billing Status
          </button>
          <button type="button" onClick={() => void compareBillingDelta()} disabled={!canFetchTelemetry || telemetryBusy}>
            Compare Billing 7d vs 30d
          </button>
        </div>
        {telemetryBusy ? <p className="small">Loading owner metrics...</p> : null}

        {telemetryMessage ? <p className="status err">{telemetryMessage}</p> : null}

        {telemetryData ? (
          <div className="row">
            <table data-testid="owner-telemetry-table">
              <thead>
                <tr>
                  <th>date</th>
                  <th>gate</th>
                  <th>consent</th>
                  <th>okami_ask</th>
                  <th>okami_api</th>
                  <th>okami_blocked</th>
                  <th>okami_fallback</th>
                  <th>okami_rate_limited</th>
                  <th>slip</th>
                  <th>sumimasen</th>
                  <th>consent_rate</th>
                  <th>order_intent_rate</th>
                  <th>call_staff_rate</th>
                </tr>
              </thead>
              <tbody>
                {telemetryData.days.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{day.gate_allowed}</td>
                    <td>{day.consent}</td>
                    <td>{day.okami_ask ?? 0}</td>
                    <td>{day.okami_api ?? 0}</td>
                    <td>{day.okami_blocked ?? 0}</td>
                    <td>{day.okami_fallback ?? 0}</td>
                    <td>{day.okami_rate_limited ?? 0}</td>
                    <td>{day.slip}</td>
                    <td>{day.sumimasen}</td>
                    <td>{day.consent_rate}</td>
                    <td>{day.order_intent_rate}</td>
                    <td>{day.call_staff_rate}</td>
                  </tr>
                ))}
                {telemetryData.totals ? (
                  <tr data-testid="owner-telemetry-totals">
                    <td>TOTAL</td>
                    <td>{telemetryData.totals.gate_allowed}</td>
                    <td>{telemetryData.totals.consent}</td>
                    <td>{telemetryData.totals.okami_ask ?? 0}</td>
                    <td>{telemetryData.totals.okami_api ?? 0}</td>
                    <td>{telemetryData.totals.okami_blocked ?? 0}</td>
                    <td>{telemetryData.totals.okami_fallback ?? 0}</td>
                    <td>{telemetryData.totals.okami_rate_limited ?? 0}</td>
                    <td>{telemetryData.totals.slip}</td>
                    <td>{telemetryData.totals.sumimasen}</td>
                    <td>{telemetryData.totals.consent_rate}</td>
                    <td>{telemetryData.totals.order_intent_rate}</td>
                    <td>{telemetryData.totals.call_staff_rate}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {telemetryData.totals && telemetryData.totals.call_staff_rate < SUMIMASEN_RATE_THRESHOLD ? (
              <p className="status err" data-testid="owner-sumimasen-warning">
                ⚠︎ sumimasen_rate below threshold ({SUMIMASEN_RATE_THRESHOLD})
              </p>
            ) : null}
            {telemetryDelta ? (
              <p className="small" data-testid="owner-telemetry-delta">
                delta(7d-30d): consent_rate={telemetryDelta.consent_rate} / order_intent_rate={telemetryDelta.order_intent_rate} /
                call_staff_rate={telemetryDelta.call_staff_rate}
              </p>
            ) : null}
          </div>
        ) : telemetryMessage ? null : (
          <p className="small">No telemetry loaded yet.</p>
        )}
      </section>

      <section className="panel">
        <h2>Billing</h2>
        <p>課金集計（checkout件数 / 金額 / 平均）</p>
        {billingMessage ? <p className="status err">{billingMessage}</p> : null}
        {billingData ? (
          <div className="row">
            <table data-testid="owner-billing-table">
              <thead>
                <tr>
                  <th>date</th>
                  <th>gate</th>
                  <th>checkout_count</th>
                  <th>checkout_amount</th>
                  <th>avg_amount</th>
                  <th>checkout/gate</th>
                </tr>
              </thead>
              <tbody>
                {billingData.days.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{day.gate_allowed}</td>
                    <td>{day.checkout_completed_count}</td>
                    <td>{day.checkout_completed_amount}</td>
                    <td>{day.avg_amount_per_checkout}</td>
                    <td>{day.checkout_per_gate_rate}</td>
                  </tr>
                ))}
                {billingData.totals ? (
                  <tr data-testid="owner-billing-totals">
                    <td>TOTAL</td>
                    <td>{billingData.totals.gate_allowed}</td>
                    <td>{billingData.totals.checkout_completed_count}</td>
                    <td>{billingData.totals.checkout_completed_amount}</td>
                    <td>{billingData.totals.avg_amount_per_checkout}</td>
                    <td>{billingData.totals.checkout_per_gate_rate}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {billingData.totals && billingData.totals.avg_amount_per_checkout < BILLING_AVG_THRESHOLD ? (
              <p className="status err" data-testid="owner-billing-warning">
                ⚠︎ avg checkout amount below threshold ({BILLING_AVG_THRESHOLD})
              </p>
            ) : null}
            {billingDelta ? (
              <p className="small" data-testid="owner-billing-delta">
                delta(7d-30d): checkout_count={billingDelta.checkout_completed_count} / checkout_amount=
                {billingDelta.checkout_completed_amount} / avg_amount={billingDelta.avg_amount_per_checkout} / checkout_per_gate=
                {billingDelta.checkout_per_gate_rate}
              </p>
            ) : null}
          </div>
        ) : billingMessage ? null : (
          <p className="small">No billing summary loaded yet.</p>
        )}
      </section>
    </main>
  );
}
