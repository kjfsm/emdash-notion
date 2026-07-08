---
"@emdash-notion/blocks": patch
---

`NotionBookmark` の caption が `<p>` の中に PortableText の `<p>` を入れ子にしており無効な HTML になっていたバグを修正した（callout/todo と同じ `<div>` ラップ方式に統一）。

`type-parity` テストに `NotionTodo` の `level` フィールドの欠落（既存のドリフト）を追加し、トップレベルのキー集合の欠落・余剰を検出する双方向チェックを導入した。

publint・attw・size-limit・カバレッジ計測を release gate（CI の `verify` ジョブ）に追加し、`@emdash-notion/sync` と同水準の配布物検査を受けるようにした。
