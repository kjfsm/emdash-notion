---
"emdash-notion-sync": patch
---

`ndashPlugin()` の `entrypoint` を `"ndash"`（プラグイン id）から `"emdash-notion"`（実際にインストールされる npm パッケージ名）へ修正。`plugins: []` で読み込むサイトの `astro build` が `virtual:emdash/plugins` から `"ndash"` を解決できず失敗していた。
