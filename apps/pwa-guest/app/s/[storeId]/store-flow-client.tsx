"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackBehaviorSample, trackEvent } from "./lib/events";
import { readStoreDocuments, type RemoteCatalogItem } from "./lib/functions-read";
import { requestGateToken } from "./lib/gate-client";
import { isAllowed, type PaymentStatus } from "./lib/gates";
import { emitTelemetry } from "./lib/telemetry-client";
import { runBillingCheckout, runBillingFlip, type BillingFlipResult } from "./lib/billing-client";
import { requestOkamiAnswer } from "./lib/okami-client";
import OkamiAvatar from "./components/OkamiAvatar";
import ChatStream from "./components/ChatStream";

type Mood = "HUNGRY" | "RELAX" | "ADVENTURE";
type Step = "AWAKENING" | "MOOD" | "DISCOVERY" | "SLIP" | "SUMIMASEN";
type GateState = "checking" | "allowed" | "blocked";
type OkamiClass = "SECURITY" | "RULE" | "PLACE" | "SOUL";
type DiscoverySort = "MOOD" | "PRICE_ASC" | "PRICE_DESC" | "NAME";
type DetailMode = "AUTO" | "COMPACT" | "RICH";
type DemoTarget = "BLOCKED" | "AWAKENING" | "MOOD" | "DISCOVERY" | "SLIP" | "SUMIMASEN";
type OkamiVisualState = "idle" | "thinking" | "speaking";

type OkamiLogRow = { q: string; kind: OkamiClass; a: string; source: "api" | "fallback" };

type MenuItem = {
  id: string;
  name: string;
  price: number;
  tags: Mood[];
  source: "food" | "drink";
  rawTags: string[];
};

type StoreFlowClientProps = {
  storeId: string;
};

const MENU_CACHE_KEY = "tonosama_guest_menu_v1";
const MENU_CACHE_VERSION = 1;
const MENU_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MENU: MenuItem[] = [
  {
    id: "ramen",
    name: "濃厚とんこつラーメン",
    price: 980,
    tags: ["HUNGRY"],
    source: "food",
    rawTags: ["speed:4", "volume:5", "flavor:rich", "temp:hot", "body:heavy", "acidity:low"]
  },
  {
    id: "tea",
    name: "焙じ茶ラテ",
    price: 620,
    tags: ["RELAX"],
    source: "drink",
    rawTags: ["course:4", "flavor:light", "story:2", "temp:cold", "body:light", "acidity:high"]
  },
  {
    id: "taco",
    name: "山椒スパイス・タコス",
    price: 860,
    tags: ["ADVENTURE"],
    source: "food",
    rawTags: ["speed:3", "volume:3", "flavor:spicy", "story:4", "temp:hot", "body:medium", "acidity:low"]
  }
];
const OPERATIONS_NOTICE: Record<LocaleKey, string> = {
  ja: "この画面は店主承認済みカードのみ表示します。営業中に更新される場合があります。",
  en: "Only owner-approved cards are shown here. Content can update during service.",
  fr: "Seules les cartes approuvees par le proprietaire sont affichees ici. Le contenu peut evoluer.",
  zh: "此页面仅显示店主已批准的卡片，营业中可能更新。"
};
const CLICKWRAP_TEXT: Record<LocaleKey, string> = {
  ja: "Unlock を押すと利用規約に同意し、匿名の集計分析に同意したものとみなされます。",
  en: "By tapping unlock, you agree to our Terms and anonymous aggregate analytics.",
  fr: "En appuyant sur unlock, vous acceptez les conditions et l'analyse agregee anonyme.",
  zh: "点击 unlock 即表示你同意条款与匿名聚合分析。"
};

type LocaleKey = "ja" | "en" | "fr" | "zh";

const LOCALE_LABELS: Record<LocaleKey, { welcome: string; prompt: string; unlock: string; basic: string }> = {
  ja: {
    welcome: "ようこそ日本へ。遠くからのご来店ありがとうございます。",
    prompt: "ただ食べるだけでなく、店主の魂まで味わいますか？",
    unlock: "YES, UNLOCK THE SOUL",
    basic: "No, just show me the list"
  },
  en: {
    welcome: "Welcome to Japan. You traveled a long way to get here.",
    prompt: "Don’t just eat. Experience the soul of this place.",
    unlock: "YES, UNLOCK THE SOUL",
    basic: "No, just show me the list"
  },
  fr: {
    welcome: "Bienvenue au Japon. Merci d'etre venu de si loin.",
    prompt: "Ne faites pas que manger. Vivez l'ame de ce lieu.",
    unlock: "YES, UNLOCK THE SOUL",
    basic: "No, just show me the list"
  },
  zh: {
    welcome: "欢迎来到日本，感谢远道而来。",
    prompt: "不仅是用餐，请体验这家店的灵魂。",
    unlock: "YES, UNLOCK THE SOUL",
    basic: "No, just show me the list"
  }
};

const HOOK_COPY: Record<
  LocaleKey,
  { empathy: string; agitation: string; solution: string; proof: string; guarantee: string }
> = {
  ja: {
    empathy: "ようこそ日本へ。遠くからの旅路、おつかれさまでした。",
    agitation: "でも、この店の“まだ見ていない逸品”を見逃していませんか？",
    solution: "ただ食べるだけでなく、店主の魂まで味わう体験を解放します。",
    proof: "実績: 多言語で迷わない注文体験を提供し、注文完走率を可視化します。",
    guarantee: "同意前に課金はしません。いつでも基本メニューへ切替できます。"
  },
  en: {
    empathy: "Welcome to Japan. You traveled a long way to get here.",
    agitation: "But are you missing hidden gems on this menu?",
    solution: "Don’t just eat. Unlock the chef’s soul and dine better.",
    proof: "Proof: multilingual guided flow reduces hesitation and increases completion.",
    guarantee: "No charge before consent. You can switch to the basic list anytime."
  },
  fr: {
    empathy: "Bienvenue au Japon. Vous avez fait un long voyage.",
    agitation: "Et si vous passiez a cote des meilleurs secrets de ce menu ?",
    solution: "Ne faites pas que manger. Debloquez l'ame du chef.",
    proof: "Preuve: parcours guide multilingue pour commander sans hesitation.",
    guarantee: "Aucun paiement avant consentement. Retour au mode basique possible."
  },
  zh: {
    empathy: "欢迎来到日本，感谢你远道而来。",
    agitation: "但你是否错过了菜单里真正的隐藏珍品？",
    solution: "不仅是吃饭，而是解锁主厨灵魂的体验。",
    proof: "证明: 多语言引导可减少犹豫并提升下单完成率。",
    guarantee: "同意前不收费，随时可切换到基础菜单。"
  }
};

const HOOK_DECISION: Record<LocaleKey, string> = {
  ja: "4. 決断: Unlockするか、簡易メニューに進むか選択してください。",
  en: "4. Decision: unlock the full journey or continue with a basic list.",
  fr: "4. Decision: debloquez le parcours complet ou continuez en mode basique.",
  zh: "4. 决策: 解锁完整体验，或继续使用基础菜单。"
};

const PAIRING_RATIONALE_LABEL: Record<LocaleKey, string> = {
  ja: "根拠",
  en: "Rationale",
  fr: "Raison",
  zh: "依据"
};

const UI_TEXT: Record<
  LocaleKey,
  {
    awakeningTitle: string;
    consentRequirement: string;
    consentLabel: string;
    safetyTitle: string;
    moodTitle: string;
    moodPrompt: string;
    discoveryTitle: string;
    trayAdd: string;
    order: string;
    slipTitle: string;
    handwrittenSlip: string;
    toSumimasen: string;
    sumimasenTitle: string;
    callStaffDone: string;
    callStaffPending: string;
    souvenirTitle: string;
    souvenirSave: string;
    fallbackNotice: string;
    blockedTitle: string;
    blockedDesc: string;
  }
