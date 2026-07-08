import type { PluginContext } from "emdash";
import type { SandboxedRouteContext } from "emdash/plugin";

import { loadConfig } from "../config.js";
import { verifyWebhookToken } from "../notion/signature.js";
import type { NotionWebhookPayload } from "../notion/types.js";
import { ingestPage } from "../sync/ingest.js";

/** Webhook ペイロードから対象 pageId を取り出す。ページイベント以外は null。 */
export function extractPageId(payload: NotionWebhookPayload): string | null {
  if (payload.entity && payload.entity.type === "page" && payload.entity.id) {
    return payload.entity.id;
  }
  if (payload.page?.id) return payload.page.id;
  return null;
}

/** ログ用に秘密様の値を先頭数文字だけ残してマスクする。 */
function maskToken(token: string): string {
  if (token.length <= 6) return "***";
  return `${token.slice(0, 6)}…(${token.length} chars)`;
}

/** 401 応答を投げる（emdash はカスタム status のため throw Response を用いる）。 */
function unauthorized(): never {
  throw new Response(JSON.stringify({ error: "invalid or missing token" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/** Notion Webhook を処理する（検証 → ページ取得 → PT 変換 → emdash 保存）。 */
export async function handleWebhook(
  routeCtx: SandboxedRouteContext,
  ctx: PluginContext,
): Promise<unknown> {
  const payload = (routeCtx.input ?? {}) as NotionWebhookPayload;

  // 購読作成時のハンドシェイク: verification_token をエコー返しする。保持不要な一度きりの値だが、
  // 恒久ログに丸ごと残さないよう、ログには先頭数文字だけのマスク値を出す（フル値はレスポンスで返る）。
  if (typeof payload.verification_token === "string") {
    ctx.log.info(
      `notion webhook verification handshake received: ${maskToken(payload.verification_token)}`,
    );
    return { verification_token: payload.verification_token };
  }

  const config = await loadConfig(ctx);
  if (!verifyWebhookToken(routeCtx.request.url, config.webhookToken)) {
    ctx.log.warn("notion webhook rejected: token mismatch");
    unauthorized();
  }

  const pageId = extractPageId(payload);
  if (!pageId) return { ok: true, skipped: "no page entity in payload" };

  const result = await ingestPage(ctx, pageId);
  return { ok: true, ...result };
}
