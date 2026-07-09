import type { NotionRichText } from "./types.js";

/** Notion の rich_text 配列を注釈を落としたプレーンテキストへ連結する。 */
export function plainText(richText: NotionRichText[] | null | undefined): string {
  return (richText ?? []).map((rt) => rt.plain_text).join("");
}
