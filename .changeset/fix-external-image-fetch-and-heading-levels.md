---
"@emdash-notion/sync": patch
---

外部ホストの画像（Unsplash 等）を Notion 同期時に emdash メディアへ取り込もうとして `allowedHosts` 違反で fetch が失敗し、無駄な警告ログが出続けていた不具合を修正した。`convertFile` と同様に、Notion がホストする署名付き URL（`image.type === "file"`）のときだけ fetch・永続化を行い、外部 URL（`image.type === "external"`）はそのまま参照するようにした。また `heading_4`/`heading_5`/`heading_6` を `h4`/`h5`/`h6` として変換するようにし、未対応ブロックとして段落へフォールバックされ見出しスタイルが失われる問題を解消した。
