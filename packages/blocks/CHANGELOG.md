# @emdash-notion/blocks

## 0.1.2

### Patch Changes

- bcfdf06: `NotionBookmark` の caption が `<p>` の中に PortableText の `<p>` を入れ子にしており無効な HTML になっていたバグを修正した（callout/todo と同じ `<div>` ラップ方式に統一）。

  `type-parity` テストに `NotionTodo` の `level` フィールドの欠落（既存のドリフト）を追加し、トップレベルのキー集合の欠落・余剰を検出する双方向チェックを導入した。

  publint・attw・size-limit・カバレッジ計測を release gate（CI の `verify` ジョブ）に追加し、`@emdash-notion/sync` と同水準の配布物検査を受けるようにした。

- abc1ba4: これまで無言でドロップされていた未対応 Notion ブロックを再現するようになった:

  - `table_of_contents`・`child_page`・`child_database`・`link_to_page` を新しい native カスタムブロック（`notionTableOfContents`・`notionChildPage`・`notionChildDatabase`・`notionLinkToPage`）として変換し、`notion-blocks` 側に対応する Astro コンポーネントを追加した
  - `synced_block` は透過扱い（子ブロックのみ展開）、`template`・`tab` は emdash 標準の `htmlBlock`（サニタイズ済み生 HTML）で最小限のマーカーを出力するようにした
  - 真に未知なブロック型（`rich_text` を持たないもの）も、完全ドロップの代わりに `<!-- notion:unsupported TYPE -->` を `htmlBlock` として出力し、サイト上で存在を可視化するようにした（`unsupported` ログへの記録は継続）
  - `breadcrumb` は Notion API が親ページ階層を返さず実質空になるため対応しない

  `htmlBlock` の既定サニタイズは `class`/`id`/`style` を許可しないため、見た目の制御が必要な4型のみ native ブロック化し、レアケースのみ `htmlBlock` フォールバックとした。

- 29dcce4: メジャーリリースに向けた品質改善（1.0 前ハードニング）:

  - descriptor の `version` を package.json から自動生成（`gen-version`）し、マニフェスト上のバージョン乖離を解消
  - webhook の並行/重複配信による二重コンテンツ作成を、create 前の軽量な予約（pending/claimId）で best-effort に抑止（レビューで判明した「create 後の照合では真の同時実行を防げない」問題を受けて設計を修正し、無駄な重複作成自体を避けるようにした）
  - リクエスト予算超過でブロックツリーが打ち切られた場合に `truncated` を伝播し、ハッシュに含めて次回の全量同期で自動修復（unchanged 判定時も保存済みの truncated 状態を返し続ける。管理画面バナーは実際の失敗と区別して表示）
  - 重複 databaseId マッピングの警告を `loadConfig` に一本化し、webhook 経由の取り込みでも手動同期でも自動的に効くように修正
  - スキーマ欠損検知の正規表現がテーブル修飾されたカラム名（`t.slug` 等）でも欠損フィールドを正しく特定できるよう修正
  - 内部型パッケージ `@emdash-notion/types` を廃止し、カスタム Portable Text ブロック型を `@emdash-notion/sync/portable-text` として公開。公開物からの未公開パッケージ参照を除去し、notion-blocks とのズレを型パリティテストで検出
  - notion-blocks の bookmark/callout で Notion 由来 URL のスキームを検証（`javascript:` 等を破棄）
  - Notion API レスポンス型を公式 `@notionhq/client` 型と型レベルで照合しドリフトを検知（`import type` のみ、ランタイム非依存）
  - 一括同期で 1 データベースのクエリ失敗が全体を止めないよう継続化、重複 databaseId マッピングを警告
  - Retry-After の上限クランプ、`verification_token` のログマスク
  - notion-blocks（color/safe-url/コンポーネント網羅/型パリティ）と sync（冪等性/truncate 等）のテスト拡充、README にブロック一覧・CSS カスタムプロパティを追記

## 0.1.1

### Patch Changes

- 39b2d3b: `divider` が `blockComponents` に未登録で `PortableText [components.type] is missing "divider"` と表示されていた不具合を修正した。あわせて `notionEquation`（生 LaTeX 文字列を表示）・`notionBookmark`（bookmark/link_preview を OGP メタデータ付きカードで表示、取得失敗時は URL のみの簡易表示にフォールバック）の描画コンポーネントを追加した。
- 0bd7aae: `NotionCallout.astro` が相対パスで参照していた `notion-color.ts` が npm 公開物（`files`）に含まれておらず、consumer 側のビルドが `Could not resolve './notion-color.js'` で失敗する不具合を修正した。ビルドを `tsc` から `tsdown` に切り替えて `notion-color.ts` も `dist/` に出力し、`NotionCallout.astro` からはパッケージ自己参照の subpath export（`@emdash-notion/blocks/notion-color`）経由で参照するようにした。
