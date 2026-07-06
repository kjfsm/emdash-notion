# ndash

Notion の Webhook を受け取り、ページを Portable Text に変換して [EmDash CMS](https://emdashcms.com) のコンテンツへ同期する **native プラグイン**（Notion → emdash 一方向。MVP）。

## できること

- Notion 公式 Webhook（`/_emdash/api/plugins/ndash/webhook`）を受け、対象ページを取得
- ページ本文（見出し・段落・リスト・引用・コード・区切り線・画像等）を [Portable Text](https://github.com/portabletext/portabletext) へ変換
- 画像は emdash メディアへ取り込み（Notion の署名付き画像 URL は約 1 時間で失効するため）
- タイトルと本文（Portable Text）を emdash コンテンツへ upsert
- Notion pageId ↔ emdash コンテンツ id の対応を `ctx.storage.syncMap` に保持（無変更 Webhook のスキップ用）

## できないこと（既知の制約）

- **emdash → Notion の逆方向同期は未実装**（`content:afterSave` 等のフックで実現可能だが本 MVP では対象外）
- **Notion 公式の `X-Notion-Signature`（生ボディ HMAC）は検証できない**。emdash はプラグインルートに渡す前に必ずリクエストボディを一度パースするため（native/sandboxed 問わず）、生バイトにアクセスできない。代わりに Notion 購読 URL の `?token=` クエリに共有シークレットを載せ、定数時間比較で検証する
- **slug / status は emdash 側で設定できない**。`ctx.content.create/update` はフィールドデータのみを受け付け、システム列（slug・status）は変更できない。MVP では title と本文のみ同期する

## セットアップ

1. `astro.config.mjs` で登録する（native は `plugins: []` 専用。`sandboxed: []` では動かない）:

   ```typescript
   import { defineConfig } from "astro/config";
   import emdash from "emdash/astro";
   import { ndashPlugin } from "ndash";

   export default defineConfig({
   	integrations: [
   		emdash({
   			plugins: [ndashPlugin()],
   		}),
   	],
   });
   ```

2. emdash 管理画面のプラグイン設定（`admin.settingsSchema` の自動生成フォーム）で以下を入力する:
   - **Notion Integration Token** — Notion の internal integration token
   - **Webhook URL Token** — 任意の共有シークレット（自分で生成する）
   - **Notion Database ID**（任意）— 特定データベース配下のページのみ受け付ける場合
   - **Target Collection Slug** — 書き込み先の emdash コレクション
   - **Title Field Slug** / **Body (Portable Text) Field Slug** — 既定は `title` / `body`

3. Notion 側の Webhook 購読を作成し、購読 URL を次の形にする:

   ```
   https://<your-site>/_emdash/api/plugins/ndash/webhook?token=<Webhook URL Token>
   ```

   購読作成時のハンドシェイク（`verification_token`）は自動でエコー返しされる。

## 開発

```sh
npm install
npm run typecheck
npm run test
npm run build   # dist/ に出力（native プラグインは通常の npm パッケージとしてビルドする）
```

`npm link` 等でローカル emdash サイトから参照し、動作確認する。
