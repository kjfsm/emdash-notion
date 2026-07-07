# CLAUDE.md

`emdash-notion` — Notion の Webhook を受け取り、ページを Portable Text に変換して [EmDash CMS](https://emdashcms.com) のコンテンツへ同期する **native プラグイン**（Notion → emdash 一方向）。単一 npm パッケージ（pnpm 管理）。

概要・使い方は `README.md`（英語）/ `README.ja.md`（日本語）を参照。

> コンパクション時: 変更中ファイル一覧・実行すべきテストコマンド・タスク状態を必ず保持すること。

---

## 絶対ルール

1. **言語**: コメント・コミットメッセージ・PR タイトル・PR 概要・AI とのやり取りはすべて**日本語**。ブランチ名は英語のみ（日本語禁止）。識別子・型名・ログ・JSX/Block Kit の内部 action_id は英語のまま触らない。
2. **変更後は必ず `pnpm typecheck` と関連テスト（`pnpm test`）、`pnpm lint`／`pnpm format:check` を通す**。失敗を残したままコミットしない。
3. **`main` への直 push 禁止**。必ずブランチを切って PR を出す。
4. **シークレットをコード／Git にハードコードしない**。`.env` / `.dev.vars` は commit せず、ログにも出さない。
5. **pre-commit / CI のフックを `--no-verify` 等でスキップしない**。落ちたら根本原因（型・lint・テスト）を直す。
6. **自動生成物を手編集しない**（`dist/`・`coverage/`・`pnpm-lock.yaml`）。

---

## このリポジトリ固有の絶対ルール

1. **配布は npm のみ**。本プラグインは `format: "native"` かつ API ルートを宣言するため EmDash マーケットプレイス（sandboxed 向け）には公開できない。`astro.config.mjs` の `plugins: []` に導入して使う。
2. **changeset の bump 種別**: 明示的な指示がない限り **`patch`** を使う（`minor` は後方互換の公開 API 追加、`major` は破壊的変更のみ）。`src/**` を変更する PR には changeset を必須（`skip-changeset` ラベルで免除）。
3. **UI 文字列は i18n カタログ経由**（`src/i18n/messages.ts`）。管理画面（Block Kit）に出す文字列を直書きせず、`en`/`ja` 両ロケールにキーを追加する（`tests/i18n.test.ts` がキー網羅を検証）。**ログや throw する Error 等の開発者向けメッセージは英語のまま**カタログ外に置く。
4. **プラグイン `id` は `ndash`**（webhook URL `/_emdash/api/plugins/ndash/webhook`・storage・admin.pages）。npm パッケージ名 `emdash-notion` とは別物なので id は安易に変えない。

---

## コードスタイル

`oxfmt`（`.oxfmtrc.json`）に従う。`pnpm format` で自動修正、`pnpm lint`（oxlint + eslint）で検証。

- インデント: スペース 2 幅 / クォート: ダブルクォート / インポート: `sortImports` で自動整理
- 型インポートは `import type`（`verbatimModuleSyntax: true`）。ESM のみ（CommonJS 不可）
- コメントは日本語で WHY のみ。コードで自明な WHAT・変更経緯・バナー区切りは書かない
- 公開パッケージは `sideEffects: false`、公開物は `dist/` のみ（`files: ["dist"]`）

---

## リリース

- **canary（自動）**: `main` push ごとに `0.0.0-canary-<sha>` を npm の `canary` タグへ公開（`release.yml`。changeset は消費しない）
- **stable（手動）**: メンテナが `Release Stable` を workflow_dispatch → "Version Packages" PR をマージすると `latest` へ公開（`release-stable.yml`）
- 初回公開など CI トークンで 404 になる場合は、パッケージルートで `pnpm run release:local`（`pnpm publish --no-provenance --no-git-checks`）を手動実行

必要な GitHub secrets: `NPM_TOKEN`・`RELEASE_PAT`（任意で `CODECOV_TOKEN`）。
