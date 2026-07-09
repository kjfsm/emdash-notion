# @emdash-notion/sync

## 0.3.0

### Minor Changes

- bcfdf06: Notion でのページ削除・アーカイブを emdash のゴミ箱へ同期するようになった:

  - `page.deleted`/`page.undeleted` webhook イベント種別、ingest 内の `archived`/`in_trash` チェック、ページ完全削除時の 404 フォールバックの3層で検知する
  - emdash 側は `ctx.content.delete`（ソフトデリート/ゴミ箱）で削除し、Notion 側で復元(undelete)されると次回同期で新規コンテンツとして作り直す
  - 手動取得（`syncAll`）にも照合パスを追加: Notion の `queryDatabase` はアーカイブ済みページを返さないため、DB クエリで見えなくなった同期済みページを個別に確認し、削除・アーカイブが確認できたものだけ削除する（別 DB へ移動しただけの生存ページは削除しない）
  - 管理画面の同期結果バナーに削除件数を表示

  あわせて、`NotionClient` のリトライ/バックオフ、`stableHash`、`fetchPage` のリクエスト予算管理に専用のユニットテストを追加した(実装変更なし)。README に slug/status が emdash プラグイン API の制約で設定できない旨を明記した。

- d2de830: notion-sync を standard format から sandboxed format（`emdash-plugin.jsonc` + `src/plugin.ts`、`@emdash-cms/plugin-cli` でビルド）へ移行した。

  - `astro.config.mjs` での登録方法が `plugins: [notionSyncPlugin()]` から `sandboxed: [notionSync]`（+ `sandboxRunner` の設定）に変わる（破壊的変更）。default export をそのまま渡す形になり、ファクトリ関数呼び出しは不要になった
  - EmDash マーケットプレイス/レジストリでの配布（`emdash-plugin bundle`/`publish`）が可能になった
  - storage collection 名を `syncMap` → `sync_map` にリネーム（`emdash-plugin.jsonc` のスキーマが camelCase を許容しないため）。既存サイトでは移行時に一度だけ同期マップが再構築される（旧 `notion-sync` からの移行と同様の注意点）
  - `admin.pages` のパスを `/` → `/settings` に変更（sandboxed マニフェストのスキーマ上 2 文字以上必須）

  0.x のため、公開エントリポイントの shape 変更という破壊的変更を `minor` で表現している（CLAUDE.md ルール2の既定 `patch` から意図的に外れる）。

### Patch Changes

- 1b7444c: webhook 受信から Portable Text 変換・emdash 保存までを一気通貫で検証する結合テスト（`tests/integration.test.ts`）を追加した。
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

## 0.2.0

### Minor Changes

- 4d4f066: リリースに向けた整備。パッケージ名を `ndash` から `emdash-notion` に変更し、npm 公開可能にした（`private` 解除、`license`/`repository`/`keywords`/`publishConfig` 等を追加、peerDependencies を `>=0.27.0` に厳格化）。

  - 管理画面の UI を日英対応（既定 `en`、設定ページで切替。`src/i18n/` にメッセージカタログを追加）。Notion 著者プロパティの既定名を `著者` → `Author` に変更
  - pnpm へ移行し、oxlint / eslint / oxfmt と CI/CD（changesets による canary + stable 2 段リリース、publint / attw / size-limit / CodeQL / dependency-review / dependabot）を追加

  プラグイン `id`（`ndash`）と webhook URL は変更なし。

### Patch Changes

- 0a9cc7f: 管理画面に「Notion の構造を取得する」ボタンを追加し、トークン保存後に明示的な操作で Notion のデータベース/プロパティ一覧を取得する方式に変更。取得結果（成功件数・失敗したデータベース）は banner で必ず画面に表示されるようにし、また 1 データベースの取得失敗が他のデータベース分の結果を巻き込んで著者/slug プロパティの選択肢が全滅する不具合を修正した。
- 39b2d3b: Notion の table/column_list/equation/video/audio/file/pdf/bookmark/embed/link_preview ブロックの Portable Text 変換に対応した。table・column_list・video・audio・embed は emdash コア標準の table/columns/embed 形状へ変換し、file/pdf は emdash コア標準の file 形状（署名付き URL は emdash メディアへ永続化）へ変換することで、既存の描画コンポーネントをそのまま流用できるようにした。equation は生の LaTeX 文字列のまま、bookmark/link_preview は OGP メタデータ（title/description/image、取得失敗時は url/caption のみへフォールバック）付きのカスタムブロックへ変換する。
- 5f35db2: `notion-sync` を native format から standard format へ移行した。管理 UI は元々 Block Kit のみで実装済みで、Portable Text のカスタムブロック型・Astro コンポーネントは `notion-blocks` 側の責務のため、`sync` 側の standard 化に伴う機能・登録方法（`astro.config.mjs` の `plugins: []`）の変更は無い。
- 53381d2: 外部ホストの画像（Unsplash 等）を Notion 同期時に emdash メディアへ取り込もうとして `allowedHosts` 違反で fetch が失敗し、無駄な警告ログが出続けていた不具合を修正した。`convertFile` と同様に、Notion がホストする署名付き URL（`image.type === "file"`）のときだけ fetch・永続化を行い、外部 URL（`image.type === "external"`）はそのまま参照するようにした。また `heading_4`/`heading_5`/`heading_6` を `h4`/`h5`/`h6` として変換するようにし、未対応ブロックとして段落へフォールバックされ見出しスタイルが失われる問題を解消した。
- a862f0e: `ndashPlugin()` の `entrypoint` を `"ndash"`（プラグイン id）から `"emdash-notion"`（実際にインストールされる npm パッケージ名）へ修正。`plugins: []` で読み込むサイトの `astro build` が `virtual:emdash/plugins` から `"ndash"` を解決できず失敗していた。
- aaeea05: 管理画面に「EmDash token を生成」ボタンを追加した。押すとランダムな共有シークレットを生成して Webhook URL token として保存し、Notion 側に登録すべき完全な Webhook URL（`?token=` 付き）を画面に表示する。あわせて、この Webhook URL token が Notion の `verification_token`（購読作成時に一度だけ届く別概念の値）とは異なるものであることを画面上で明記した。
- 8faf878: 管理画面の「EmDash Collection」「Notion Database」ラベルを分かりやすくし、Notion データベースのセレクトを「DB 名 (id)」形式に変更。また、本文/著者/slug フィールドの既定値を実際の emdash シード（`pages`/`posts`）のフィールド構成に合わせて修正（body → content、author/slug は既定で同期しないよう空欄に変更）。
- 11362f7: Notion Webhook 購読作成時のハンドシェイクで届く検証トークン（`verification_token`）をログに出力するようにした。これまでは確認手段が無く、Notion 側の Webhook 検証欄に貼り戻せなかった。一度きりの値のため kv には保持しない（Workers のダッシュボードログから確認する運用）。
