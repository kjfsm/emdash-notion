# @emdash-notion/blocks

## 0.1.1

### Patch Changes

- 39b2d3b: `divider` が `blockComponents` に未登録で `PortableText [components.type] is missing "divider"` と表示されていた不具合を修正した。あわせて `notionEquation`（生 LaTeX 文字列を表示）・`notionBookmark`（bookmark/link_preview を OGP メタデータ付きカードで表示、取得失敗時は URL のみの簡易表示にフォールバック）の描画コンポーネントを追加した。
- 0bd7aae: `NotionCallout.astro` が相対パスで参照していた `notion-color.ts` が npm 公開物（`files`）に含まれておらず、consumer 側のビルドが `Could not resolve './notion-color.js'` で失敗する不具合を修正した。ビルドを `tsc` から `tsdown` に切り替えて `notion-color.ts` も `dist/` に出力し、`NotionCallout.astro` からはパッケージ自己参照の subpath export（`@emdash-notion/blocks/notion-color`）経由で参照するようにした。
