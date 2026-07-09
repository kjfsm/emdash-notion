---
"@emdash-notion/sync": patch
"@emdash-notion/blocks": patch
---

これまで無言でドロップされていた未対応 Notion ブロックを再現するようになった:

- `table_of_contents`・`child_page`・`child_database`・`link_to_page` を新しい native カスタムブロック（`notionTableOfContents`・`notionChildPage`・`notionChildDatabase`・`notionLinkToPage`）として変換し、`notion-blocks` 側に対応する Astro コンポーネントを追加した
- `synced_block` は透過扱い（子ブロックのみ展開）、`template`・`tab` は emdash 標準の `htmlBlock`（サニタイズ済み生 HTML）で最小限のマーカーを出力するようにした
- 真に未知なブロック型（`rich_text` を持たないもの）も、完全ドロップの代わりに `<!-- notion:unsupported TYPE -->` を `htmlBlock` として出力し、サイト上で存在を可視化するようにした（`unsupported` ログへの記録は継続）
- `breadcrumb` は Notion API が親ページ階層を返さず実質空になるため対応しない

`htmlBlock` の既定サニタイズは `class`/`id`/`style` を許可しないため、見た目の制御が必要な4型のみ native ブロック化し、レアケースのみ `htmlBlock` フォールバックとした。
