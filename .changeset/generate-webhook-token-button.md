---
"emdash-notion-sync": patch
---

管理画面に「EmDash token を生成」ボタンを追加した。押すとランダムな共有シークレットを生成して Webhook URL token として保存し、Notion 側に登録すべき完全な Webhook URL（`?token=` 付き）を画面に表示する。あわせて、この Webhook URL token が Notion の `verification_token`（購読作成時に一度だけ届く別概念の値）とは異なるものであることを画面上で明記した。
