import type { PluginContext } from "emdash";

import type { IngestResult } from "./ingest.js";
import { getMapping, putMapping } from "./sync-map.js";

/**
 * Notion 側で削除・アーカイブされたページに対応する emdash コンテンツをゴミ箱へ移す（論理削除）。
 * syncMap のレコード自体は消さず `deletedAt` を付けて残す — 復元（undelete）時に同じ Notion
 * ページの再同期であることを追跡し続け、無条件の新規重複作成を避けるため（`ingest.ts` 参照）。
 */
export async function deleteSyncedPage(
  ctx: PluginContext,
  pageId: string,
  fallbackCollections: string[] = [],
): Promise<IngestResult> {
  if (!ctx.content?.delete) {
    return { status: "skipped", reason: "content:write capability unavailable" };
  }

  const existing = await getMapping(ctx, pageId);
  if (!existing || existing.pending) {
    return { status: "skipped", reason: "page was never synced" };
  }
  if (existing.deletedAt) {
    return { status: "unchanged", emdashId: existing.emdashId };
  }

  // WHY: collection 保存前に同期された古いレコードは collection を持たない。設定済み
  // マッピングの collection を順に試す best-effort フォールバックで探す。
  const candidates = existing.collection ? [existing.collection] : fallbackCollections;
  for (const collection of candidates) {
    const deleted = await ctx.content.delete(collection, existing.emdashId).catch(() => false);
    if (deleted) break;
  }
  // WHY: content.delete が false（既に emdash 側で削除済み・id 不一致等）を返しても、Notion
  // 側では既に削除されているため deletedAt を付けて記録する（無限リトライにしない・冪等にする）。

  await putMapping(ctx, pageId, { ...existing, deletedAt: new Date().toISOString() });
  ctx.log.info("notion page removed upstream, trashed synced emdash content", {
    pageId,
    emdashId: existing.emdashId,
  });
  return { status: "deleted", emdashId: existing.emdashId };
}
