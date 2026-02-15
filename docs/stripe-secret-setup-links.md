# Stripe Secret Setup Links (Owner Manual)

`<PROJECT_ID>`, `<ORG>`, `<REPO>`, `<HOST>` を実値に置き換えて、上から順に開いて設定してください。

1. `STRIPE_SECRET_KEY` 設定元（Stripe API Keys）
- `https://dashboard.stripe.com/apikeys`

2. `STRIPE_WEBHOOK_SECRET` 設定元（Stripe Webhooks）
- `https://dashboard.stripe.com/webhooks`
- Webhook送信先: `https://<HOST>/api/billing/webhook`

3. `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` の元URL確認（Firebase Hosting）
- `https://console.firebase.google.com/project/<PROJECT_ID>/hosting/sites`
- 設定値例:
  - `BILLING_SUCCESS_URL=https://<HOST>/s/<STORE_ID>?checkout=success`
  - `BILLING_CANCEL_URL=https://<HOST>/s/<STORE_ID>?checkout=cancel`

4. Secret作成先（Google Cloud Secret Manager）
- `https://console.cloud.google.com/security/secret-manager?project=<PROJECT_ID>`
- 作成画面: `https://console.cloud.google.com/security/secret-manager/create?project=<PROJECT_ID>`

5. OIDC/CI連携（必要時）
- GitHub Actions Secrets: `https://github.com/<ORG>/<REPO>/settings/secrets/actions`
- GitHub Actions Variables: `https://github.com/<ORG>/<REPO>/settings/variables/actions`

6. 設定後の検証
- `PROJECT_ID=<PROJECT_ID> sh ops/stripe-secrets-check.sh`
- `sh ops/owner-setup.sh`
- `PROJECT_ID=<PROJECT_ID> sh ops/preflight-local.sh`

7. クリップボード登録（推奨）
- `npm run ops:secret:clipboard -- STRIPE_WEBHOOK_SECRET`
- `npm run ops:secret:clipboard -- STRIPE_SECRET_KEY`
- `npm run ops:secret:clipboard -- BILLING_SUCCESS_URL`
- `npm run ops:secret:clipboard -- BILLING_CANCEL_URL`
- ※ デフォルトは Firebase only（Stripe用途の推奨）
- GitHubにも同時登録する場合のみ:
`npm run ops:secret:clipboard -- --both STRIPE_WEBHOOK_SECRET`

## One-command launcher

- URL一覧だけ表示:
`PROJECT_ID=<PROJECT_ID> ORG=<ORG> REPO=<REPO> HOST=<HOST> sh ops/open-stripe-setup-links.sh`
- ブラウザで一括オープン:
`PROJECT_ID=<PROJECT_ID> ORG=<ORG> REPO=<REPO> HOST=<HOST> OPEN=1 sh ops/open-stripe-setup-links.sh`
