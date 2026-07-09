import type { PluginContext } from "emdash";

import { isConfigReady, loadConfig } from "../config.js";
import { defaultLocale, getMessages, type Messages } from "../i18n/index.js";
import { NotionApiError, NotionClient } from "../notion/client.js";
import { deleteSyncedPage } from "./delete.js";
import { ingestPage } from "./ingest.js";
import { iterateMappings } from "./sync-map.js";

export interface BulkSyncResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  /** 予算超過で本文末尾が欠落したまま保存されたページ数。 */
  truncated: number;
  /** Notion 側で削除・アーカイブされ、emdash 側をゴミ箱へ移したページ数。 */
  deleted: number;
  errors: string[];
}

/**
 * 手動取得（管理画面の「手動取得」ボタン）。設定済みの全マッピングを対象に、DB ごとに 1 件ずつ `ingestPage` する。
 * @param m バナー表示に使うメッセージ束。未指定なら既定言語（利用者向け文字列のみ localize、ログは英語のまま）。
 *
 * TODO(2026-07-09, marketplace 配布前に要対応): 全マッピングの全ページを 1 回のルート呼び出し内で
 * ループする設計のため、sandboxed 実行下（Cloudflare Worker Loader、subrequest 上限 10/呼び出し）では
 * ページ数が数件を超えるデータベースで確実に上限超過・失敗する。チャンク分割（1 呼び出しで N 件だけ処理し、
 * カーソルを storage/KV に永続化して次の呼び出しで続きから再開する）は未実装。実機検証のうえ対応すること
 * （CLAUDE.md「確認済みの技術メモ」参照）。
 */
export async function syncAll(
  ctx: PluginContext,
  m: Messages = getMessages(defaultLocale),
): Promise<BulkSyncResult> {
  const config = await loadConfig(ctx);
  const result: BulkSyncResult = {
    total: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    truncated: 0,
    deleted: 0,
    errors: [],
  };

  if (!isConfigReady(config)) {
    result.errors.push(m.configMissing);
    return result;
  }
  if (!ctx.http) {
    result.errors.push(m.networkUnavailable);
    return result;
  }

  // WHY: 重複 databaseId の検証は loadConfig 内で行う（ingestPage/webhook 経路にも自動で効かせるため）。
  const client = new NotionClient(ctx.http, config.notionToken);
  // WHY: Notion の queryDatabase はアーカイブ/ゴミ箱入りのページを返さない。DB クエリで見えた
  // pageId を記録しておき、後段の照合パスで「同期済みだが今回見えなくなったページ」を検知する。
  const seenPageIds = new Set<string>();

  for (const mapping of config.mappings) {
    if (!mapping.databaseId || !mapping.collection) continue;

    // WHY: queryDatabase 自体の失敗（1 DB の権限不足・削除済み等）が他の DB の同期を巻き込んで
    // 全体を throw しないよう、DB 単位で try/catch し、失敗はその DB 分だけ errors に積んで継続する。
    try {
      let cursor: string | undefined;
      do {
        const page = await client.queryDatabase(mapping.databaseId, cursor);

        for (const notionPage of page.results) {
          seenPageIds.add(notionPage.id);
          result.total++;
          try {
            const outcome = await ingestPage(ctx, notionPage.id);
            if (outcome.status === "created") result.created++;
            else if (outcome.status === "updated") result.updated++;
            else if (outcome.status === "unchanged") result.unchanged++;
            else if (outcome.status === "deleted") result.deleted++;
            else result.skipped++;
            if (outcome.truncated) result.truncated++;
          } catch (err) {
            result.failed++;
            result.errors.push(
              `${notionPage.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
            ctx.log.warn("manual sync: page ingest failed", {
              pageId: notionPage.id,
              error: String(err),
            });
          }
        }

        cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
      } while (cursor);
    } catch (err) {
      result.failed++;
      result.errors.push(
        `${mapping.databaseId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      ctx.log.warn("manual sync: database query failed", {
        databaseId: mapping.databaseId,
        error: String(err),
      });
    }
  }

  await reconcileDeletions(ctx, client, config.mappings, seenPageIds, result);

  return result;
}

/**
 * 照合パス: sync_map にあるが今回の DB クエリで見えなくなったページ（Notion の queryDatabase は
 * アーカイブ/ゴミ箱入りのページを返さない）について、実際に削除・アーカイブされたのか
 * （生存していて単に別 DB へ移動しただけではないか）を 1 件ずつ確認し、削除済みなら
 * emdash 側もゴミ箱へ移す。
 */
async function reconcileDeletions(
  ctx: PluginContext,
  client: NotionClient,
  mappings: { collection: string }[],
  seenPageIds: Set<string>,
  result: BulkSyncResult,
): Promise<void> {
  const configuredCollections = new Set(mappings.map((m) => m.collection));

  for await (const record of iterateMappings(ctx)) {
    const data = record.data;
    if (data.pending || data.deletedAt) continue;
    if (!data.collection || !configuredCollections.has(data.collection)) continue;
    if (seenPageIds.has(record.id)) continue;

    try {
      const page = await client.retrievePage(record.id);
      if (!page.archived && !page.in_trash) continue; // 生存中（別 DB へ移動等）。何もしない。
      const outcome = await deleteSyncedPage(ctx, record.id, [data.collection]);
      if (outcome.status === "deleted") result.deleted++;
    } catch (err) {
      if (err instanceof NotionApiError && err.status === 404) {
        const outcome = await deleteSyncedPage(ctx, record.id, [data.collection]);
        if (outcome.status === "deleted") result.deleted++;
        continue;
      }
      result.errors.push(`${record.id}: ${err instanceof Error ? err.message : String(err)}`);
      ctx.log.warn("manual sync: reconciliation check failed", {
        pageId: record.id,
        error: String(err),
      });
    }
  }
}
