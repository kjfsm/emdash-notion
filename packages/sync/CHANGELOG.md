# @emdash-notion/sync

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