> = {
  ja: {
    awakeningTitle: "覚醒",
    consentRequirement: "Discoveryへ進むには利用規約への明示同意が必要です。未同意ではDiscoveryを開きません。",
    consentLabel: "利用規約と注文フローに同意する",
    safetyTitle: "安全上の注意",
    moodTitle: "気分セレクター",
    moodPrompt: "今夜の気分を選んでください。",
    discoveryTitle: "探索",
    trayAdd: "Trayに追加",
    order: "注文",
    slipTitle: "伝票",
    handwrittenSlip: "手書き風伝票",
    toSumimasen: "SUMIMASENへ",
    sumimasenTitle: "SUMIMASEN",
    callStaffDone: "スタッフを呼び出しました。",
    callStaffPending: "押すとスタッフを呼び出します。",
    souvenirTitle: "デジタルおみやげ",
    souvenirSave: "画像を保存",
    fallbackNotice: "店舗データ取得失敗: 簡易メニューを表示中",
    blockedTitle: "アクセスブロック",
    blockedDesc: "有効なゲートトークンが取得できないためアクセスを停止しました。"
  },
  en: {
    awakeningTitle: "Awakening",
    consentRequirement: "Explicit clickwrap consent is required before Discovery.",
    consentLabel: "I agree to the Terms and ordering flow",
    safetyTitle: "Safety Notice",
    moodTitle: "Mood Selector",
    moodPrompt: "How are you feeling tonight?",
    discoveryTitle: "Discovery",
    trayAdd: "Add to tray",
    order: "Order",
    slipTitle: "Slip",
    handwrittenSlip: "Yellow handwritten-style slip",
    toSumimasen: "Go to SUMIMASEN",
    sumimasenTitle: "SUMIMASEN",
    callStaffDone: "Staff has been called.",
    callStaffPending: "Press to call staff.",
    souvenirTitle: "Digital Souvenir",
    souvenirSave: "Save image",
    fallbackNotice: "Store data unavailable: fallback menu is shown",
    blockedTitle: "Access Blocked",
    blockedDesc: "Gate token is unavailable. Access is fail-closed."
  },
  fr: {
    awakeningTitle: "Eveil",
    consentRequirement: "Un consentement explicite est requis avant Discovery.",
    consentLabel: "J'accepte les conditions et le flux de commande",
    safetyTitle: "Avis de securite",
    moodTitle: "Selection d'humeur",
    moodPrompt: "Quelle est votre humeur ce soir ?",
    discoveryTitle: "Decouverte",
    trayAdd: "Ajouter au plateau",
    order: "Commander",
    slipTitle: "Bon",
    handwrittenSlip: "Bon manuscrit jaune",
    toSumimasen: "Aller a SUMIMASEN",
    sumimasenTitle: "SUMIMASEN",
    callStaffDone: "Le personnel a ete appele.",
    callStaffPending: "Appuyez pour appeler le personnel.",
    souvenirTitle: "Souvenir numerique",
    souvenirSave: "Enregistrer l'image",
    fallbackNotice: "Donnees indisponibles: menu simplifie affiche",
    blockedTitle: "Acces bloque",
    blockedDesc: "Le jeton de gate est indisponible. Acces bloque."
  },
  zh: {
    awakeningTitle: "觉醒",
    consentRequirement: "进入 Discovery 前必须完成明确同意。",
    consentLabel: "我同意条款与点单流程",
    safetyTitle: "安全提示",
    moodTitle: "情绪选择",
    moodPrompt: "请选择今晚的状态。",
    discoveryTitle: "发现",
    trayAdd: "加入托盘",
    order: "下单",
    slipTitle: "传票",
    handwrittenSlip: "黄色手写风传票",
    toSumimasen: "前往 SUMIMASEN",
    sumimasenTitle: "SUMIMASEN",
    callStaffDone: "已呼叫店员。",
    callStaffPending: "点击呼叫店员。",
    souvenirTitle: "数字纪念",
    souvenirSave: "保存图片",
    fallbackNotice: "店铺数据不可用: 已显示简化菜单",
    blockedTitle: "访问已阻止",
    blockedDesc: "无法获取有效 gate token，已停止访问。"
  }
};

const MOOD_LABELS: Record<LocaleKey, Record<Mood, string>> = {
  ja: { HUNGRY: "腹ペコ", RELAX: "しっぽり", ADVENTURE: "冒険" },
  en: { HUNGRY: "Hungry", RELAX: "Relax", ADVENTURE: "Adventure" },
  fr: { HUNGRY: "Affame", RELAX: "Detente", ADVENTURE: "Aventure" },
  zh: { HUNGRY: "饥饿", RELAX: "放松", ADVENTURE: "冒险" }
};

const MOOD_DETAIL: Record<LocaleKey, Record<Mood, string>> = {
  ja: {
    HUNGRY: "すぐ出る・満足感優先",
    RELAX: "会話と余韻を楽しむ",
    ADVENTURE: "店主の偏愛を体験する"
  },
  en: {
    HUNGRY: "Fast and filling first",
    RELAX: "Slow pace with pairings",
    ADVENTURE: "Chef's wild picks"
  },
  fr: {
    HUNGRY: "Rapide et consistant",
    RELAX: "Rythme lent et accords",
    ADVENTURE: "Selection audacieuse du chef"
  },
  zh: {
    HUNGRY: "优先上菜速度与饱腹感",
    RELAX: "慢节奏与搭配体验",
    ADVENTURE: "主厨偏爱与惊喜"
  }
};

const OKAMI_PRESETS: Record<LocaleKey, string[]> = {
  ja: ["wifi and payment", "where is this place", "tell me chef story", "best pairing tonight"],
  en: ["wifi and payment", "where is this place", "tell me chef story", "best pairing tonight"],
  fr: ["wifi et paiement", "ou est ce lieu", "histoire du chef", "meilleur accord ce soir"],
  zh: ["Wi-Fi与支付", "店铺位置", "讲讲主厨故事", "今晚最佳搭配"]
};

function classifyOkamiPrompt(input: string): OkamiClass {
  const q = input.toLowerCase();
  if (/(danger|safe|medical|薬|attack|exploit|bypass|jailbreak)/.test(q)) {
    return "SECURITY";
  }
  if (/(wifi|wi-fi|cash|card|charge|tip|open|close|hours|営業時間|支払い)/.test(q)) {
    return "RULE";
  }
  if (/(where|map|station|toilet|restroom|address|行き方|場所|地図)/.test(q)) {
    return "PLACE";
  }
  return "SOUL";
}

function answerOkamiPrompt(input: string): { kind: OkamiClass; text: string } {
  const kind = classifyOkamiPrompt(input);
  if (kind === "SECURITY") {
    return { kind, text: "安全確認が必要です。スタッフへ直接確認してください。SUMIMASENへ誘導します。" };
  }
  if (kind === "RULE") {
    return { kind, text: "基本ルールを確認します。" };
  }
  if (kind === "PLACE") {
    return { kind, text: "店舗案内を表示します。" };
  }
  return { kind, text: "店主のこだわり: 出汁と火入れに時間をかけ、素材の香りを最優先しています。" };
}

function sortMenuByMood(items: MenuItem[], mood: Mood) {
  const drinks = items.filter((item) => item.source === "drink");
  return [...items].sort((a, b) => {
    const aScore = scoreItemForMood(a, mood, drinks);
    const bScore = scoreItemForMood(b, mood, drinks);
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    return a.name.localeCompare(b.name, "ja");
  });
}

function isMood(value: unknown): value is Mood {
  return value === "HUNGRY" || value === "RELAX" || value === "ADVENTURE";
}

function isMenuItem(value: unknown): value is MenuItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybe = value as Partial<MenuItem>;
  return (
    typeof maybe.id === "string" &&
    typeof maybe.name === "string" &&
    typeof maybe.price === "number" &&
    Array.isArray(maybe.tags) &&
    maybe.tags.every((tag) => isMood(tag))
  );
}

