---
"@emdash-notion/blocks": patch
---

`divider` が `blockComponents` に未登録で `PortableText [components.type] is missing "divider"` と表示されていた不具合を修正した。あわせて `notionEquation`（生 LaTeX 文字列を表示）・`notionBookmark`（bookmark/link_preview を OGP メタデータ付きカードで表示、取得失敗時は URL のみの簡易表示にフォールバック）の描画コンポーネントを追加した。
