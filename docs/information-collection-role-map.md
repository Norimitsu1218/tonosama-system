# Information Collection Role Map

This file defines who handles each information-collection task in TONOSAMA OS.

## Role Keys
- `Owner UI`: `apps/pwa-owner`
- `Functions`: `functions/src/*`
- `Genkit`: model-backed structured generation/classification layer
- `MCP (RO)`: read-only external connector layer
- `AI Agent`: implementation and verification automation
- `女将-Gems`: copywriting/tone/locale prompt template layer
- `💁‍♂️ Human`: legal/contract/keys/console approvals

## Source Intake (`-1 THE FOUNDATION`)
- Official source URL validation:
  - `Functions` (`ownerBusinessRules`, safe-domain checks)
  - `Owner UI` (input and validation feedback)
- Shop card text/vision intake:
  - `Owner UI` (`shopCardRawText`, `shopCardVisionBlocks`)
  - `Functions` (`ownerShopCardParse`, `ownerShopCardVisionParse`)
  - `MCP (RO)` optional for external reference lookup (read-only only)
- Business rules capture:
  - `Owner UI` (cashless/wifi/otoshi/liability toggles)
  - `Functions` (`ownerBusinessRules`)

## Material Collection (`0 THE SOURCE`)
- Menu text import JSON:
  - `Owner UI` (`menuImportText`)
  - `Functions` (`ownerMenuImport`)
- Menu multimodal frame import:
  - `Owner UI` (`menuVisionText`)
  - `Functions` (`ownerMenuVisionImport`)
  - `Genkit` optional for frame normalization enhancement
- Soul interview fields:
  - `Owner UI` (`soulPhilosophy`, `soulFast`, `soulVolume`, `soulAdventure`, `soulPairing`)
  - `Functions` (`ownerSoulCapture`)

## Structuring (`1 PERCEPTION`)
- Menu/drink normalization:
  - `Functions` (`normalizeCatalogItems`, `convertVisionFramesToCatalog`)
- Pairing matrix base scoring:
  - `Functions` (`buildPairingMatrix`)
- Pairing override collection:
  - `Owner UI` (`pairingOverridesText`)
  - `Functions` (`ownerPairingOverrides`)
- Runtime data bundle assembly:
  - `Functions` (`readStoreBundle`, `storeBundle`)

## Reconstruction (`2 HALLUCINATION`)
- Okami intent classification (`SECURITY/RULE/PLACE/SOUL`):
  - `Functions` (`okamiAnswer`, `okamiEngine`)
  - `Genkit` as internal engine candidate (same JSON contract)
- Story/catch copy quality iteration:
  - `女将-Gems` for tone and multilingual phrasing
  - `AI Agent` for schema/guardrail checks before release
- LP expression drafts:
  - `女将-Gems` primary
  - `💁‍♂️ Human` final legal/compliance sign-off

## Approval / Governance (`3 CLEAN ROOM`)
- Approval and audit log:
  - `Functions` (`approvalLog`, hash-chain append/verify)
  - `Owner UI` action triggers
- Liability confirmation:
  - `Owner UI` required checkboxes
  - `Functions` enforce required flags
- Release gate:
  - `AI Agent` enforces preflight and tests
  - `💁‍♂️ Human` approves legal and production secrets

## Crystallization (`4 CRYSTALLIZATION`)
- MENU_MASTER generation:
  - `Functions` (`ownerCrystallize`)
- Cost tracking:
  - `Functions` (`recordOwnerCost`, `ownerCostStatus`)
- Readiness scoring:
  - `Functions` (`ownerStoreStatus.dataCollection`)
  - `Owner UI` displays readiness and missing fields

## Runtime Side Collection (Guest Backside)
- Gate and bundle retrieval:
  - `Functions` (`gate`, `storeBundle`)
  - `Guest` (`gate-client`, `functions-read`)
- ETag/304 optimization:
  - `Functions` (`ETag` in `storeBundle`)
  - `Guest` (`If-None-Match` + memory cache)
- Aggregate telemetry collection:
  - `Guest` (`telemetry-client`)
  - `Functions` (`telemetry`, `telemetryRead`)

## Explicit Assignment for Copy Quality
- `女将-Gems` handles:
  - Awakening headline/body variants
  - Mood narrative microcopy
  - Pairing rationale tone
  - Souvenir short message text
- `AI Agent` handles:
  - prohibited-phrase checks
  - policy checks (no stealth consent, no sensitive inference)
  - locale formatting consistency
- `💁‍♂️ Human` handles:
  - final legal wording approval
  - live publication approval
