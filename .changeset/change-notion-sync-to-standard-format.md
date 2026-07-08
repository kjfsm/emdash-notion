---
"@emdash-notion/sync": patch
---

`notion-sync` を native format から standard format へ移行した。管理 UI は元々 Block Kit のみで実装済みで、Portable Text のカスタムブロック型・Astro コンポーネントは `notion-blocks` 側の責務のため、`sync` 側の standard 化に伴う機能・登録方法（`astro.config.mjs` の `plugins: []`）の変更は無い。
