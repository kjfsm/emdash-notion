---
"@emdash-notion/blocks": minor
"@emdash-notion/sync": patch
---

挙動を変えない内部リファクタで重複を削減。

- blocks: 4 コンポーネントで重複していた PortableText ブロックラッパー生成を新しい `@emdash-notion/blocks/portable-text-block`（`toTextBlock`）へ共通化し、descriptor/definition で id を共有定数化。
- sync: `plainText()` / 画像・ファイル resolver（`fetchAndUpload`）/ mapping デフォルト適用（`applyMappingDefaults`）/ ページング cursor（`nextCursor`）/ エラー整形（`errMessage`）/ メディア URL 抽出（`mediaUrl`）を共通化し、重複型（`OptionItem`・`SyncCounts`↔`BulkSyncResult`・`OgpData`↔`og`）を統合、未使用の `escapeAttr` を削除、`ctx.content` の冗長な non-null assertion を整理。
