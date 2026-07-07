---
"emdash-notion": patch
---

Notion Webhook 購読作成時のハンドシェイクで届く検証トークン（`verification_token`）を、Workers ログとコピー用の管理画面コードブロックの両方で確認できるようにした。これまでは kv に保存するだけで確認手段が無く、Notion 側の Webhook 検証欄に貼り戻せなかった。
