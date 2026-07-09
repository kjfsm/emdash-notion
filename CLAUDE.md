# CLAUDE.md

`emdash-notion` — Notion の Webhook を受け取り、ページを Portable Text に変換して [EmDash CMS](https://emdashcms.com) のコンテンツへ同期する **pnpm monorepo**。同期処理（sandboxed プラグイン）と見た目（native プラグイン）を分離した 2 つのプラグインからなる（Notion → emdash 一方向）。

- `packages/sync`（npm: `@emdash-notion/sync`, plugin id: `notion-sync`, **sandboxed** format, `@emdash-cms/plugin-cli`（`emdash-plugin` コマンド）で構築）— Notion取得・webhook受信・DB保存・Portable Text変換
- `packages/blocks`（npm: `@emdash-notion/blocks`, plugin id: `notion-blocks`, **native** format）— Notion固有ブロック（callout/to_do/toggle）を Notion 風の見た目で描画する Astro コンポーネント（`componentsEntry`経由）
- `templates/sample-emdash-site`（`private`, npm 非公開）— 両プラグインを `workspace:*` で参照するローカル専用 EmDash サイト。動作確認用（詳細は「機能追加時の進め方」節・README「Development」節参照）

いずれも同一 pnpm workspace のメンバー（`pnpm-workspace.yaml`）。共通ツールのバージョンは `catalog:` で一元管理する。

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

1. **配布方式は sync/blocks で異なる**。`packages/blocks`（`notion-blocks`）は `format: "native"` かつ `componentsEntry` を宣言するため EmDash マーケットプレイス（sandboxed 向け）には公開できず、npm 配布 + `astro.config.mjs` の `plugins: []` 登録のみ（`definePlugin`/`PluginDescriptor` を手書き）。`packages/sync`（`notion-sync`）は **sandboxed** format（`emdash-plugin.jsonc` + `src/plugin.ts`、`@emdash-cms/plugin-cli` でビルド）へ移行済みで、npm 配布に加え EmDash マーケットプレイス/レジストリ（`emdash-plugin bundle`/`publish`）経由でも配布できる。サイト側は `notion-sync` を `sandboxed: []` に、`notion-blocks` を `plugins: []` に登録し、`sandboxRunner`（例: `@emdash-cms/cloudflare` の `sandbox()`）の設定が必須（未設定/ランナー未対応プラットフォームでは `plugins: []` へ移す運用も可能、その場合は in-process 実行になり isolation は無くなる）。
2. **changeset の bump 種別**: 明示的な指示がない限り **`patch`** を使う（`minor` は後方互換の公開 API 追加、`major` は破壊的変更のみ）。`packages/**` を変更する PR には changeset を必須（`skip-changeset` ラベルで免除）。ただし公開エントリポイントの shape が変わる破壊的変更を 0.x で表現する場合は `minor` を使う（例: notion-sync の standard→sandboxed 移行）。
3. **`version` の扱いは sync/blocks で異なる**。`packages/blocks`（native）は descriptor の `version` を package.json を単一情報源として `src/version.ts`（`scripts/gen-version.mjs` が生成・`prebuild` で自動再生成、手編集禁止）経由で渡す。`packages/sync`（sandboxed）は `emdash-plugin.jsonc` に `version` フィールドを書かず、`emdash-plugin build` が `package.json#version` を単一情報源として自動解決するため、`version.ts`/`gen-version` は `packages/sync` からは撤去済み（descriptor 自体も `dist/index.mjs` として自動生成される。手書き禁止）。
4. **UI 文字列は i18n カタログ経由**（`packages/sync/src/i18n/messages.ts`）。管理画面（Block Kit）に出す文字列を直書きせず、`en`/`ja` 両ロケールにキーを追加する（`packages/sync/tests/i18n.test.ts` がキー網羅を検証）。**ログや throw する Error 等の開発者向けメッセージは英語のまま**カタログ外に置く。`packages/blocks` は管理画面文言をほぼ持たないため対象外。
5. **プラグイン `id`（`packages/sync` は `emdash-plugin.jsonc` の `slug`）** は `packages/sync` が `notion-sync`（webhook URL `/_emdash/api/plugins/notion-sync/webhook`・storage・admin.pages）、`packages/blocks` が `notion-blocks`。`packages/sync` の storage collection 名は `emdash-plugin.jsonc` のスキーマ上 `/^[a-z][a-z0-9_]*$/`（小文字・数字・アンダースコアのみ、camelCase 不可）に制限されるため `ctx.storage.sync_map`（snake_case）を使う。
6. **カスタム Portable Text ブロック型の形状は `packages/sync/src/portable-text/types.ts` を単一の情報源とする**（`@emdash-notion/sync/portable-text` として公開）。Notion 固有ブロック（callout/todo/toggle/equation/bookmark）は emdash 公式型に存在しないためここで定義する。`packages/blocks` の Astro コンポーネントは生ソース配布のため Props を手書きするが、`packages/blocks/tests/type-parity.test.ts` が sync の正準型とのズレを型レベルで検出する。基礎 Portable Text 型は emdash 本体も export するが、sync 固有の `toggle` 見出しフラグ等の拡張を含むため sync 側で自己完結して定義する（旧 `shared/types` パッケージは 1.0 前に廃止）。

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

<!-- confirmed 2026-07-09: emdash 標準の htmlBlock 型（{_type:"htmlBlock", html: string}）は packages/sync（standard format）から直接出力でき、packages/blocks（native）側の componentsEntry 対応は不要（emdash 本体が自動描画する）。ただし既定の sanitize-html は class/id/style をどの要素にも許可しない（公式ドキュメントのカスタマイズ例が "*": ["class","id","data-*","style"] を明示的に追加していることで確認）。そのためサイト側が htmlBlock コンポーネントをオーバーライドしない限り見た目の制御が一切できず、Notion 風の見た目が必要なブロックは native カスタムブロック化（notionCallout 等と同じパターン）が必須。未対応 Notion ブロック（table_of_contents/child_page/child_database/link_to_page/synced_block/template/tab 等）のフォールバック方針は from-notion.ts の convertBlock 実装・.changeset/notion-html-fallback-blocks.md を参照。 -->

<!-- confirmed 2026-07-08: EmDash の capability 名は `content:read`/`content:write`/`media:read`/`media:write`/`network:request`（公式スキル `creating-plugins` と一致）。`network:fetch` ではない。 -->
<!-- confirmed 2026-07-08: `ctx.storage`（StorageCollection）に原子的な compare-and-set/putIfAbsent は無い（get/put/exists/query 等のみ）。そのため webhook の並行重複配信に対する二重作成を完全には排他できない。`ingest.ts` は「create 前」に軽量な予約レコード（pending + claimId）を書いて直後に読み直す方式で無防備な区間を縮めている（create 後に照合して削除する旧方式は、真の同時実行では両者が削除条件を満たさず二重作成を防げないレビューで判明したため撤回した）。真の同時書き込み（両者が予約の読み直し前に書き込む）は依然として理論上すり抜けうる best-effort。 -->
<!-- confirmed 2026-07-08: EmDash はプラグインにコレクションのスキーマ取得 API を公開していない。存在しないフィールドへの書き込みは D1/SQLite のエラー文言（"no such column: X" / "has no column named X"）でしか検知できず、`ingest.ts` の MISSING_COLUMN_RE はこの文言に依存する脆い実装（API が公開されたら差し替える）。 -->
<!-- confirmed 2026-07-08: emdash は基礎 Portable Text 型（PortableTextSpan/MarkDef/標準ブロック）を公式 export するが、Notion 固有ブロック型は無い。また DB プロパティは値ではなくスキーマ定義（config）型で、ページの property 値型とは別物。 -->
<!-- confirmed 2026-07-09: emdash 0.28.1 のプラグイン `ctx.content.create/update` は `{ type, data }` のみを受け付け、`slug`/`status`/`publishedAt` 等のシステム列（`SYSTEM_COLUMNS`）は `data` に含めてもサーバー側で除外される。同期コンテンツは常に slug=NULL・status="draft" になる（このプラグインの不具合ではなく上流 API の制約）。emdash の REST API（`/_emdash/api/`、Bearer トークン認証）は両方とも設定可能。 -->
<!-- confirmed 2026-07-09: `ctx.content.delete(collection, id)` はソフトデリート（`deleted_at` を立てるのみ、ゴミ箱へ）。行自体は残り、`content.get` はゴミ箱内のアイテムに対して null を返す（`ContentRepository.findById` は `deleted_at IS NULL` を前提にしている）。復元 API はプラグインに公開されていない（REST/CLI/MCP のみ `content_restore` を持つ）。 -->
<!-- confirmed 2026-07-09: emdash 0.28.1 の `PluginDescriptor` にプラグイン独自の MCP ツール/リソースを登録するフィールドは無い（`adminPages`/`adminWidgets`/`portableTextBlocks`/`fieldWidgets`/`capabilities`/`allowedHosts`/`storage` のみ）。コア MCP サーバー（`/_emdash/api/mcp`）は `content_*`/`schema_*`/`settings_*` 等の固定 45 ツールが emdash 本体の `src/mcp/server.ts` にハードコードされているだけで、プラグイン拡張の経路が無い。プラグインが外部提供できるのは `routes`（`/_emdash/api/plugins/<id>/<route>`）までなので、MCP として喋らせるには routes を叩く別プロセスの MCP サーバーを新設する必要がある。 -->
<!-- confirmed 2026-07-09: `@emdash-cms/plugin-cli`（`emdash-plugin` コマンド）は旧 "standard" format（definePlugin/PluginDescriptor、entrypoint 経由の in-process 実行）を置き換える "sandboxed" format 専用のビルド・配布ツールチェーン。`emdash-plugin build` は `emdash-plugin.jsonc` + `src/plugin.ts` から `dist/plugin.mjs`（ランタイム）・`dist/manifest.json`・`dist/index.mjs`（`plugins:[]`/`sandboxed:[]` にそのまま渡せる descriptor、`default export` で関数呼び出し不要）を自動生成する。手書きの descriptor（旧 `src/index.ts`）は不要になり削除する。生成された `dist/index.mjs` は内部的に今も `"format": "standard"` フィールドを含む（emdash@0.28.1 時点の `PluginDescriptor` 型がまだこの形を要求するため）が、これは CLI が管理する実装詳細でありプラグイン作者が気にする必要はない。 -->
<!-- confirmed 2026-07-09: `emdash-plugin.jsonc` の `storage.<collection>` キー名は `/^[a-z][a-z0-9_]*$/`（小文字・数字・アンダースコアのみ）でないと `emdash-plugin validate`/`build` が `Invalid key in record` で失敗する。旧 descriptor で使っていた camelCase（例: `syncMap`）は不可、`sync_map` のように書き換える必要がある（`ctx.storage.<collection>` のプロパティアクセスも合わせて変更する）。同様に `admin.pages[].path` は2文字以上（先頭 `"/"` + 名前）必須で、旧 standard format で許されていた `"/"` 単体は不可（`/settings` 等に変更）。 -->
<!-- confirmed 2026-07-09: sandboxed plugin の `src/plugin.ts` がランタイムで実際に import する npm パッケージ（type-only import ではないもの）は、`package.json` の `peerDependencies` に列挙してはいけない。`emdash-plugin build` のバンドラは peerDependencies を「ホストが提供する外部依存」とみなして bundle から externalize するが、sandbox 実行環境（Cloudflare Worker Loader 等）には npm解決経路が無いため、externalize された import は「probing plugin surface」ステップで `Cannot find package` エラーになり `build` が失敗する（実例: `packages/sync` が `@emdash-cms/blocks/server`（Block Kit のサーバーサイド builder、依存ゼロの自己完結モジュール）を使っていたが `peerDependencies` にも列挙していたため externalize されて失敗した。`devDependencies` のみに残す（`peerDependencies` から削除）ことでバンドルに inline され解決した）。`emdash`自体は type-only import のみなので peerDependencies に残しても問題ない。 -->
<!-- confirmed 2026-07-09: sandboxed 実行の Cloudflare Worker Loader ランナーは 1 呼び出しあたり 50ms CPU / **10 subrequests** / 30秒 wall-clock / 約128MB memory という制約がある（`ctx.http.fetch` だけでなく `ctx.kv`/`ctx.content`/`ctx.storage` の呼び出しも同じ予算を消費しうる）。`packages/sync/src/notion/fetch-page.ts` の `DEFAULT_MAX_REQUESTS`（当時 40）はこの実上限の4倍に設定されており、コメントの意図（「既定10を大きく超えないための安全弁」）と矛盾していた。加えて `packages/sync/src/sync/bulk.ts`（手動一括同期）は全ページを1回のルート呼び出し内で非チャンクにループする設計で、ページ数の多いデータベースでは sandboxed 実行下でほぼ確実に上限超過で失敗する。両ファイルに TODO コメントを残した（2026-07-09 時点で未修正、marketplace publish 前に実機検証のうえ対応が必要）。 -->
<!-- confirmed 2026-07-09: sandboxed plugin の Block Kit 管理画面（`docs.emdashcms.com/plugins/creating-plugins/block-kit/` の公式サンプル）は `blocks`/`elements` のようなビルダー関数を import せず、生の JSON オブジェクトリテラル（`{ type: "header", text: "..." }` 等）を直接返す。`@emdash-cms/blocks/server` のビルダーはこのリポジトリでは動くが（上記の peerDependencies 修正後）、公式ドキュメントの推奨パターンではない点に留意（将来のトラブルシュートで「なぜ公式サンプルと書き方が違うのか」を混乱しないための記録）。 -->
<!-- confirmed 2026-07-09: `emdash-plugin bundle` は「self-contained（Node組み込みモジュール禁止・サイズ上限）」であることをバリデーションする（`publishing` ドキュメントで確認）。つまり sandboxed plugin の `dist/plugin.mjs` は外部 npm パッケージへの実行時依存を一切持てず、必要な third-party コードはすべてバンドルに inline されていなければならない。 -->
<!-- confirmed 2026-07-09: Cloudflare の `sandboxRunner`（`@emdash-cms/cloudflare` の `sandbox()`、実体は Dynamic Worker Loader）は **Workers Paid プラン専用機能**で Free プランでは使えない（https://developers.cloudflare.com/dynamic-workers/pricing/ で確認済み。Paid プランの月額に月1,000ユニークWorker/1,000万リクエスト/3,000万CPUミリ秒の無料枠が含まれ、超過分のみ従量課金）。sample-emdash-site が Free プランのため、notion-sync（sandboxed format）は `sandboxed: []` + `sandboxRunner` ではなく `sandboxRunner` 無しの `plugins: []` に登録して in-process 実行している（EmDash の仕様: sandboxed format のプラグインは runner 未設定でも `plugins: []` に置けば動く。isolation は失われる）。Paid プランへ移行する場合は `wrangler.jsonc` の `worker_loaders`（コメントアウト済みで用意してある）を有効化し、`sandboxed: []` + `sandboxRunner: sandbox()` に切り替える。 -->
<!-- confirmed 2026-07-09: `emdash-plugin.jsonc` の `publisher` が空だと `emdash-plugin validate` だけでなく **`emdash-plugin build` 自体も失敗し、`dist/` が一切生成されない**（`emdash-plugin bundle`/`publish` 固有の制約ではない）。ローカル開発・`templates/sample-emdash-site` での動作確認だけが目的で実際の公開はまだしない場合でも、ビルドを通すには構文上有効な atproto ハンドル形式の placeholder（例: `"local-dev.test"`）を一時的に入れる必要がある。TODO コメントで「実際の marketplace publish には使えない・本物の値に差し替える必要がある」旨を明記しておくこと。 -->
<!-- confirmed 2026-07-09: pnpm workspace に `templates/*`（Astro サイト）を追加する場合、`packages/*`（ライブラリ）とは異なり `.astro` ファイルは oxlint/oxfmt が構文を解釈できない。lint は `eslint-plugin-astro`（`eslint.config.js` に `files: ["**/*.astro"]` ブロックを追加）、format は `prettier` + `prettier-plugin-astro`（ルートに `.prettierrc` を置き `plugins: ["prettier-plugin-astro"]` と `overrides: [{ files: "*.astro", options: { parser: "astro" } }]` を明示しないと `prettier --check "**/*.astro"` が "No parser could be inferred" で失敗する）に委譲する必要がある。`.oxfmtrc.json` の `ignorePatterns` に `"**/*.astro"` を追加して oxfmt 側では素通りさせる。 -->
<!-- confirmed 2026-07-09: changesets は `"private": true` のパッケージでも `updateInternalDependencies`（既定 "patch"）によるバージョン bump の連鎖対象から自動では除外しない（`pnpm exec changeset status` で確認: workspace:* で依存する private パッケージまで bump 候補に出てくる）。npm publish はスキップされるが、`changeset version` 実行時にその private パッケージの package.json/CHANGELOG.md まで書き換わってしまう。除外するには `.changeset/config.json` の `ignore` 配列にパッケージ名を明記する必要がある（`templates/sample-emdash-site` に対して実施済み）。 -->

## このリポジトリでよくある間違い

過去にこのリポジトリで実際に起きた（起きやすい）ミスのパターンをここに番号付きで蓄積する。

1. **この workspace の外にある emdash サイトでの検証に `pnpm link` を使うと `emdash` が二重インスタンスになる**（2026-07-09 確認）。link したパッケージ（`packages/sync`・`packages/blocks`）はこの monorepo 自身の `node_modules`（サイト側とは別の pnpm ストア）から `emdash` を解決し続け、`emdash` のバージョン番号を揃えても解消しない（物理的に別コピーのため）。プラグイン登録（`definePlugin` 等の identity チェックを伴いうる処理）が壊れる恐れがある。代わりに `pnpm pack` した `.tgz` をサイト側 `pnpm-workspace.yaml` の `overrides` に指定する方式を使う（詳細は README の「Development」節）。**同一 workspace 内の `templates/sample-emdash-site` はこの問題の対象外**（`workspace:*` 参照＝単一 pnpm ストアの同一 `emdash` インスタンスを共有するため、ここで言う「別ストアを跨ぐ `pnpm link`」には該当しない）。
2. **サイト側の依存差し替えに `package.json` の `"pnpm": { "overrides": {...} }` を使っても効かない**（2026-07-09 確認、`pnpm@11.9.0`）。最近の pnpm はこのフィールドを読まなくなっており警告だけ出して無視される。`pnpm-workspace.yaml` の トップレベル `overrides:` を使う必要がある。
3. **プラグインの管理画面ルート（Block Kit の admin action）を `curl` で直接叩くと `CSRF_REJECTED` で 403 になる**（2026-07-09 確認）。セッションクッキーだけでは不十分で、ブラウザ経由のダブルサブミット等の CSRF トークンが要る。curl だけで完結させたい検証には、代わりに `emdash` CLI（`emdash content create/get/delete/restore` 等、Bearer/CLI 認証）や MCP サーバーを使う方が早い。
4. **sandboxed plugin でランタイム import する npm パッケージを `peerDependencies` に列挙すると `emdash-plugin build` が失敗する**（2026-07-09 確認）。バンドラが peerDependencies を externalize 対象とみなすため、sandbox 実行環境で解決できない import が残り「probing plugin surface」ステップで `Cannot find package` エラーになる。ランタイムで実際に使う（type-only ではない）npm パッケージは `devDependencies` のみに置く。

<!-- 発見次第、番号付きリストで追記していく -->

## 機能追加時の進め方

新規プラグイン量産を前提にした重厚なステージゲートは不要な規模のリポジトリのため、以下の簡略フローに従う。

1. 変更対象と受け入れ条件を短く整理する（大きな変更のみ。小さな修正は不要）
2. 失敗するテストを先に書く（`packages/*/tests/<feature>.test.ts`、複数モジュールを跨ぐ結合フローは `tests/integration.test.ts` に書く）
3. 実装する。ロジック変更ごとに `pnpm test` を回す
4. カスタム Portable Text ブロック型に影響する場合は先に `packages/sync/src/portable-text/types.ts` を更新する（`packages/blocks` の Props とのズレは `type-parity.test.ts` が検出する）
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
