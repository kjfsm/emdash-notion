---
"@emdash-notion/blocks": patch
---

`NotionCallout.astro` が相対パスで参照していた `notion-color.ts` が npm 公開物（`files`）に含まれておらず、consumer 側のビルドが `Could not resolve './notion-color.js'` で失敗する不具合を修正した。ビルドを `tsc` から `tsdown` に切り替えて `notion-color.ts` も `dist/` に出力し、`NotionCallout.astro` からはパッケージ自己参照の subpath export（`@emdash-notion/blocks/notion-color`）経由で参照するようにした。
