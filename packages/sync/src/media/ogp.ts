import type { PluginContext } from "emdash";

import type { OgpData, OgpFetcher } from "../portable-text/from-notion.js";

/**
 * bookmark/link_preview の OGP メタデータを取得する OgpFetcher を作る。
 *
 * WHY: Notion の bookmark/link_preview ブロックは url と caption しか持たず、カード表示に
 * 必要な title/description/image を含まないため、同期時に対象 URL の HTML を取得して
 * `<meta property="og:*">` を正規表現で抽出する。外部 HTML パーサーは使わない軽量実装。
 * 取得・パース失敗時は undefined を返し、呼び出し側（convertBookmark）の url/caption のみの
 * 簡易表示へのフォールバックに委ねる（同期全体は止めない）。
 */
export function createOgpFetcher(ctx: PluginContext): OgpFetcher {
  return async (url) => {
    const http = ctx.http;
    if (!http || !isFetchableUrl(url)) return undefined;

    try {
      const res = await http.fetch(url, { method: "GET", headers: { Accept: "text/html" } });
      if (!res.ok) return undefined;
      const contentType = res.headers.get("Content-Type") ?? "";
      if (!contentType.includes("text/html")) return undefined;

      const html = await readLimited(res, MAX_OGP_BYTES);
      const data = extractOgp(html);
      return Object.values(data).some((v) => v !== undefined) ? data : undefined;
    } catch (err) {
      ctx.log.warn("notion ogp fetch failed", { url, error: String(err) });
      return undefined;
    }
  };
}

/** OGP メタタグは通常 <head> 冒頭にあるため、巨大な HTML 全体を読まずに先頭のみ読む。 */
const MAX_OGP_BYTES = 256 * 1024;

/** http(s) かつ localhost/プライベートホスト名を弾く SSRF 最小防御。 */
function isFetchableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false;
  return true;
}

/** レスポンスボディを上限バイト数まで読んで文字列化する（超過分はストリームを打ち切る）。 */
async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (received >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return new TextDecoder().decode(concatChunks(chunks, Math.min(received, maxBytes)));
}

function concatChunks(chunks: Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = length - offset;
    if (remaining <= 0) break;
    out.set(chunk.subarray(0, remaining), offset);
    offset += Math.min(chunk.byteLength, remaining);
  }
  return out;
}

const META_TAG_RE = /<meta\s+[^>]*>/gi;
const PROPERTY_OR_NAME_RE = /(?:property|name)\s*=\s*["']([^"']+)["']/i;
const CONTENT_RE = /content\s*=\s*["']([^"']*)["']/i;

/** HTML から `<meta property="og:*">` / `<meta name="og:*">` を抽出する（属性順序に依存しない）。 */
export function extractOgp(html: string): OgpData {
  const map: Record<string, string> = {};
  for (const tag of html.matchAll(META_TAG_RE)) {
    const key = tag[0].match(PROPERTY_OR_NAME_RE)?.[1];
    const content = tag[0].match(CONTENT_RE)?.[1];
    if (key?.startsWith("og:") && content !== undefined && !(key in map)) {
      map[key] = decodeHtmlEntities(content);
    }
  }
  return {
    title: map["og:title"],
    description: map["og:description"],
    image: map["og:image"],
    siteName: map["og:site_name"],
  };
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => HTML_ENTITIES[m] ?? m);
}
