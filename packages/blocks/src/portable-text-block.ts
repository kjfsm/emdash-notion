/**
 * Notion 由来ノードの inline 子（children + markDefs）を PortableText が描画できる
 * 単一の normal ブロックへ包む。callout/todo/toggle/bookmark が同じ包み方をするため共通化する。
 * `key` は元ノードの `_key` に用途別 suffix（-text/-title/-caption）を付けて衝突を避ける。
 */
export function toTextBlock(key: string, children: unknown[], markDefs: unknown[] = []) {
  return {
    _type: "block" as const,
    _key: key,
    style: "normal",
    children,
    markDefs,
  };
}
