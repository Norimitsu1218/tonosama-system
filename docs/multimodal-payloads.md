# Multimodal Payloads (Owner)

This file defines the minimal payload format for multimodal ingestion endpoints.

## `POST /api/owner/menuVisionImport`

```json
{
  "storeId": "test123",
  "frames": [
    { "kind": "food", "name": "炙り鯖定食", "price": 1350, "tags": ["HUNGRY"], "notes": "charcoal grilled" },
    { "kind": "food", "name": "白子ポン酢", "price": 980, "tags": ["ADVENTURE"], "notes": "seasonal offal" },
    { "kind": "food", "name": "旬菜おひたし", "price": 620, "tags": ["RELAX"], "notes": "light starter" },
    { "kind": "drink", "name": "純米吟醸", "price": 890, "tags": ["RELAX"], "notes": "dry sake" }
  ],
  "intent": "multimodal_menu_import",
  "allowed_use": "owner_runtime"
}
```

## `POST /api/owner/shopCardVisionParse`

```json
{
  "storeId": "test123",
  "blocks": [
    "鮨 とのさま",
    "東京都千代田区...",
    "03-1234-5678",
    "https://example.jp"
  ],
  "intent": "shop_card_vision_parse",
  "allowed_use": "owner_runtime"
}
```
