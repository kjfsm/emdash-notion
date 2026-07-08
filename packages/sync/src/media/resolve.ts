import type { PluginContext } from "emdash";

import type { FileResolver, ImageResolver } from "../portable-text/from-notion.js";

/**
 * Notion 画像を emdash メディアへ取り込む ImageResolver を作る。
 *
 * WHY: Notion の画像 URL（署名付き S3）は約 1 時間で失効するため、同期時にバイトを取得して
 * emdash 側へ永続化し、Portable Text は emdash メディア参照を指すようにする。
 * 取得・アップロードに失敗した場合は元 URL 参照へフォールバックし、同期全体は止めない。
 */
export function createImageResolver(ctx: PluginContext): ImageResolver {
  return async ({ url, alt }) => {
    const media = ctx.media;
    const http = ctx.http;
    if (!media?.upload || !http) return { ref: url, url };

    try {
      const res = await http.fetch(url, { method: "GET" });
      if (!res.ok) {
        ctx.log.warn("notion image fetch failed", { url, status: res.status });
        return { ref: url, url };
      }
      const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
      const bytes = await res.arrayBuffer();
      const filename = deriveFilename(url, alt, contentType);
      const uploaded = await media.upload(filename, contentType, bytes);
      return { ref: uploaded.mediaId, url: uploaded.url };
    } catch (err) {
      ctx.log.warn("notion image import failed", { url, error: String(err) });
      return { ref: url, url };
    }
  };
}

/**
 * Notion の file/pdf ブロックの署名付き URL（約1時間で失効）を emdash メディアへ取り込む
 * FileResolver を作る。ロジックは createImageResolver とほぼ同じだが、video/audio は
 * サイズが大きく Worker の実行時間・メモリを圧迫しうるため対象外とし、呼び出し側
 * （from-notion.ts の convertFile）が file/pdf にのみ resolver を渡す。
 */
export function createFileResolver(ctx: PluginContext): FileResolver {
  return async ({ url, filename }) => {
    const media = ctx.media;
    const http = ctx.http;
    if (!media?.upload || !http) return { ref: url, url };

    try {
      const res = await http.fetch(url, { method: "GET" });
      if (!res.ok) {
        ctx.log.warn("notion file fetch failed", { url, status: res.status });
        return { ref: url, url };
      }
      const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
      const bytes = await res.arrayBuffer();
      const uploaded = await media.upload(
        filename ?? deriveFilename(url, "", contentType),
        contentType,
        bytes,
      );
      return { ref: uploaded.mediaId, url: uploaded.url };
    } catch (err) {
      ctx.log.warn("notion file import failed", { url, error: String(err) });
      return { ref: url, url };
    }
  };
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function deriveFilename(url: string, alt: string, contentType: string): string {
  let base = "";
  try {
    const path = new URL(url).pathname;
    base = path.slice(path.lastIndexOf("/") + 1);
  } catch {
    base = "";
  }
  if (base && base.includes(".")) return base;

  const ext = CONTENT_TYPE_EXT[contentType.split(";")[0]?.trim() ?? ""] ?? "bin";
  const stem = (base || alt || "image").replace(/[^\w.-]+/g, "-").slice(0, 64) || "image";
  return `${stem}.${ext}`;
}
