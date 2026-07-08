/**
 * 決定的な内容ハッシュ。
 *
 * WHY: 逆方向同期（emdash → Notion, 後続）でのループ防止と、無変更 Webhook の再処理スキップに使う。
 * crypto.subtle.digest は非同期なので、同期的で十分な FNV-1a(32bit) を採用する（暗号強度は不要）。
 */
export function stableHash(value: unknown): string {
  const json = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** キーをソートした安定 JSON 文字列化。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
