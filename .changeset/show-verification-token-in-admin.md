---
"@emdash-notion/sync": patch
---

Notion Webhook 購読作成時のハンドシェイクで届く検証トークン（`verification_token`）をログに出力するようにした。これまでは確認手段が無く、Notion 側の Webhook 検証欄に貼り戻せなかった。一度きりの値のため kv には保持しない（Workers のダッシュボードログから確認する運用）。