export default function StoreFlowClient({ storeId }: StoreFlowClientProps) {
  const searchParams = useSearchParams();
  const mockMode = searchParams.get("mock") === "1";
  const localeQuery = searchParams.get("lang");
  const lpVariant = searchParams.get("lp") === "b" ? "b" : "a";
  const checkoutResult = searchParams.get("checkout");
  const checkoutSessionId = searchParams.get("session_id");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(mockMode ? "PAID" : "NG");
  const [gateState, setGateState] = useState<GateState>(mockMode ? "allowed" : "checking");
  const [gateToken, setGateToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("AWAKENING");
  const [gateRetryNonce, setGateRetryNonce] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(DEFAULT_MENU);
  const [tray, setTray] = useState<Record<string, number>>({});
  const [called, setCalled] = useState(false);
  const [usingFallbackMenu, setUsingFallbackMenu] = useState(false);
  const [menuCacheStale, setMenuCacheStale] = useState(false);
  const [sumimasenTracked, setSumimasenTracked] = useState(false);
  const [basicListMode, setBasicListMode] = useState(false);
  const [basicListBlockedByConsent, setBasicListBlockedByConsent] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const [showSouvenir, setShowSouvenir] = useState(false);
  const [locale, setLocale] = useState<LocaleKey>("en");
  const [okamiInput, setOkamiInput] = useState("");
  const [okamiLog, setOkamiLog] = useState<OkamiLogRow[]>([]);
  const [okamiVisualState, setOkamiVisualState] = useState<OkamiVisualState>("idle");
  const [okamiNotice, setOkamiNotice] = useState<string | null>(null);
  const [storeGuide, setStoreGuide] = useState<{
    name?: string;
    address?: string;
    sourceUrl?: string;
    mapUrl?: string;
    lpHeroImageUrl?: string;
    lpHeroVideoUrl?: string;
    businessRules?: {
      supportsCashless?: boolean;
      hasWifi?: boolean;
      hasOtoshi?: boolean;
    };
  }>({});
  const [trayFxText, setTrayFxText] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingFlipResult | null>(null);
  const [securityBlock, setSecurityBlock] = useState<string | null>(null);
  const [trayParticles, setTrayParticles] = useState<Array<{ id: string; x: number; y: number; text: string }>>([]);
  const [pairingsByFood, setPairingsByFood] = useState<Record<string, string[]>>({});
  const [bootMs, setBootMs] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [slipNo, setSlipNo] = useState<string>("");
  const [slipAt, setSlipAt] = useState<string>("");
  const [discoverySort, setDiscoverySort] = useState<DiscoverySort>("MOOD");
  const [discoverySortReady, setDiscoverySortReady] = useState(false);
  const [detailMode, setDetailMode] = useState<DetailMode>("AUTO");
  const [visitCount, setVisitCount] = useState(1);
  const [bundleRetryNonce, setBundleRetryNonce] = useState(0);
  const [billingPending, setBillingPending] = useState(false);
  const [billingCheckoutPending, setBillingCheckoutPending] = useState(false);
  const [billingCheckoutError, setBillingCheckoutError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const discoveryEnterAtRef = useRef<number | null>(null);
  const discoveryScrollStartRef = useRef<number>(0);
  const mountAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (localeQuery === "ja" || localeQuery === "en" || localeQuery === "fr" || localeQuery === "zh") {
      setLocale(localeQuery);
      return;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("tonosama_guest_locale");
    if (stored === "ja" || stored === "en" || stored === "fr" || stored === "zh") {
      setLocale(stored);
      return;
    }
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("ja")) setLocale("ja");
    else if (lang.startsWith("fr")) setLocale("fr");
    else if (lang.startsWith("zh")) setLocale("zh");
    else setLocale("en");
  }, [localeQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("tonosama_guest_locale", locale);
    const current = new URL(window.location.href);
    if (current.searchParams.get("lang") !== locale) {
      current.searchParams.set("lang", locale);
      window.history.replaceState(null, "", current.toString());
    }
  }, [locale]);

  useEffect(() => {
    if (checkoutResult === "success") {
      setBillingNotice(checkoutSessionId ? `Payment confirmed (${checkoutSessionId}).` : "Payment confirmed.");
      return;
    }
    if (checkoutResult === "cancel") {
      setBillingNotice("Payment canceled. You can continue with menu browsing.");
      return;
    }
    setBillingNotice(null);
  }, [checkoutResult, checkoutSessionId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("tonosama_guest_discovery_sort");
    if (stored === "MOOD" || stored === "PRICE_ASC" || stored === "PRICE_DESC" || stored === "NAME") {
      setDiscoverySort(stored);
    }
    setDiscoverySortReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !discoverySortReady) {
      return;
    }
    window.localStorage.setItem("tonosama_guest_discovery_sort", discoverySort);
  }, [discoverySort, discoverySortReady]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const key = `tonosama_guest_visit_count_${storeId}`;
    const current = Number.parseInt(window.localStorage.getItem(key) ?? "0", 10);
    const next = Number.isFinite(current) ? current + 1 : 1;
    window.localStorage.setItem(key, String(next));
    setVisitCount(Math.max(1, next));
  }, [storeId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setBootMs(Math.max(1, Date.now() - mountAtRef.current));
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(window.navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (mockMode) {
      setGateState("allowed");
      setGateToken("mock-token");
      return;
    }
    const fetchGate = async () => {
      setGateState("checking");
      const gate = await requestGateToken(storeId);
      if (cancelled) {
        return;
      }
      if (!gate || !isAllowed(gate.paymentStatus)) {
        setGateState("blocked");
        setGateToken(null);
        setPaymentStatus("NG");
        return;
      }
      setPaymentStatus(gate.paymentStatus);
      setGateToken(gate.token);
      setGateState("allowed");
      trackEvent("gate_allowed");
      void emitTelemetry(gate.token, "gate_allowed");
    };
    void fetchGate();
    return () => {
      cancelled = true;
    };
  }, [gateRetryNonce, mockMode, storeId]);

  useEffect(() => {
    let cancelled = false;
    if (!gateToken) {
      return;
    }
    const applyRemoteData = async () => {
      try {
        const remote = await readStoreDocuments(storeId, gateToken);
        if (cancelled) {
          return;
        }
        if (remote.paymentStatus) {
          setPaymentStatus(remote.paymentStatus);
        }
        if (remote.store) {
          setStoreGuide(remote.store);
        }
        setPairingsByFood(remote.pairings ?? {});
        const remoteItems = mergeMinimumItems(
          [...toMenuItems(remote.menuItems, "food"), ...toMenuItems(remote.drinks, "drink")],
          DEFAULT_MENU
        );
        if (remoteItems.length > 0) {
          setMenuItems(remoteItems);
          setUsingFallbackMenu(false);
          setMenuCacheStale(false);
        }
      } catch {
        if (!cancelled) {
          setMenuItems(DEFAULT_MENU);
          setUsingFallbackMenu(true);
        }
      }
    };
    void applyRemoteData();

    return () => {
      cancelled = true;
    };
  }, [bundleRetryNonce, gateToken, storeId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const cached = window.localStorage.getItem(MENU_CACHE_KEY);
    if (!cached) {
      return;
    }
    try {
      const parsed = JSON.parse(cached) as { v?: number; savedAt?: number; items?: unknown };
      if (parsed.v !== MENU_CACHE_VERSION || !Array.isArray(parsed.items)) {
        window.localStorage.removeItem(MENU_CACHE_KEY);
        return;
      }
      if (parsed.items.length > 0 && parsed.items.every((item) => isMenuItem(item))) {
        setMenuItems(parsed.items);
        const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
        const stale = !Number.isFinite(savedAt) || Date.now() - savedAt > MENU_CACHE_TTL_MS;
        setMenuCacheStale(stale);
        if (stale) {
          setUsingFallbackMenu(true);
        }
        return;
      }
      window.localStorage.removeItem(MENU_CACHE_KEY);
    } catch {
      window.localStorage.removeItem(MENU_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      MENU_CACHE_KEY,
      JSON.stringify({ v: MENU_CACHE_VERSION, savedAt: Date.now(), items: menuItems })
    );
  }, [menuItems]);

  useEffect(() => {
    if (!isAllowed(paymentStatus)) {
      setStep("AWAKENING");
    }
  }, [paymentStatus]);

  useEffect(() => {
    if (step !== "SUMIMASEN" || sumimasenTracked) {
      return;
    }
    trackEvent("sumimasen");
    void emitTelemetry(gateToken, "sumimasen");
    setSumimasenTracked(true);
  }, [gateToken, step, sumimasenTracked]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (step === "DISCOVERY") {
      discoveryEnterAtRef.current = Date.now();
      discoveryScrollStartRef.current = window.scrollY;
      return;
    }
    if (discoveryEnterAtRef.current !== null) {
      trackBehaviorSample({
        locale,
        dwellMs: Date.now() - discoveryEnterAtRef.current,
        scrollPx: Math.abs(window.scrollY - discoveryScrollStartRef.current),
        orderedItems: Object.values(tray).reduce((sum, v) => sum + v, 0)
      });
      discoveryEnterAtRef.current = null;
    }
  }, [locale, step, tray]);

  const allowed = mockMode
    ? isAllowed(paymentStatus)
    : gateState === "allowed" && !!gateToken && isAllowed(paymentStatus);

  const sortedItems = useMemo(() => {
    if (discoverySort === "PRICE_ASC") {
      return [...menuItems].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "ja"));
    }
    if (discoverySort === "PRICE_DESC") {
      return [...menuItems].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, "ja"));
    }
    if (discoverySort === "NAME") {
      return [...menuItems].sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }
    if (!mood) {
      return [...menuItems].sort((a, b) => {
        if (a.source !== b.source) {
          return a.source === "food" ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "ja");
      });
    }
    return sortMenuByMood(menuItems, mood);
  }, [discoverySort, menuItems, mood]);

  const effectiveDetailMode = useMemo<Exclude<DetailMode, "AUTO">>(() => {
    if (detailMode === "COMPACT" || detailMode === "RICH") {
      return detailMode;
    }
    if (basicListMode || mood === "HUNGRY" || visitCount >= 3) {
      return "COMPACT";
    }
    return "RICH";
  }, [basicListMode, detailMode, mood, visitCount]);

  const trayEntries = useMemo(() => {
    const index = new Map(menuItems.map((item) => [item.id, item]));
    return Object.entries(tray)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({
        id,
        count,
        item: index.get(id)
      }))
      .filter((entry): entry is { id: string; count: number; item: MenuItem } => !!entry.item);
  }, [menuItems, tray]);

  const total = trayEntries.reduce((sum, entry) => sum + entry.item.price * entry.count, 0);

  function createDemoSlip() {
    setSlipNo(`S-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`);
    setSlipAt(new Date().toISOString());
  }

  function runDemoPreset(target: DemoTarget) {
    if (!mockMode) {
      return;
    }
    if (target === "BLOCKED") {
      setPaymentStatus("NG");
      setStep("AWAKENING");
      return;
    }
    setPaymentStatus("PAID");
    setGateState("allowed");
    setConsentChecked(true);
    setBasicListMode(false);
    setBasicListBlockedByConsent(false);
    setShowSouvenir(false);
    setCalled(false);
    setSecurityBlock(null);

    if (target === "AWAKENING") {
      setStep("AWAKENING");
      return;
    }
    if (target === "MOOD") {
      setStep("MOOD");
      return;
    }

    setMood("HUNGRY");
    if (trayEntries.length === 0) {
      const fallbackId = menuItems[0]?.id ?? "ramen";
      setTray({ [fallbackId]: 1 });
    }

    if (target === "DISCOVERY") {
      setStep("DISCOVERY");
      return;
    }

    createDemoSlip();
    if (target === "SLIP") {
      setStep("SLIP");
      return;
    }
    setStep("SUMIMASEN");
  }

  function addToTray(itemId: string, triggerEl?: HTMLElement) {
    const hit = menuItems.find((item) => item.id === itemId);

    setTray((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
    setLastAddedItemId(itemId);
    setTrayFxText(`コトッ ${hit?.name ?? "Item"}`);
    playTraySound();
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      const id = `${Date.now()}-${itemId}`;
      const fx = ["🍽", "🥢", "✨", "🍶"][Math.floor(Math.random() * 4)] ?? "🍽";
      setTrayParticles((prev) => [...prev, { id, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: fx }]);
      setTimeout(() => {
        setTrayParticles((prev) => prev.filter((particle) => particle.id !== id));
      }, 900);
    }
    setTimeout(() => {
      setLastAddedItemId((current) => (current === itemId ? null : current));
    }, 500);
    setTimeout(() => {
      setTrayFxText(null);
    }, 900);
  }

  function removeFromTray(itemId: string) {
    setTray((prev) => {
      const current = prev[itemId] ?? 0;
      if (current <= 1) {
        const { [itemId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: current - 1 };
    });
  }

  function renderAwakening() {
    const t = LOCALE_LABELS[locale];
    const ui = UI_TEXT[locale];
    const hook = HOOK_COPY[locale];
    const decisionLine = lpVariant === "a" ? HOOK_DECISION[locale] : `${HOOK_DECISION[locale]} / Variant B`;
    return (
      <section className="card flow-card awakening">
        <p className="runtime-kicker">Awakening Layer</p>
        <h1>{ui.awakeningTitle} / Unlock The Soul</h1>
        <p className="runtime-sub">店舗: {storeId}</p>
        <p className="small">Locale: {locale.toUpperCase()} / Payment: {paymentStatus}</p>
        <p className="small">Visit: {visitCount} / Detail: {effectiveDetailMode}</p>
        <p className="small">
          Network: {isOnline ? "online" : "offline"} / Render: {bootMs ?? "-"}ms
        </p>
        {storeGuide.lpHeroVideoUrl ? (
          <video className="hook-hero-video" src={storeGuide.lpHeroVideoUrl} autoPlay muted loop playsInline />
        ) : storeGuide.lpHeroImageUrl ? (
          <img src={storeGuide.lpHeroImageUrl} alt="Store hero" className="hook-hero-image" />
        ) : (
          <div className="hook-hero" aria-hidden="true" />
        )}
        <div className="hook-blocks">
          <p className="small hook-line">1. {hook.empathy}</p>
          <p className="small hook-line">2. {hook.agitation}</p>
          <p className="small hook-line">3. {hook.solution}</p>
          <p className="small hook-line">4. {decisionLine}</p>
          <p className="small hook-line">5. {lpVariant === "a" ? hook.proof : hook.guarantee}</p>
        </div>
        <div className="experience-points">
          <p className="small">3 taps to complete your first order.</p>
          <p className="small">No account required. No hidden screens.</p>
          <p className="small">Switch to basic mode anytime.</p>
        </div>
        <div className="locale-switch" aria-label="language switcher">
          {(["ja", "en", "fr", "zh"] as const).map((k) => (
            <button key={k} className={`btn btn-quiet ${locale === k ? "is-active" : ""}`} type="button" onClick={() => setLocale(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="small">{t.welcome}</p>
        <p>{t.prompt}</p>
        <p className="small">{ui.consentRequirement}</p>
        <p className="small">{OPERATIONS_NOTICE[locale]}</p>
        <p className="small">{CLICKWRAP_TEXT[locale]}</p>
        <label className="checkline">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => {
              setConsentChecked(e.target.checked);
              if (e.target.checked) {
                setBasicListBlockedByConsent(false);
              }
            }}
            data-testid="consent-checkbox"
          />
          <span>{ui.consentLabel}</span>
        </label>
        <button
          className="btn btn-unlock"
          type="button"
          disabled={!consentChecked}
          onClick={() => {
            trackEvent("consent");
            void emitTelemetry(gateToken, "consent");
            setBasicListMode(false);
            setBasicListBlockedByConsent(false);
            setStep("MOOD");
          }}
          data-testid="consent-next-button"
        >
          {t.unlock}
        </button>
        <button
          className="btn btn-quiet btn-plain"
          type="button"
          onClick={() => {
            if (!consentChecked) {
              setBasicListBlockedByConsent(true);
              return;
            }
            setBasicListMode(true);
            setMood(null);
            setStep("DISCOVERY");
          }}
          data-testid="basic-list-button"
        >
          {t.basic}
        </button>
        {basicListBlockedByConsent ? (
          <p className="small caution" data-testid="basic-list-consent-required">
            {ui.consentRequirement}
          </p>
        ) : null}
      </section>
    );
  }

  function renderMood() {
    const ui = UI_TEXT[locale];
    async function decideMood(next: Mood, telemetryMood: "Hungry" | "Relax" | "Adventure") {
      setMood(next);
      trackEvent("mood");
      void emitTelemetry(gateToken, "mood", { mood: telemetryMood });
      setBillingPending(true);
      void runBillingFlip(gateToken, next)
        .then((result) => {
          if (result) {
            setBilling(result);
          }
        })
        .finally(() => {
          setBillingPending(false);
        });
      setStep("DISCOVERY");
    }

    return (
      <section className="card flow-card">
        <p className="runtime-kicker">Mood Gateway</p>
        <h1>{ui.moodTitle}</h1>
        <p className="runtime-sub">{ui.moodPrompt}</p>
        <div className="mood-grid">
          <button
            className="btn mood-tile"
            type="button"
            onClick={() => {
              void decideMood("HUNGRY", "Hungry");
            }}
            data-testid="mood-hungry"
          >
            <span className="mood-emoji">🍚</span>
            <span>
              <strong>{MOOD_LABELS[locale].HUNGRY}</strong>
              <span className="small">{MOOD_DETAIL[locale].HUNGRY}</span>
            </span>
          </button>
          <button
            className="btn mood-tile"
            type="button"
            onClick={() => {
              void decideMood("RELAX", "Relax");
            }}
            data-testid="mood-relax"
          >
            <span className="mood-emoji">🍶</span>
            <span>
              <strong>{MOOD_LABELS[locale].RELAX}</strong>
              <span className="small">{MOOD_DETAIL[locale].RELAX}</span>
            </span>
          </button>
          <button
            className="btn mood-tile"
            type="button"
            onClick={() => {
              void decideMood("ADVENTURE", "Adventure");
            }}
            data-testid="mood-adventure"
          >
            <span className="mood-emoji">💎</span>
            <span>
              <strong>{MOOD_LABELS[locale].ADVENTURE}</strong>
              <span className="small">{MOOD_DETAIL[locale].ADVENTURE}</span>
            </span>
          </button>
        </div>
      </section>
    );
  }

  async function handleOkamiAsk() {
    const q = okamiInput.trim();
    if (!q) {
      return;
    }
    setOkamiNotice(null);
    setOkamiVisualState("thinking");
    void emitTelemetry(gateToken, "okami_ask");
    const remote = await requestOkamiAnswer(gateToken, q);
    const result = remote.status === "ok" ? remote.answer : answerOkamiPrompt(q);
    const source: "api" | "fallback" = remote.status === "ok" ? "api" : "fallback";
    if (remote.status === "ok") {
      void emitTelemetry(gateToken, "okami_api");
    } else {
      void emitTelemetry(gateToken, "okami_fallback");
      if (remote.status === "rate_limited") {
        setOkamiNotice("Okami is rate-limited. Fallback answer is shown.");
        void emitTelemetry(gateToken, "okami_rate_limited");
      } else if (remote.status === "unauthorized") {
        setOkamiNotice("Okami token is unavailable. Fallback answer is shown.");
      } else {
        setOkamiNotice("Okami is temporarily unavailable. Fallback answer is shown.");
      }
    }
    const rulesAnswer = [
      `cashless:${storeGuide.businessRules?.supportsCashless ? "yes" : "no"}`,
      `wifi:${storeGuide.businessRules?.hasWifi ? "yes" : "no"}`,
      `otoshi:${storeGuide.businessRules?.hasOtoshi ? "yes" : "no"}`
    ].join(" / ");
    const placeAnswer =
      result.kind === "PLACE"
        ? `${storeGuide.name ? `${storeGuide.name} / ` : ""}${storeGuide.address ? `${storeGuide.address} / ` : ""}${
            storeGuide.mapUrl ? `Map: ${storeGuide.mapUrl}` : result.text
          }`
        : result.kind === "RULE"
          ? `Rules: ${rulesAnswer}`
          : result.text;
    setOkamiLog((prev) => [...prev, { q, kind: result.kind, a: placeAnswer, source }].slice(-8));
    setOkamiInput("");
    setOkamiVisualState("speaking");
    setTimeout(() => {
      setOkamiVisualState("idle");
    }, 800);
    if (result.kind === "SECURITY") {
      void emitTelemetry(gateToken, "okami_blocked");
      setStep("SUMIMASEN");
    }
  }

  function renderDiscovery() {
    const ui = UI_TEXT[locale];
    async function handleBillingCheckout() {
      if (!mood || billingCheckoutPending) {
        return;
      }
      setBillingCheckoutError(null);
      setBillingCheckoutPending(true);
      try {
        const result = await runBillingCheckout(gateToken, mood);
        if (!result) {
          setBillingCheckoutError("Checkout unavailable.");
          return;
        }
        if (result.checkoutRequired && result.checkoutUrl && typeof window !== "undefined") {
          window.location.href = result.checkoutUrl;
          return;
        }
      } catch {
        setBillingCheckoutError("Checkout unavailable.");
      } finally {
        setBillingCheckoutPending(false);
      }
    }

    return (
      <>
      <section className="card flow-card">
        <p className="runtime-kicker">Discovery Feed</p>
        <h1>{ui.discoveryTitle}</h1>
        <p className="small">Mood: {basicListMode ? "BASIC" : mood ? MOOD_LABELS[locale][mood] : "-"}</p>
        <p className="small">{moodNarrative(locale, mood, basicListMode)}</p>
        <div className="experience-points">
          <p className="small">Tap once to add. Tap twice to tune quantity from the tray.</p>
          <p className="small">Ask Okami for place, service rules, and best pairing in your language.</p>
        </div>
        <label className="small" htmlFor="discovery-sort">
          Sort:
          <select
            id="discovery-sort"
            className="status-select discovery-sort-select"
            value={discoverySort}
            onChange={(e) => setDiscoverySort(e.target.value as DiscoverySort)}
            data-testid="discovery-sort"
          >
            <option value="MOOD">Mood</option>
            <option value="PRICE_ASC">Price: low to high</option>
            <option value="PRICE_DESC">Price: high to low</option>
            <option value="NAME">Name</option>
          </select>
        </label>
        <div className="locale-switch" aria-label="detail mode switcher">
          <button
            className={`btn btn-quiet ${detailMode === "AUTO" ? "is-active" : ""}`}
            type="button"
            onClick={() => setDetailMode("AUTO")}
            data-testid="detail-auto"
          >
            Auto
          </button>
          <button
            className={`btn btn-quiet ${detailMode === "COMPACT" ? "is-active" : ""}`}
            type="button"
            onClick={() => setDetailMode("COMPACT")}
            data-testid="detail-compact"
          >
            Quick
          </button>
          <button
            className={`btn btn-quiet ${detailMode === "RICH" ? "is-active" : ""}`}
            type="button"
            onClick={() => setDetailMode("RICH")}
            data-testid="detail-rich"
          >
            Detailed
          </button>
        </div>
        <div className="okami">
          <p className="small">Phase2 Context</p>
          <p className="small">
            Pairing Matrix: {menuItems.filter((x) => x.source === "drink").length} drinks / Master Menu:{" "}
            {menuItems.filter((x) => x.source === "food").length} foods
          </p>
          {effectiveDetailMode === "RICH" ? (
            <p className="small">
              Review Sync: {storeGuide.businessRules ? "ready" : "syncing"}
            </p>
          ) : null}
        </div>
        {securityBlock ? <p className="small caution">Security: {securityBlock}</p> : null}
        {!basicListMode && (mood === "RELAX" || mood === "ADVENTURE") ? (
          <p className="small pairing-hint">
            Best Match: {describeBestPairing(menuItems, locale, pairingsByFood) ?? "スタッフおすすめの地酒"}
          </p>
        ) : null}
        {billing ? (
          <p className="small">
            Billing: {billing.mode === "STORE_PAYS" ? "店舗負担 187円" : "ゲスト負担 198円"} (flip accepted)
          </p>
        ) : null}
        {billingNotice ? <p className="small">{billingNotice}</p> : null}
        {billing?.mode === "GUEST_PAYS" ? (
          <div className="okami">
            <button
              className="btn"
              type="button"
              disabled={billingCheckoutPending || !mood}
              onClick={() => {
                void handleBillingCheckout();
              }}
              data-testid="billing-checkout-button"
            >
              {billingCheckoutPending ? "Processing payment..." : "Pay 198 JPY"}
            </button>
            {billingCheckoutError ? <p className="small caution">{billingCheckoutError}</p> : null}
          </div>
        ) : null}
        {billingPending ? <p className="small" data-testid="billing-pending">Billing: processing...</p> : null}
        {usingFallbackMenu ? (
          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => setBundleRetryNonce((v) => v + 1)}
            data-testid="retry-bundle-button"
          >
            Retry Store Data
          </button>
        ) : null}
        {storeGuide.sourceUrl ? (
          <p className="small">
            Official: <a href={storeGuide.sourceUrl}>{storeGuide.sourceUrl}</a>
          </p>
        ) : null}
        {(storeGuide.name || storeGuide.address) && effectiveDetailMode === "RICH" ? (
          <div className="okami">
            <p className="small">Store Summary</p>
            {storeGuide.name ? <p className="small">Name: {storeGuide.name}</p> : null}
            {storeGuide.address ? <p className="small">Address: {storeGuide.address}</p> : null}
          </div>
        ) : null}
        {storeGuide.mapUrl ? (
          <p className="small">
            Map: <a href={storeGuide.mapUrl}>open map</a>
          </p>
        ) : null}
        {!isOnline ? <p className="small caution">offline: map and external links may fail</p> : null}
        <ul className="menu-list">
          {sortedItems.map((item) => (
            <li key={item.id} className={`menu-item ${lastAddedItemId === item.id ? "added" : ""}`}>
              <div>
                <div className={`menu-thumb ${item.source}`} aria-hidden="true" />
                <strong>{item.name}</strong>
                <p className="small">¥{item.price}</p>
                {!basicListMode && item.source === "food" && (mood === "RELAX" || mood === "ADVENTURE") ? (
                  <>
                    <p className="small pairing-hint">
                      🍶 Best Match: {describePairingForItem(item, menuItems, locale, pairingsByFood) ?? "スタッフおすすめ"}
                    </p>
                    <p className="small">
                      Pairing Top3: {describeTopPairingsForItem(item, menuItems, locale, pairingsByFood).join(" / ") || "スタッフおすすめ"}
                    </p>
                  </>
                ) : null}
                {basicListMode || effectiveDetailMode === "COMPACT" ? null : <p className="small">tags: {item.rawTags.join(", ") || "-"}</p>}
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={(e) => {
                    trackEvent("tray_add");
                    void emitTelemetry(gateToken, "tray_add");
                    addToTray(item.id, e.currentTarget);
                  }}
                  data-testid={`add-${item.id}`}
                >
                  {ui.trayAdd}
                </button>
              </li>
            ))}
        </ul>
        {!basicListMode ? (
          <>
            <section className="okami">
              <h2>Elegant Okami</h2>
              <p className="small">[SECURITY] / [RULE] / [PLACE] / [SOUL]</p>
              <OkamiAvatar status={okamiVisualState} />
              <ChatStream
                messages={okamiLog.flatMap((row, idx) => [
                  {
                    id: `${idx}-q`,
                    role: "user" as const,
                    text: row.q
                  },
                  {
                    id: `${idx}-a`,
                    role: "okami" as const,
                    label: `${row.kind}/${row.source}`,
                    text: row.a
                  }
                ])}
                input={okamiInput}
                notice={okamiNotice}
                presets={OKAMI_PRESETS[locale]}
                onInputChange={setOkamiInput}
                onSubmit={() => {
                  void handleOkamiAsk();
                }}
                onPreset={setOkamiInput}
              />
            </section>
          </>
        ) : (
          <p className="small" data-testid="basic-list-hint">Basic list mode keeps only image + price + quick add.</p>
        )}
      </section>
        <aside className={`tray ${trayFxText ? "is-dropping" : ""}`}>
          <div>
            <strong>Tray</strong>
            <p className="small">{trayEntries.length} 種 / 合計 ¥{total}</p>
            {trayFxText ? (
              <p className="small tray-fx" data-testid="tray-fx" aria-live="polite">
                {trayFxText}
              </p>
            ) : null}
            {trayEntries.length > 0 ? (
              <ul className="tray-list">
                {trayEntries.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {entry.item.name} x {entry.count}
                    </span>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => removeFromTray(entry.id)}
                      data-testid={`tray-dec-${entry.id}`}
                    >
                      -
                    </button>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => setTray((prev) => ({ ...prev, [entry.id]: (prev[entry.id] ?? 0) + 1 }))}
                      data-testid={`tray-inc-${entry.id}`}
                    >
                      +
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            className="btn"
            type="button"
            disabled={trayEntries.length === 0}
            onClick={() => {
              trackEvent("slip");
              void emitTelemetry(gateToken, "slip");
              createDemoSlip();
              setStep("SLIP");
            }}
            data-testid="order-button"
          >
            {ui.order}
          </button>
        </aside>
        <div className="tray-particles" aria-hidden="true">
          {trayParticles.map((particle) => (
            <span key={particle.id} className="tray-particle" style={{ left: particle.x, top: particle.y }}>
              {particle.text}
            </span>
          ))}
        </div>
      </>
    );
  }

  function renderSlip() {
    const ui = UI_TEXT[locale];
    return (
      <section className="card flow-card slip">
        <h1>{ui.slipTitle}</h1>
        <p>{ui.handwrittenSlip}</p>
        <p className="small" data-testid="slip-no">No: {slipNo || "S-000000"}</p>
        <p className="small">At: {slipAt ? slipAt.replace("T", " ").slice(0, 19) : "-"}</p>
        <ul className="menu-list">
          {trayEntries.map((entry) => (
            <li key={entry.id} className="menu-item">
              <span>{entry.item.name}</span>
              <span>
                {entry.count} x ¥{entry.item.price}
              </span>
            </li>
          ))}
        </ul>
        <p>
          <strong>合計: ¥{total}</strong>
        </p>
        <button className="btn" type="button" onClick={() => setStep("SUMIMASEN")} data-testid="to-sumimasen-button">
          {ui.toSumimasen}
        </button>
      </section>
    );
  }

  function renderSumimasen() {
    const ui = UI_TEXT[locale];
    return (
      <section className="card flow-card">
        <h1>{ui.sumimasenTitle}</h1>
        <button
          className={`sumimasen ${called ? "is-called" : ""}`}
          type="button"
          onClick={() => {
            setCalled(true);
          }}
          data-testid="sumimasen-button"
        >
          SUMIMASEN
        </button>
        <p className="small">{called ? ui.callStaffDone : ui.callStaffPending}</p>
        <p className="small">Slip: {slipNo || "-"}</p>
        <p className="small">Show this screen to staff after saying "SUMIMASEN".</p>
        <button className="btn" type="button" onClick={() => setShowSouvenir((v) => !v)}>
          {ui.souvenirTitle}
        </button>
        {showSouvenir ? (
          <section className="souvenir">
            <h2>{ui.souvenirTitle}</h2>
            <p className="small">Thank you for dining at {storeId}</p>
            <p className="small">{formatSouvenirStamp(locale, mood)}</p>
            <ul className="menu-list">
              {trayEntries.map((entry) => (
                <li key={entry.id} className="menu-item">
                  <span>{entry.item.name}</span>
                  <span>
                    {entry.count} x ¥{entry.item.price}
                  </span>
                </li>
              ))}
            </ul>
            <button
              className="btn"
              type="button"
              onClick={() => {
                const url = generateSouvenirImageUrl(
                  storeId,
                  trayEntries,
                  total,
                  mood,
                  describeBestPairing(menuItems, locale, pairingsByFood)
                );
                if (typeof window !== "undefined" && url) {
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${storeId}-souvenir.png`;
                  a.click();
                }
              }}
            >
              {ui.souvenirSave}
            </button>
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() => {
                if (typeof navigator === "undefined" || !("share" in navigator)) {
                  return;
                }
                void navigator.share({
                  title: "TONOSAMA Digital Souvenir",
                  text: `Thank you from ${storeId}. Total ¥${total}`
                });
              }}
            >
              Share
            </button>
          </section>
        ) : null}
      </section>
    );
  }

  return (
    <main>
      <div className="flow-shell">
        <section className="card flow-card runtime-hero">
          <p className="runtime-kicker">Tonosama Guest Runtime</p>
          <h1 className="runtime-title">Do Not Just Eat.</h1>
          <p className="runtime-sub">Unlock soul-driven dining in your language, with pairing and guided ordering.</p>
        </section>

        <section className="card flow-card">
          <h1>Guest Runtime</h1>
          <p className="small">storeId: {storeId}</p>
          {!isOnline ? <p className="small caution">offline mode: network is unavailable</p> : null}
          {mockMode ? (
            <label className="small">
              paymentStatus:
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                className="status-select"
                data-testid="payment-status-select"
              >
                <option value="PAID">PAID</option>
                <option value="TRIAL">TRIAL</option>
                <option value="NG">NG</option>
              </select>
            </label>
          ) : (
            <p className="small" data-testid="gate-state">
              gate: {gateState}
            </p>
          )}
          <p className="small">network: {isOnline ? "online" : "offline"}</p>
          {billingNotice ? <p className="small">{billingNotice}</p> : null}
          {usingFallbackMenu ? <p className="small">{UI_TEXT[locale].fallbackNotice}</p> : null}
          {menuCacheStale ? <p className="small caution">cached menu is stale; retry store data when online.</p> : null}
        </section>

        {mockMode ? (
          <section className="card flow-card demo-guide" data-testid="demo-guide">
            <h2>Sample Guide</h2>
            <p className="small">このURLはモックモードです。実データ不要で挙動を確認できます。</p>
            <p className="small">
              推奨URL: <code>/s/{storeId}?mock=1&lang=ja</code>
            </p>
            <ol className="demo-steps">
              <li>1. `NGブロック` で fail-closed を確認</li>
              <li>2. `Awakening` で同意チェックを確認</li>
              <li>3. `Mood` から `Discovery` へ進行</li>
              <li>4. `Slip` と `SUMIMASEN` で注文完了まで確認</li>
            </ol>
            <div className="demo-jump">
              <button className="btn btn-quiet" type="button" onClick={() => runDemoPreset("BLOCKED")}>
                NGブロック
              </button>
              <button className="btn btn-quiet" type="button" onClick={() => runDemoPreset("AWAKENING")}>
                Awakening
              </button>
              <button className="btn btn-quiet" type="button" onClick={() => runDemoPreset("MOOD")}>
                Mood
              </button>
              <button className="btn btn-quiet" type="button" onClick={() => runDemoPreset("DISCOVERY")}>
                Discovery
              </button>
              <button className="btn btn-quiet" type="button" onClick={() => runDemoPreset("SLIP")}>
                Slip
              </button>
              <button className="btn btn-quiet" type="button" onClick={() => runDemoPreset("SUMIMASEN")}>
                SUMIMASEN
              </button>
            </div>
          </section>
        ) : null}

        {!mockMode && gateState === "checking" ? (
          <section className="card flow-card">
            <h1>Gate Check</h1>
            <p>アクセス確認中です。</p>
          </section>
        ) : null}

        {!allowed && gateState !== "checking" ? (
          <section className="card flow-card blocked">
            <h1 data-testid="blocked-title">{UI_TEXT[locale].blockedTitle}</h1>
            <p>{UI_TEXT[locale].blockedDesc}</p>
            <button className="btn" type="button" onClick={() => setGateRetryNonce((v) => v + 1)} data-testid="retry-gate-button">
              Retry Gate
            </button>
          </section>
        ) : null}

        {allowed && step === "AWAKENING" ? renderAwakening() : null}
        {allowed && step === "MOOD" && !basicListMode ? renderMood() : null}
        {allowed && step === "DISCOVERY" ? renderDiscovery() : null}
        {allowed && step === "SLIP" ? renderSlip() : null}
        {allowed && step === "SUMIMASEN" ? renderSumimasen() : null}
        {allowed ? (
          <section className="card safety-note" data-testid="safety-disclaimer">
            <h2>{UI_TEXT[locale].safetyTitle}</h2>
            <p className="small">{OPERATIONS_NOTICE[locale]}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function playTraySound(): void {
  if (typeof window === "undefined") {
    return;
  }
  const AudioCtx = window.AudioContext;
  if (!AudioCtx) {
    return;
  }
  const ctx = new AudioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = 320;
  g.gain.value = 0.0001;
  o.connect(g);
  g.connect(ctx.destination);
  const now = ctx.currentTime;
  g.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  o.start(now);
  o.stop(now + 0.13);
}

function generateSouvenirImageUrl(
  storeId: string,
  entries: Array<{ id: string; count: number; item: MenuItem }>,
  total: number,
  mood: Mood | null,
  pairing: string | null
): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "#fff8dc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 58px serif";
  ctx.fillText("TONOSAMA", 80, 120);
  ctx.font = "32px sans-serif";
  ctx.fillText(`Store: ${storeId}`, 80, 190);
  ctx.fillText("Digital Souvenir", 80, 235);
  ctx.fillText(`Mood: ${mood ?? "-"}`, 80, 278);
  let y = 320;
  ctx.font = "30px sans-serif";
  for (const row of entries) {
    ctx.fillText(`${row.item.name}  x${row.count}`, 80, y);
    y += 52;
  }
  y += 20;
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(`TOTAL: ¥${total}`, 80, y);
  y += 80;
  ctx.font = "28px sans-serif";
  if (pairing) {
    ctx.fillText(`Best Pairing: ${pairing}`, 80, y);
    y += 42;
  }
  ctx.fillText("Thank you for dining in Japan.", 80, y);
  drawPseudoQr(ctx, 860, 110, `${storeId}-${total}-${mood ?? "none"}`);
  return canvas.toDataURL("image/png");
}

function normalizeTags(tags: string[] | undefined, fallback: Mood): Mood[] {
  const mapped = (tags ?? [])
    .map((tag) => {
      if (tag === "HUNGRY" || tag === "RELAX" || tag === "ADVENTURE") return tag;
      return null;
    })
    .filter((tag): tag is Mood => !!tag);
  if (mapped.length > 0) {
    return mapped;
  }
  return [fallback];
}

function toMenuItems(items: RemoteCatalogItem[], kind: "food" | "drink"): MenuItem[] {
  return items.map((item) => ({
    id: item.id,
    name: kind === "drink" ? `[Drink] ${item.name}` : item.name,
    price: item.price,
    tags: normalizeTags(item.tags, kind === "drink" ? "RELAX" : "HUNGRY"),
    source: kind,
    rawTags: (item.tags ?? []).filter((tag): tag is string => typeof tag === "string")
  }));
}

function mergeMinimumItems(primary: MenuItem[], fallback: MenuItem[]): MenuItem[] {
  if (primary.length >= 3) {
    return primary;
  }
  const taken = new Set(primary.map((item) => item.id));
  const merged = [...primary];
  for (const entry of fallback) {
    if (merged.length >= 3) {
      break;
    }
    if (taken.has(entry.id)) {
      continue;
    }
    merged.push(entry);
    taken.add(entry.id);
  }
  return merged.length > 0 ? merged : fallback;
}

function pickBestPairing(items: MenuItem[]): string | null {
  const drink = items.find((item) => item.source === "drink");
  return drink ? drink.name.replace("[Drink] ", "") : null;
}

function extractTagNumber(tags: string[], prefix: string, fallback: number): number {
  const hit = tags.find((tag) => tag.startsWith(`${prefix}:`));
  if (!hit) {
    return fallback;
  }
  const parsed = Number.parseInt(hit.slice(prefix.length + 1), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractTagValue(tags: string[], prefix: string): string | null {
  const hit = tags.find((tag) => tag.startsWith(`${prefix}:`));
  if (!hit) {
    return null;
  }
  return hit.slice(prefix.length + 1).toLowerCase();
}

function flavorAffinityScore(foodFlavor: string | null, drinkFlavor: string | null): number {
  if (!foodFlavor || !drinkFlavor) {
    return 1;
  }
  if (foodFlavor === drinkFlavor) {
    return 3;
  }
  const pairs = new Set([
    "rich:light",
    "light:rich",
    "spicy:sweet",
    "sweet:spicy",
    "umami:dry",
    "salty:sweet",
    "fatty:acidic",
    "acidic:fatty"
  ]);
  return pairs.has(`${foodFlavor}:${drinkFlavor}`) ? 2 : 0;
}

function temperatureAffinityScore(foodTemp: string | null, drinkTemp: string | null): number {
  if (!foodTemp || !drinkTemp) {
    return 0;
  }
  if (foodTemp === drinkTemp) {
    return 2;
  }
  const pairs = new Set(["hot:cold", "cold:hot"]);
  return pairs.has(`${foodTemp}:${drinkTemp}`) ? 1 : 0;
}

function bodyAffinityScore(foodBody: string | null, drinkBody: string | null): number {
  if (!foodBody || !drinkBody) {
    return 0;
  }
  if (foodBody === drinkBody) {
    return 2;
  }
  const pairs = new Set(["heavy:light", "light:heavy"]);
  return pairs.has(`${foodBody}:${drinkBody}`) ? 1 : 0;
}

function acidityAffinityScore(foodAcid: string | null, drinkAcid: string | null): number {
  if (!foodAcid || !drinkAcid) {
    return 0;
  }
  if (foodAcid === drinkAcid) {
    return 1;
  }
  return 0;
}

function pairingScore(food: MenuItem, drink: MenuItem): number {
  const foodFlavor = extractTagValue(food.rawTags, "flavor");
  const drinkFlavor = extractTagValue(drink.rawTags, "flavor");
  const foodStory = extractTagNumber(food.rawTags, "story", 0);
  const drinkStory = extractTagNumber(drink.rawTags, "story", 0);
  const foodTemp = extractTagValue(food.rawTags, "temp");
  const drinkTemp = extractTagValue(drink.rawTags, "temp");
  const foodBody = extractTagValue(food.rawTags, "body");
  const drinkBody = extractTagValue(drink.rawTags, "body");
  const foodAcid = extractTagValue(food.rawTags, "acidity");
  const drinkAcid = extractTagValue(drink.rawTags, "acidity");
  return (
    flavorAffinityScore(foodFlavor, drinkFlavor) +
    temperatureAffinityScore(foodTemp, drinkTemp) +
    bodyAffinityScore(foodBody, drinkBody) +
    acidityAffinityScore(foodAcid, drinkAcid) +
    Math.min(foodStory, drinkStory)
  );
}

function scoreItemForMood(item: MenuItem, mood: Mood, drinks: MenuItem[]): number {
  const moodBoost = item.tags.includes(mood) ? 20 : 0;
  const speed = extractTagNumber(item.rawTags, "speed", item.source === "food" ? 3 : 1);
  const volume = extractTagNumber(item.rawTags, "volume", item.source === "food" ? 3 : 1);
  const course = extractTagNumber(item.rawTags, "course", item.source === "food" ? 2 : 1);
  const story = extractTagNumber(item.rawTags, "story", 1);

  if (mood === "HUNGRY") {
    return moodBoost + speed * 4 + volume * 5;
  }
  if (mood === "RELAX") {
    const relaxPairBoost =
      item.source === "food" ? Math.max(0, ...drinks.map((drink) => pairingScore(item, drink))) : story;
    return moodBoost + course * 4 + story * 2 + relaxPairBoost + (item.source === "drink" ? 2 : 0);
  }
  const pairScore =
    item.source === "food"
      ? Math.max(0, ...drinks.map((drink) => pairingScore(item, drink)))
      : extractTagNumber(item.rawTags, "story", 1);
  return moodBoost + story * 5 + pairScore * 3;
}

function pickPairingForItem(food: MenuItem, items: MenuItem[]): string | null {
  if (food.source !== "food") {
    return null;
  }
  const drinks = items.filter((item) => item.source === "drink");
  if (drinks.length === 0) {
    return null;
  }
  const best = [...drinks].sort((a, b) => pairingScore(food, b) - pairingScore(food, a))[0];
  return best?.name.replace("[Drink] ", "") ?? null;
}

function getRankedDrinksForFood(food: MenuItem, items: MenuItem[], pairingsByFood?: Record<string, string[]>): MenuItem[] {
  const drinks = items.filter((item) => item.source === "drink");
  if (drinks.length === 0) {
    return [];
  }
  const remoteIds = pairingsByFood?.[food.id];
  if (remoteIds && remoteIds.length > 0) {
    const rankMap = new Map(remoteIds.map((id, index) => [id, index]));
    return [...drinks].sort((a, b) => {
      const aRank = rankMap.has(a.id) ? (rankMap.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const bRank = rankMap.has(b.id) ? (rankMap.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return pairingScore(food, b) - pairingScore(food, a);
    });
  }
  return [...drinks].sort((a, b) => pairingScore(food, b) - pairingScore(food, a));
}

function describePairingForItem(
  food: MenuItem,
  items: MenuItem[],
  locale: LocaleKey,
  pairingsByFood?: Record<string, string[]>
): string | null {
  if (food.source !== "food") {
    return null;
  }
  const drinks = getRankedDrinksForFood(food, items, pairingsByFood);
  if (drinks.length === 0) {
    return null;
  }
  const best = drinks[0];
  if (!best) {
    return null;
  }
  const score = pairingScore(food, best);
  return `${best.name.replace("[Drink] ", "")} (score:${score}, ${PAIRING_RATIONALE_LABEL[locale]}:${pairingReason(food, best, locale)})`;
}

function describeBestPairing(items: MenuItem[], locale: LocaleKey, pairingsByFood?: Record<string, string[]>): string | null {
  const foods = items.filter((item) => item.source === "food");
  if (foods.length === 0) {
    return pickBestPairing(items);
  }
  const ranked = foods
    .map((food) => ({ food, pick: describePairingForItem(food, items, locale, pairingsByFood) }))
    .filter((row): row is { food: MenuItem; pick: string } => !!row.pick);
  if (ranked.length === 0) {
    return pickBestPairing(items);
  }
  return ranked[0].pick;
}

function describeTopPairingsForItem(
  food: MenuItem,
  items: MenuItem[],
  locale: LocaleKey,
  pairingsByFood?: Record<string, string[]>
): string[] {
  if (food.source !== "food") {
    return [];
  }
  return getRankedDrinksForFood(food, items, pairingsByFood)
    .map((drink) => ({
      drink,
      score: pairingScore(food, drink)
    }))
    .slice(0, 3)
    .map((row) => `${row.drink.name.replace("[Drink] ", "")}(${row.score}, ${pairingReason(food, row.drink, locale)})`);
}

function pairingReason(food: MenuItem, drink: MenuItem, locale: LocaleKey): string {
  const foodFlavor = extractTagValue(food.rawTags, "flavor");
  const drinkFlavor = extractTagValue(drink.rawTags, "flavor");
  const foodTemp = extractTagValue(food.rawTags, "temp");
  const drinkTemp = extractTagValue(drink.rawTags, "temp");
  const reasons: string[] = [];
  if (foodFlavor && drinkFlavor) {
    reasons.push(locale === "ja" ? `flavor:${foodFlavor}×${drinkFlavor}` : `flavor:${foodFlavor}x${drinkFlavor}`);
  }
  if (foodTemp && drinkTemp) {
    reasons.push(locale === "ja" ? `temp:${foodTemp}×${drinkTemp}` : `temp:${foodTemp}x${drinkTemp}`);
  }
  if (reasons.length === 0) {
    return locale === "ja" ? "story match" : "story match";
  }
  return reasons.join("+");
}

function moodNarrative(locale: LocaleKey, mood: Mood | null, basicListMode: boolean): string {
  if (basicListMode) {
    if (locale === "ja") return "Basic list mode: 画像と価格を優先表示します。";
    if (locale === "fr") return "Mode basique: image et prix en priorite.";
    if (locale === "zh") return "基础列表模式: 优先显示图片与价格。";
    return "Basic list mode: image + price first.";
  }
  if (mood === "HUNGRY") {
    if (locale === "ja") return "Hungry: 提供スピードとボリュームを優先します。";
    if (locale === "fr") return "Hungry: priorite a la vitesse et au volume.";
    if (locale === "zh") return "Hungry: 优先上菜速度与分量。";
    return "Hungry: speed and volume are prioritized.";
  }
  if (mood === "RELAX") {
    if (locale === "ja") return "Relax: コース順と日本酒ペアリングを優先します。";
    if (locale === "fr") return "Relax: priorite au flux du repas et aux accords sake.";
    if (locale === "zh") return "Relax: 优先套餐节奏与清酒搭配。";
    return "Relax: course flow and sake pairing are prioritized.";
  }
  if (mood === "ADVENTURE") {
    if (locale === "ja") return "Adventure: 店主の物語と希少メニューを優先します。";
    if (locale === "fr") return "Adventure: priorite aux histoires du chef et aux choix rares.";
    if (locale === "zh") return "Adventure: 优先主厨故事与稀有菜品。";
    return "Adventure: chef story and rare picks are prioritized.";
  }
  if (locale === "ja") return "Mood未選択。";
  if (locale === "fr") return "Humeur non selectionnee.";
  if (locale === "zh") return "尚未选择情绪。";
  return "Mood not selected.";
}

function formatSouvenirStamp(locale: LocaleKey, mood: Mood | null): string {
  const dt = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (locale === "ja") {
    return `記録: ${dt} / Mood: ${mood ?? "-"}`;
  }
  if (locale === "fr") {
    return `Archive: ${dt} / Humeur: ${mood ?? "-"}`;
  }
  if (locale === "zh") {
    return `记录: ${dt} / 情绪: ${mood ?? "-"}`;
  }
  return `Record: ${dt} / Mood: ${mood ?? "-"}`;
}

function drawPseudoQr(ctx: CanvasRenderingContext2D, x: number, y: number, seed: string): void {
  const size = 180;
  const cell = 9;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "#111827";
  ctx.strokeRect(x, y, size, size);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let r = 0; r < 20; r += 1) {
    for (let c = 0; c < 20; c += 1) {
      h ^= r * 31 + c * 17;
      h = Math.imul(h, 16777619);
      if ((h & 0x3) === 0) {
        ctx.fillStyle = "#111827";
        ctx.fillRect(x + c * cell, y + r * cell, cell - 1, cell - 1);
      }
    }
  }
}
