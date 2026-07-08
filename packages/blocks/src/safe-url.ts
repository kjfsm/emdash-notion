// Notion 由来（ユーザー制御）の URL をリンク/画像に描画する前のスキーム検証。
// `javascript:` 等の危険スキームを弾き、安全なもの（http/https/mailto/相対・プロトコル相対）だけ通す。
// サイト描画コンポーネントに emdash 本体（サーバ依存）を import しないよう、軽量に自己完結させる。
const SAFE_ABSOLUTE_SCHEME = /^(https?|mailto):/i;

/** リンク先として安全な URL だけ返す。危険・不正なら undefined（描画側でリンクを抑止する）。 */
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  // 相対パス・プロトコル相対・アンカーはスキームを持たないので安全に通す。
  if (trimmed.startsWith("/") || trimmed.startsWith("#") || trimmed.startsWith("./"))
    return trimmed;
  if (trimmed.startsWith("//")) return trimmed;
  return SAFE_ABSOLUTE_SCHEME.test(trimmed) ? trimmed : undefined;
}

/** 画像 src として安全な URL だけ返す。http(s)・プロトコル相対・相対のみ許可（mailto 等は画像に不適）。 */
export function safeImageSrc(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("./")) return trimmed;
  if (trimmed.startsWith("//")) return trimmed;
  return /^https?:/i.test(trimmed) ? trimmed : undefined;
}
