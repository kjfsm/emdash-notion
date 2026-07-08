# CLAUDE.md

`emdash-notion` — Notion の Webhook を受け取り、ページを Portable Text に変換して [EmDash CMS](https://emdashcms.com) のコンテンツへ同期する **pnpm monorepo**。同期処理（standard プラグイン）と見た目（native プラグイン）を分離した 2 つのプラグインからなる（Notion → emdash 一方向）。

- `packages/sync`（npm: `@emdash-notion/sync`, plugin id: `notion-sync`, **standard** format）— Notion取得・webhook受信・DB保存・Portable Text変換
- `packages/blocks`（npm: `@emdash-notion/blocks`, plugin id: `notion-blocks`, **native** format）— Notion固有ブロック（callout/to_do/toggle）を Notion 風の見た目で描画する Astro コンポーネント（`componentsEntry`経由）
- `shared/types`（`@emdash-notion/types`, private）— 両パッケージが合意するカスタム Portable Text ブロック型

概要・使い方は `README.md`（英語）/ `README.ja.md`（日本語）を参照。

> コンパクション時: 変更中ファイル一覧・実行すべきテストコマンド・タスク状態を必ず保持すること。

---

## 絶対ルール

1. **言語**: コメント・コミットメッセージ・PR タイトル・PR 概要・AI とのやり取りはすべて**日本語**。ブランチ名は英語のみ（日本語禁止）。識別子・型名・ログ・JSX/Block Kit の内部 action_id は英語のまま触らない。
2. **変更後は必ず `pnpm typecheck` と関連テスト（`pnpm test`）、`pnpm lint`／`pnpm format:check` を通す**。ルートから実行すると `packages/*` 全体（`pnpm -r`）に対して走る。失敗を残したままコミットしない。
3. **`main` への直 push 禁止**。必ずブランチを切って PR を出す。
4. **シークレットをコード／Git にハードコードしない**。`.env` / `.dev.vars` は commit せず、ログにも出さない。
5. **pre-commit / CI のフックを `--no-verify` 等でスキップしない**。落ちたら根本原因（型・lint・テスト）を直す。
6. **自動生成物を手編集しない**（`dist/`・`coverage/`・`pnpm-lock.yaml`）。

---

## このリポジトリ固有の絶対ルール

1. **配布は npm のみ**。`packages/blocks`（`notion-blocks`）は `format: "native"` かつ `componentsEntry` を宣言するため EmDash マーケットプレイス（sandboxed 向け）には公開できない。`packages/sync`（`notion-sync`）は `format: "standard"` だが `notion-blocks` と組で使う構成のため、両方とも `astro.config.mjs` の `plugins: []` に導入して使う。
2. **changeset の bump 種別**: 明示的な指示がない限り **`patch`** を使う（`minor` は後方互換の公開 API 追加、`major` は破壊的変更のみ）。`packages/**` を変更する PR には changeset を必須（`shared/**` のみの変更は対象外、`skip-changeset` ラベルでも免除）。
3. **UI 文字列は i18n カタログ経由**（`packages/sync/src/i18n/messages.ts`）。管理画面（Block Kit）に出す文字列を直書きせず、`en`/`ja` 両ロケールにキーを追加する（`packages/sync/tests/i18n.test.ts` がキー網羅を検証）。**ログや throw する Error 等の開発者向けメッセージは英語のまま**カタログ外に置く。`packages/blocks` は管理画面文言をほぼ持たないため対象外。
4. **プラグイン `id`** は `packages/sync` が `notion-sync`（webhook URL `/_emdash/api/plugins/notion-sync/webhook`・storage・admin.pages）、`packages/blocks` が `notion-blocks`。
5. **カスタム Portable Text ブロック型の形状は `shared/types`（`@emdash-notion/types`）を単一の情報源とする**。`packages/sync` の変換ロジックと `packages/blocks` の Astro コンポーネントの両方がここから型を import し、フィールド形状のズレを防ぐ。

---

## 自己改善ルール

この CLAUDE.md はリポジトリの制度的記憶である。古い記述は将来のセッションの判断を誤らせるため、以下を発見したらその場で該当セクション（「確認済みの技術メモ」「よくある間違い」等）を更新する。

- Notion API・EmDash API の実際の挙動がドキュメントや想定と異なっていた
- フィールド形状・レスポンス形状が想定と違った
- 同じ間違いを繰り返しそうなパターンに気づいた

追記は日付付きで行う（例）:

```
<!-- confirmed 2026-07-08: packages/sync の signature 検証で〜 -->
```

## 確認済みの技術メモ

Notion API・EmDash API の実ソースやレスポンスを検証して判明した、ドキュメントや想定と異なる事実をここに日付付きで蓄積する。

<!-- ここに検証済みの事実を追記していく -->

## このリポジトリでよくある間違い

過去にこのリポジトリで実際に起きた（起きやすい）ミスのパターンをここに番号付きで蓄積する。

<!-- 発見次第、番号付きリストで追記していく -->

## 機能追加時の進め方

新規プラグイン量産を前提にした重厚なステージゲートは不要な規模のリポジトリのため、以下の簡略フローに従う。

1. 変更対象と受け入れ条件を短く整理する（大きな変更のみ。小さな修正は不要）
2. 失敗するテストを先に書く（`packages/*/tests/<feature>.test.ts`、複数モジュールを跨ぐ結合フローは `tests/integration.test.ts` に書く）
3. 実装する。ロジック変更ごとに `pnpm test` を回す
4. `shared/types` の型に影響する場合は先にそこを更新し、両パッケージから参照させる
5. changeset を追加する（`pnpm changeset`、既定は `patch`）
6. `pnpm typecheck` / `pnpm test` / `pnpm lint` / `pnpm format:check` を通す
7. 新しい事実を発見したら本ファイルの該当セクションを更新する

---

## コードスタイル

`oxfmt`（`.oxfmtrc.json`）に従う。`pnpm format` で自動修正、`pnpm lint`（oxlint + eslint）で検証。

- インデント: スペース 2 幅 / クォート: ダブルクォート / インポート: `sortImports` で自動整理
- 型インポートは `import type`（`verbatimModuleSyntax: true`）。ESM のみ（CommonJS 不可）
- コメントは日本語で WHY のみ。コードで自明な WHAT・変更経緯・バナー区切りは書かない
- 公開パッケージは `sideEffects: false`。`packages/sync` の公開物は `dist/` のみ（`files: ["dist"]`）。`packages/blocks` は `dist`（プラグインロジック）に加え `src/astro`・`src/*.astro`（Astro コンポーネントは未ビルドの生ソースのまま配布、`componentsEntry` から直接参照される）

---

## リリース

- monorepo だが各パッケージは独立してバージョニングされる（changesets の通常運用）。
- **canary（自動）**: `main` push ごとに、pending changeset があるパッケージを `0.0.0-canary-<sha>` として npm の `canary` タグへ公開（`release.yml`。changeset は消費しない）
- **stable（手動）**: メンテナが `Release Stable` を workflow_dispatch → "Version Packages" PR をマージすると、対象パッケージが `latest` へ公開（`release-stable.yml`）
- 初回公開など CI トークンで 404 になる場合は、事前に `pnpm build` した上で、各パッケージルート（`packages/sync`・`packages/blocks`）で `pnpm run release:local`（`npm publish --no-provenance`）を手動実行するか、ルートで `pnpm release:local`（`pnpm -r --if-present run release:local` が各パッケージの同スクリプトを実行）する。**`pnpm publish` は `publishConfig.provenance: true` を無効化できない**（`--no-provenance`／`--config.provenance=false` のいずれを渡しても、pnpm 内部の公開処理が provenance 生成を試みてローカルでは失敗する。実測で確認済み）ため、`release:local` は pnpm を経由せず **npm CLI の `npm publish --no-provenance` を直接呼ぶ**（`npm publish` は CLI フラグで `publishConfig.provenance` を正しく上書きできる）。

必要な GitHub secrets: `NPM_TOKEN`・`RELEASE_PAT`（任意で `CODECOV_TOKEN`）。
