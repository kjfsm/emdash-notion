# emdash-notion

English version: [README.md](./README.md).

Notion の Webhook を受け取り、ページを Portable Text に変換して [EmDash CMS](https://emdashcms.com) のコンテンツへ同期する **native プラグイン**（Notion → emdash 一方向。MVP）。

> 管理 UI は **英語（既定）** と **日本語** に対応し、設定ページから切り替えられます。

## できること

- Notion 公式 Webhook（`/_emdash/api/plugins/ndash/webhook`）を受け、対象ページを取得
- ページ本文（見出し・段落・リスト・引用・コード・区切り線・画像等）を [Portable Text](https://github.com/portabletext/portabletext) へ変換
- 画像は emdash メディアへ取り込み（Notion の署名付き画像 URL は約 1 時間で失効するため）
- タイトル・本文（Portable Text）に加えて、著者・slug などの任意プロパティも emdash フィールドへマッピング可能
- 複数の emdash コレクションをそれぞれ別の Notion データベースへ紐づけ可能（コレクション ⇔ データベースの対応を複数登録できる）
- 管理画面の「手動取得」ボタンで、設定済みの対応関係すべてを一括同期
- Notion pageId ↔ emdash コンテンツ id の対応を `ctx.storage.syncMap` に保持（無変更 Webhook のスキップ用）

## できないこと（既知の制約）

- **emdash → Notion の逆方向同期は未実装**（`content:afterSave` 等のフックで実現可能だが本 MVP では対象外）
- **Notion 公式の `X-Notion-Signature`（生ボディ HMAC）は検証できない**。emdash はプラグインルートに渡す前に必ずリクエストボディを一度パースするため（native/sandboxed 問わず）、生バイトにアクセスできない。代わりに Notion 購読 URL の `?token=` クエリに共有シークレットを載せ、定数時間比較で検証する
- **emdash のシステム slug 列は設定できない**。`ctx.content.create/update` はフィールドデータのみを受け付けるため、「slug フィールド Slug」で指定した値は通常のデータフィールドとして保存される（URL ルーティングに使われる slug 列とは別）
- 著者/slug プロパティのドロップダウンは、integration と共有中の全データベースのプロパティ名を集約したもの（選択中の行のデータベースに絞り込んだ候補ではない）
- emdash はプラグインにコレクション/フィールドのスキーマを問い合わせる API・生 DB アクセスを提供していない（意図的に塞がれている）。そのため「emdash コレクション Slug」は自由入力（既に存在するコレクション Slug を手入力する）。タイトル/本文/著者/slug の各フィールド Slug は、**設定済みの対応関係が指すコレクションの既存コンテンツからフィールド名を逆引きしたドロップダウン**（`list-fields`）から選べる。コレクションにコンテンツが 1 件も無い場合は候補が出ないため、その場合は既存コンテンツを 1 件作ってから設定し直すか、対応保存後にブラウザをリロードして選び直す
- 本文フィールド Slug の既定値は emdash 標準シード（`pages`/`posts`）に合わせて `content`。著者/slug フィールド Slug は既定では空欄（同期しない）で、指定した場合に対象コレクションへそのフィールドが無ければ自動的にそのフィールドだけスキップして同期する（title/body フィールドが存在しない場合はエラーになる）

## セットアップ

1. `astro.config.mjs` で登録する（native は `plugins: []` 専用。`sandboxed: []` では動かない）:

   ```typescript
   import { defineConfig } from "astro/config";
   import emdash from "emdash/astro";
   import { ndashPlugin } from "emdash-notion";

   export default defineConfig({
     integrations: [
       emdash({
         plugins: [ndashPlugin()],
       }),
     ],
   });
   ```

2. emdash 管理画面のプラグイン一覧 → ndash の歯車アイコンから設定ページを開き、次の順で設定する:
   1. **言語** — English / 日本語 を選ぶ（任意。既定は英語）
   2. **トークンを保存** — Notion Integration Token を入力して保存（保存すると以降のドロップダウンがこのトークンで Notion を検索する）
   3. **EmDash token を生成** — 「EmDash token を生成」ボタンを押すと、ランダムな Webhook URL token が生成・自動保存され、Notion に登録すべき完全な Webhook URL が画面に表示される。「Webhook URL トークン」欄に自分で好きな値を入力してもよい。この値は Notion が購読作成時に一度だけ送ってくる `verification_token`（別概念）とは無関係。
   4. **対応を追加** — 末尾の空欄フォームに、emdash コレクション Slug・Notion データベース（ドロップダウン）・著者/slug プロパティ（ドロップダウン、既定値のままで通常は問題ない）を入力して保存する。保存すると「対応 N」として独立したフォームになり、いつでも内容を編集して個別に保存、または「この対応を削除」で削除できる。コレクションごとに複数の対応を追加できる。タイトル/本文/著者/slug のフィールド Slug 選択肢は、保存後（コレクションに既存コンテンツがあれば）自動的に埋まる
   5. **手動取得** — 今すぐ同期して動作確認する

3. Notion 側の Webhook 購読を作成し、トークン生成後に表示された URL を購読 URL として登録する:

   ```
   https://<your-site>/_emdash/api/plugins/ndash/webhook?token=<Webhook URL Token>
   ```

   購読作成時のハンドシェイク（`verification_token`）は自動でエコー返しされる。

## 配布

本プラグインは API ルートを宣言する **native** プラグインのため、**npm** で配布し `astro.config.mjs` に導入する（EmDash マーケットプレイスは sandboxed プラグイン向けのため対象外）。

## 開発

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build   # dist/ に出力（native プラグインは通常の npm パッケージとしてビルドする）
```

`pnpm link`（`pnpm link --global`）等でローカル emdash サイトから参照し、動作確認する。

## ライセンス

[MIT](./LICENSE)
