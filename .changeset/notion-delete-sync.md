---
"@emdash-notion/sync": minor
---

Notion でのページ削除・アーカイブを emdash のゴミ箱へ同期するようになった:

- `page.deleted`/`page.undeleted` webhook イベント種別、ingest 内の `archived`/`in_trash` チェック、ページ完全削除時の 404 フォールバックの3層で検知する
- emdash 側は `ctx.content.delete`（ソフトデリート/ゴミ箱）で削除し、Notion 側で復元(undelete)されると次回同期で新規コンテンツとして作り直す
- 手動取得（`syncAll`）にも照合パスを追加: Notion の `queryDatabase` はアーカイブ済みページを返さないため、DB クエリで見えなくなった同期済みページを個別に確認し、削除・アーカイブが確認できたものだけ削除する（別 DB へ移動しただけの生存ページは削除しない）
- 管理画面の同期結果バナーに削除件数を表示

あわせて、`NotionClient` のリトライ/バックオフ、`stableHash`、`fetchPage` のリクエスト予算管理に専用のユニットテストを追加した(実装変更なし)。README に slug/status が emdash プラグイン API の制約で設定できない旨を明記した。
