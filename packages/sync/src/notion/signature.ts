/**
 * Webhook の検証。
 *
 * WHY: emdash のプラグインルートは受信ボディをパース済み `input` として渡し、`request` の
 * body 再読込をガードする（core の #1293、実際に配布物 `guardConsumedRequestBody` で
 * `request.json()/.text()/.arrayBuffer()` 等が Proxy 経由で例外を投げることを確認済み）。
 * 生バイトが取れないため、Notion 公式の `X-Notion-Signature`（生ボディ HMAC-SHA256）は
 * 原理的に検証できない。
 * 代替として、Notion 購読 URL に共有シークレットをクエリ（`?token=...`）で埋め込み、
 * `routeCtx.request.url` から取り出して定数時間比較する（`generateWebhookToken` で
 * ランダム生成できる）。
 */

/** タイミング攻撃を避ける定数時間文字列比較（nhc `http/webhook.ts` より移植）。 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * リクエスト URL の `token` クエリを期待値と定数時間比較する。
 * `expected` が空文字（未設定）の場合は常に false（=検証必須で fail-closed）。
 */
export function verifyWebhookToken(requestUrl: string, expected: string): boolean {
  if (expected === "") return false;
  let token: string | null = null;
  try {
    token = new URL(requestUrl).searchParams.get("token");
  } catch {
    return false;
  }
  if (token === null) return false;
  return timingSafeEqual(token, expected);
}

/** Webhook URL token 用のランダムな共有シークレットを生成する（32byte, 16進64文字）。 */
export function generateWebhookToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
