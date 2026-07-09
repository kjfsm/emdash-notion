/** htmlBlock フォールバック生成用の最小 HTML エスケープ。外部依存を持たない。 */

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

export function escapeHtml(value: string): string {
  return escape(value);
}

/** 属性値エスケープ（ダブルクォートで囲む前提）。 */
export function escapeAttr(value: string): string {
  return escape(value);
}
