# TONOSAMA menu-line API Spec (OCR→18秒→承認→14言語)

## 0. Purpose

- 対象ページ:
  - `/menu-upload`（店主：アップロード＋OCRジョブ起票）
  - `/owner-work`（店主：候補確認・修正・承認・14言語ジョブ起票）
- 目的:
  - Front（Pages）・Backend（Workers / LLMライン）・Codex が共有する「唯一の真実 API 仕様」。
  - MOCK_MODE（デモ）と実APIの両方で同じ JSON 形を返すこと。

---

## 1. 共通フィールド・型

### 1.1 JobStatus

```ts
type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled" | "timeout";
```

### 1.2 QC

```ts
type QCStatus = "pending" | "auto_pass" | "needs_review" | "rejected";

interface QCInfo {
  status: QCStatus;         // 例: "needs_review"
  reason: string | null;    // 例: "価格がMENU_MASTERと乖離しています"
}
```

### 1.3 PaymentGuard

```ts
type PaymentStatus = "trial" | "paid" | "overdue" | "blocked";

interface PaymentGuardState {
  payment_status: PaymentStatus;
  // 追加候補: next_due_at, overdue_days, support_contact 等
}
```

### 1.4 OCR Candidate / MENU_MASTER draft item

```ts
interface OcrCandidate {
  item_id: string;
  name_ja: string;
  price: number;
  category: string | null;
  image_status: "none" | "attached" | "invalid";
  ja18s_draft: string;
  status: "needs_review" | "approved" | "rejected";
  qc_status: QCStatus;
  qc_reason: string | null;
  is_recommended: boolean;
  owner_approved: boolean;
  translation_status: "idle" | "queued" | "running" | "done" | "failed";
}
```

## 2. Endpoints 一覧

| Method | Path | 用途 | 主担当ページ |
| --- | --- | --- | --- |
| POST | /jobs/ocr | OCRジョブ起票 | menu-upload |
| GET | /jobs/ocr/:job_id | OCRジョブ進捗＋候補取得 | menu-upload |
| GET | /menu/master | MENU_MASTER draft一覧取得 | owner-work |
| PATCH | /menu/master/:item_id | 単品の修正・承認更新 | owner-work |
| POST | /jobs/translation | 14言語translation_jobs起票 | owner-work |
| GET | /payment/guard | paymentGuard状態取得 | 両方 |

実装上は Cloudflare Pages Functions（functions/...）想定。

## 3. 各エンドポイント詳細

### 3.1 POST /jobs/ocr

用途: Excel/PDF/画像アップロード後に OCR ジョブを作成。Auth: store_owner セッション or store_id + token。

Request (multipart/form-data)

- store_id: string
- file: バイナリ（Excel/PDF/画像）
- source: "upload" など

Response 200

```json
{
  "job_id": "ocr_dev_0001",
  "status": "queued",
  "payment": { "payment_status": "trial" }
}
```

エラー

- 402 Payment Required … payment_status が "blocked" の場合
- 413 Payload Too Large … 20MB超
- 415 Unsupported Media Type
- 422 Unprocessable Entity … store_id不正など

### 3.2 GET /jobs/ocr/:job_id

用途: menu-upload 側の polling により進捗＋候補を取得。

Response 200

```json
{
  "job": {
    "job_id": "ocr_dev_0001",
    "status": "running",
    "progress": 62,
    "steps": [
      { "label": "OCR中", "done": true },
      { "label": "品目抽出中", "done": true },
      { "label": "18秒文候補生成中", "done": false }
    ],
    "error_code": null
  },
  "candidates": [
    {
      "item_id": "draft_001",
      "name_ja": "ねぎま",
      "price": 220,
      "category": "焼き鳥",
      "image_status": "none",
      "ja18s_draft": "香ばしい鶏ももと長ねぎを…（18秒文）",
      "status": "needs_review",
      "qc_status": "needs_review",
      "qc_reason": "価格が既存MENU_MASTERと異常に乖離しています",
      "is_recommended": false,
      "owner_approved": false,
      "translation_status": "idle"
    }
  ],
  "payment": { "payment_status": "trial" }
}
```

- job.status が "succeeded" の場合は candidates[] フル。
- job.status が "failed" / "timeout" の場合は error_code を返し、UI で toast と再試行案内。

### 3.3 GET /payment/guard

用途: menu-upload / owner-work 起動時に支払い状態取得。

Response 200

```json
{
  "payment_status": "trial",
  "note": "トライアル中：○月○日までフル機能が利用できます"
}
```

支払い状態と gating

- trial : 全CTA有効
- paid : 全CTA有効
- overdue : Translation 拒否+警告
- blocked : Upload/Approve/Translation 無効、支払い導線のみ

### 3.4 GET /menu/master?store_id=...

用途: owner-work 初期表示で draft を取得。

Response 200

```json
{
  "store": {
    "store_id": "STORE-TEST-0001",
    "name": "炭焼やきとり はな",
    "payment": { "payment_status": "trial" }
  },
  "items": [ /* OcrCandidate 形式 */ ]
}
```

### 3.5 PATCH /menu/master/:item_id

用途: owner-work で編集・承認。

Request body includes updated fields; response returns updated item (with qc_status qc_reason). Errors: 409 Conflict, 422 Validation.

### 3.6 POST /jobs/translation

用途: 全品 owner_approved=true かつ ja18s_final 非空 かつ qc_status != needs_review かつ payment_status=trial/paid で発行。

Response 200 includes queue info; translation_status is polled separately.

## 4. MOCK_MODE ポリシー

- env.MOCK_MODE === "true" : 擬似 progress + memstore。
- env.MOCK_MODE !== "true" : 実 OCR/LLM/MENU_MASTER。
- Front は JSON 形のみを信頼、MOCK/実API は `env` 1箇所で切り替え。

## 5. CPチェック用メモ

- CP1: UIモック + mockMode API + 本番公開（済: a472baa）。
- CP2: real API / QC / paymentGuard gate（本ドキュメントが唯一の真実）。
- CP3: LLMライン（Claude/Gemini）と translation_jobs の完全連携（docs/api-llm-line.md 予定）。
