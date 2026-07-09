# emdash-notion

English version: [README.md](./README.md).

Notion の Webhook を受け取り、ページを [Portable Text](https://github.com/portabletext/portabletext) に変換して [EmDash CMS](https://emdashcms.com) のコンテンツへ同期する pnpm monorepo（Notion → emdash 一方向。MVP）。同期処理（sandboxed プラグイン）と見た目（native プラグイン）を分離した 2 つのプラグインからなる。

- **[`packages/sync`](./packages/sync)** — npm: [`@emdash-notion/sync`](https://www.npmjs.com/package/@emdash-notion/sync)、plugin id: `notion-sync`（**sandboxed** format）。Notion から取得し Portable Text へ変換して emdash コンテンツへ書き込む。
- **[`packages/blocks`](./packages/blocks)** — npm: [`@emdash-notion/blocks`](https://www.npmjs.com/package/@emdash-notion/blocks)、plugin id: `notion-blocks`（**native** format）。Notion 固有ブロック（callout・to-do・toggle・equation・bookmark・divider）を `componentsEntry` 経由で Notion 風の見た目に描画する。任意導入 — 未導入でもテキスト自体は保存されるが、特別なスタイルなしで表示されない。
- **[`templates/sample-emdash-site`](./templates/sample-emdash-site)** — `notion-sync`/`notion-blocks` を手元で一通り動かして確認するためのローカル専用 EmDash サイト（`private`、npm には公開しない）。両プラグインを `workspace:*` で参照する workspace メンバーのため、ローカルの変更が pack/publish なしですぐ反映される。

> 管理 UI（`notion-sync`）は **英語（既定）** と **日本語** に対応し、設定ページから切り替えられます。

## できること

- Notion 公式 Webhook（`/_emdash/api/plugins/notion-sync/webhook`）を受け、対象ページを取得
- ページ本文（見出し・段落・リスト・引用・コード・区切り線・画像・callout・to-do・toggle 等）を Portable Text へ変換 — callout/to-do/toggle は専用ブロック型（`notionCallout`/`notionToggle`/`notionTodo`）として保持し、`notion-blocks` がアイコン・色・チェック状態・開閉構造を再現できるようにする
- 画像は emdash メディアへ取り込み（Notion の署名付き画像 URL は約 1 時間で失効するため）
- タイトル・本文（Portable Text）に加えて、著者・slug などの任意プロパティも emdash フィールドへマッピング可能
- 複数の emdash コレクションをそれぞれ別の Notion データベースへ紐づけ可能（コレクション ⇔ データベースの対応を複数登録できる）
- 管理画面の「手動取得」ボタンで、設定済みの対応関係すべてを一括同期
- Notion pageId ↔ emdash コンテンツ id の対応を `ctx.storage.sync_map` に保持（無変更 Webhook のスキップ用）
- 同期済みページが Notion 側で削除・アーカイブされると、対応する emdash コンテンツをゴミ箱へ移す（論理削除）。その後 Notion 側で復元（undelete）されると、次回同期で新規コンテンツとして作り直される。検知は3通り: `page.deleted`/`page.undeleted` webhook イベント種別、ingest のたびに行う `archived`/`in_trash` チェック（手動取得経由のページにも効く）、ページが完全削除された場合の 404 フォールバック。手動取得では、Notion の DB クエリ（アーカイブ済みページは返らない）に現れなくなった同期済みページも個別に確認して照合する — 別の場所で生存しているページは削除しない
- Notion API 呼び出しは 429/5xx を指数バックオフで最大 3 回リトライし、`Retry-After`（上限 30 秒）を尊重する

## できないこと（既知の制約）

- **emdash → Notion の逆方向同期は未実装**（`content:afterSave` 等のフックで実現可能だが本 MVP では対象外）
- **Notion 公式の `X-Notion-Signature`（生ボディ HMAC）は検証できない**。emdash はプラグインルートに渡す前に必ずリクエストボディを一度パースするため（native/sandboxed 問わず）、生バイトにアクセスできない。代わりに Notion 購読 URL の `?token=` クエリに共有シークレットを載せ、定数時間比較で検証する
- **emdash のシステム `slug`/`status` 列はプラグインから設定できない**。`ctx.content.create/update` は `{ type, data }` のみを受け付け、システム列はサーバー側で除外されるため、「slug フィールド Slug」で指定した値は通常のデータフィールドとして保存される（URL ルーティングに使われる slug 列とは別）。同期したコンテンツは Notion 側の公開状態に関わらず常に `draft` として作成される。これはこのプラグインの不具合ではなく emdash プラグイン API 側の制約であり、emdash の REST API（Bearer トークン認証）は両方とも設定可能なため、将来的には `ctx.content` の代わりに REST API 経由で書き込むモードを追加できる可能性がある
- 著者/slug プロパティのドロップダウンは、integration と共有中の全データベースのプロパティ名を集約したもの（選択中の行のデータベースに絞り込んだ候補ではない）
- emdash はプラグインにコレクション/フィールドのスキーマを問い合わせる API・生 DB アクセスを提供していない（意図的に塞がれている）。そのため「emdash コレクション Slug」は自由入力（既に存在するコレクション Slug を手入力する）。タイトル/本文/著者/slug の各フィールド Slug は、**設定済みの対応関係が指すコレクションの既存コンテンツからフィールド名を逆引きしたドロップダウン**（`list-fields`）から選べる。コレクションにコンテンツが 1 件も無い場合は候補が出ないため、その場合は既存コンテンツを 1 件作ってから設定し直すか、対応保存後にブラウザをリロードして選び直す
- 本文フィールド Slug の既定値は emdash 標準シード（`pages`/`posts`）に合わせて `content`。著者/slug フィールド Slug は既定では空欄（同期しない）で、指定した場合に対象コレクションへそのフィールドが無ければ自動的にそのフィールドだけスキップして同期する（title/body フィールドが存在しない場合はエラーになる）
- **`notion-blocks` は任意導入だが推奨**。未導入の場合、`notionCallout`/`notionTodo`/`notionToggle` は emdash 標準の Portable Text レンダラにとって未知の `_type` となり、何も描画されない（テキスト自体は保存済みで、`notion-blocks` を導入すれば表示されるようになる）
- 通常テキストの色・背景色装飾（Notion の span 単位のハイライト色）は今回未対応（今後の対応候補）

## セットアップ

1. `astro.config.mjs` で両方を登録する。`notion-blocks` は native format のため `plugins: []` に登録する。`notion-sync` は sandboxed format だが、`plugins: []`（in-process、isolation なし、追加設定不要）と `sandboxed: []`（isolation あり、`sandboxRunner` が必要）のどちらにも登録できる:

   ```typescript
   import { defineConfig } from "astro/config";
   import emdash from "emdash/astro";
   import notionSync from "@emdash-notion/sync";
   import { notionBlocksPlugin } from "@emdash-notion/blocks";

   export default defineConfig({
     integrations: [
       emdash({
         plugins: [notionBlocksPlugin(), notionSync],
       }),
     ],
   });
   ```

   サンドボックス分離が必要（かつ利用可能）な場合は、`notionSync` を `sandboxed: []` へ移し `sandboxRunner` を設定する（例: Cloudflare Workers なら `@emdash-cms/cloudflare` の `sandbox()`）:

   ```typescript
   import { sandbox } from "@emdash-cms/cloudflare";
   // ...
   emdash({
     plugins: [notionBlocksPlugin()],
     sandboxed: [notionSync],
     sandboxRunner: sandbox(),
   });
   ```

   **Cloudflare の `sandbox()` ランナーは Workers Paid プラン専用**（実体である [Dynamic Worker Loader](https://developers.cloudflare.com/dynamic-workers/pricing/) が Free プランでは利用できない）。Free プランでは上記の `plugins: []` 形式（`sandboxRunner` 無し）を使う — EmDash は runner 未設定時、sandboxed format のプラグインを in-process 実行にフォールバックする。

   `notionBlocksPlugin()` は登録するだけでよく、設定ページは持たない。Notion 風の callout/to-do/toggle 表示が不要なら省略できる。Cloudflare Workers では `sandboxRunner` の利用に `wrangler.jsonc` の `worker_loaders` バインディングも必要（[Worker Loader のドキュメント](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)参照）。

2. emdash 管理画面のプラグイン一覧 → `notion-sync` の歯車アイコンから設定ページを開き、次の順で設定する:
   1. **言語** — English / 日本語 を選ぶ（任意。既定は英語）
   2. **トークンを保存** — Notion Integration Token を入力して保存（保存すると以降のドロップダウンがこのトークンで Notion を検索する）
   3. **EmDash token を生成** — 「EmDash token を生成」ボタンを押すと、ランダムな Webhook URL token が生成・自動保存され、Notion に登録すべき完全な Webhook URL が画面に表示される。「Webhook URL トークン」欄に自分で好きな値を入力してもよい。この値は Notion が購読作成時に一度だけ送ってくる `verification_token`（別概念）とは無関係。
   4. **対応を追加** — 末尾の空欄フォームに、emdash コレクション Slug・Notion データベース（ドロップダウン）・著者/slug プロパティ（ドロップダウン、既定値のままで通常は問題ない）を入力して保存する。保存すると「対応 N」として独立したフォームになり、いつでも内容を編集して個別に保存、または「この対応を削除」で削除できる。コレクションごとに複数の対応を追加できる。タイトル/本文/著者/slug のフィールド Slug 選択肢は、保存後（コレクションに既存コンテンツがあれば）自動的に埋まる
   5. **手動取得** — 今すぐ同期して動作確認する

3. Notion 側の Webhook 購読を作成し、トークン生成後に表示された URL を購読 URL として登録する:

   ```
   https://<your-site>/_emdash/api/plugins/notion-sync/webhook?token=<Webhook URL Token>
   ```

   購読作成時のハンドシェイク（`verification_token`）は自動でエコー返しされる。

## Notion ブロックと見た目のカスタマイズ（`notion-blocks`）

`notion-blocks` は次のカスタム Portable Text ブロック型（`notion-sync` が生成）用の Astro コンポーネントを配布する:

| `_type`          | Notion の元ブロック     | 補足                                                                              |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `notionCallout`  | callout                 | アイコン（絵文字/画像）と色を保持。                                               |
| `notionTodo`     | to-do                   | チェック状態とネスト深さを保持。                                                  |
| `notionToggle`   | toggle                  | 開閉式。子は入れ子の Portable Text として保持。                                   |
| `notionEquation` | ブロック数式            | **生の LaTeX 文字列**をそのままテキスト表示（KaTeX/MathJax は同梱しない）。       |
| `notionBookmark` | bookmark / link preview | `notion-sync` が OGP を取得できた場合のみカード表示（下記）。失敗時は素のリンク。 |
| `divider`        | 区切り線                | 単純な `<hr>`。                                                                   |

その他の Notion ブロック（テーブル・カラム・video/audio/file/pdf・embed・画像）は emdash **コア標準**の Portable Text ブロック型へ変換され、emdash 標準コンポーネントが描画する（`notion-blocks` は関与しない）。

**bookmark の OGP** は `notion-sync` が同期時（`fetchOgp`）に取得する。取得失敗やホスト到達不可のときは `og` なしで保存され、`notion-blocks` は素のリンクを描画する。Notion 由来の URL は描画前にスキーム検証され、`javascript:` 等の危険な href/src は破棄される。

**スタイルの上書き** — 各コンポーネントは CSS カスタムプロパティを読むため、サイトのグローバル CSS から eject せずにテーマ調整できる:

| プロパティ                    | コンポーネント | 用途                   |
| ----------------------------- | -------------- | ---------------------- |
| `--notion-callout-accent`     | callout        | 文字/前景色            |
| `--notion-callout-bg`         | callout        | 背景色                 |
| `--notion-todo-checked-color` | to-do          | チェックマークの色     |
| `--notion-todo-indent`        | to-do          | ネスト時のインデント幅 |

テーマ変数があるのは callout と to-do のみ。`notionBookmark`・`notionEquation`・`divider` には CSS カスタムプロパティが無く（ダークモードにもまだ対応していない）、色や余白を変えたい場合はサイトのグローバル CSS から `.notion-bookmark`・`.notion-equation`・`.notion-divider` クラスをより高い詳細度で上書きする。

## 配布

`notion-blocks` は `componentsEntry` を宣言する **native** プラグインのため、マーケットプレイス（sandboxed 向け）には公開できず、**npm** 配布のみで `astro.config.mjs` の `plugins: []` に導入する。`notion-sync` は **sandboxed** プラグインで、[`emdash-plugin` CLI](https://docs.emdashcms.com/plugins/creating-plugins/cli/) で構築する。npm 配布に加え、EmDash マーケットプレイス/レジストリへも公開してワンクリックインストールに対応できる。

## 開発

pnpm workspace の monorepo（`packages/*` と `templates/*`）。共通ツールのバージョン（`emdash`・`oxlint`・`oxfmt`・`eslint`・`typescript`・`vitest` 等）は `pnpm-workspace.yaml` の `catalog:` に一元管理する — バージョンを上げる際はここを編集し、各パッケージ側では編集しない。

```sh
pnpm install
pnpm typecheck   # 全パッケージに対して実行
pnpm test        # 全パッケージに対して実行
pnpm lint
pnpm build       # パッケージごとに dist/ を出力（いずれも通常の npm パッケージとしてビルドする）
```

特定パッケージだけ実行するには `pnpm --filter @emdash-notion/sync <script>`、または `cd packages/sync && pnpm <script>` を使う。

`packages/sync` のマニフェスト（`emdash-plugin.jsonc`）は `pnpm --filter @emdash-notion/sync validate`（[`emdash-plugin validate`](https://docs.emdashcms.com/plugins/creating-plugins/cli/) のラッパー）でオフライン検証できる。`build` スクリプトは `emdash-plugin build`（`dist/plugin.mjs`・`dist/manifest.json`・`dist/index.mjs` を生成）に続けて、`./portable-text` サブパスの型のみ別途 `tsc` でビルドする。

**ローカルでの動作確認**: `templates/sample-emdash-site` は両プラグインを `workspace:*` で参照する workspace メンバーなので、プラグインをビルド（`pnpm build`）した後 `pnpm --filter sample-emdash-site dev` するだけでローカルの変更がすぐ反映される（pack/publish 不要）。`private` のため npm には公開されない。

**この workspace の外にある EmDash サイトでの動作確認**: `pnpm link` は手軽に見えるが、link したパッケージがこの monorepo 自身の `node_modules`（サイト側とは別の pnpm ストア）から `emdash` を解決し続けてしまい、バージョンを揃えても `emdash` が物理的に二重インスタンスになる（プラグイン登録が壊れうる）。代わりに、各パッケージ（`packages/sync`・`packages/blocks`）で `pnpm build && pnpm pack` し、生成された `.tgz` をサイト側の `pnpm-workspace.yaml` の `overrides` に指定する（`package.json` の `pnpm` フィールドではない — 最近の pnpm はそこから overrides を読まなくなった）:

```yaml
overrides:
  "@emdash-notion/sync": "file:/絶対パス/emdash-notion-sync-X.Y.Z.tgz"
  "@emdash-notion/blocks": "file:/絶対パス/emdash-notion-blocks-X.Y.Z.tgz"
```

その後サイト側で `pnpm install` する。サイト自身の単一 lockfile で解決されるため `emdash` インスタンスは1つに収まる。確認が終わったら override を戻して再インストールする。

ブラウザを使わずにプラグインを動かして確認したい場合（管理画面のルートはセッション + CSRF トークンを要求し、`curl` での偽装が面倒）、`emdash` CLI（サイトの依存関係に既に含まれる）が便利: `pnpm exec emdash content create/get/delete/restore <collection> ...` で、dev サーバーが使っているのと同じ D1 データベースに対してゴミ箱・論理削除の挙動を直接確認できる。

## `emdash-notion`（単一パッケージ版）からの移行

以前のバージョンは単一の `emdash-notion` パッケージ（plugin id: `emdash-notion`）として配布していた。このパッケージは非推奨とし、`@emdash-notion/sync` + `@emdash-notion/blocks` に置き換える。移行手順:

1. `emdash-notion` への依存を `@emdash-notion/sync`（必要なら `@emdash-notion/blocks` も）に置き換える。
2. `astro.config.mjs` の登録を `emdashNotionPlugin()` から `notionSync`・`notionBlocksPlugin()` に変更する（`plugins: []` と `sandboxed: []` の使い分けは上記「[セットアップ](#セットアップ)」参照）。
3. Notion 側の Webhook 購読 URL を更新する: パスが `.../plugins/emdash-notion/webhook` から `.../plugins/notion-sync/webhook` に変わる。
4. **プラグイン storage は plugin id ごとに名前空間が分かれる**ため、既存の Notion pageId ↔ emdash コンテンツ id の対応マップ（`ctx.storage.sync_map`）は `notion-sync` に引き継がれない。`ingest.ts` は create/update の判定をこのマップのみで行うため、移行後に最初の手動取得を行うと、対応済みのページが**新規コンテンツとして重複作成される**。重複を避けるには、再同期前に旧コンテンツを削除するか、別コレクションへマッピングし直すこと。

## ライセンス

[MIT](./LICENSE)
