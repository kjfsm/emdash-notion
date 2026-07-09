---
"@emdash-notion/sync": minor
---

notion-sync を standard format から sandboxed format（`emdash-plugin.jsonc` + `src/plugin.ts`、`@emdash-cms/plugin-cli` でビルド）へ移行した。

- `astro.config.mjs` での登録方法が `plugins: [notionSyncPlugin()]` から `sandboxed: [notionSync]`（+ `sandboxRunner` の設定）に変わる（破壊的変更）。default export をそのまま渡す形になり、ファクトリ関数呼び出しは不要になった
- EmDash マーケットプレイス/レジストリでの配布（`emdash-plugin bundle`/`publish`）が可能になった
- storage collection 名を `syncMap` → `sync_map` にリネーム（`emdash-plugin.jsonc` のスキーマが camelCase を許容しないため）。既存サイトでは移行時に一度だけ同期マップが再構築される（旧 `notion-sync` からの移行と同様の注意点）
- `admin.pages` のパスを `/` → `/settings` に変更（sandboxed マニフェストのスキーマ上 2 文字以上必須）

0.x のため、公開エントリポイントの shape 変更という破壊的変更を `minor` で表現している（CLAUDE.md ルール2の既定 `patch` から意図的に外れる）。
