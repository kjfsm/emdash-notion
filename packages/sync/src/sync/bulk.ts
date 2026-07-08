import type { PluginContext } from "emdash";

import { findDuplicateDatabaseIds, isConfigReady, loadConfig } from "../config.js";
import { defaultLocale, getMessages, type Messages } from "../i18n/index.js";
import { NotionClient } from "../notion/client.js";
import { ingestPage } from "./ingest.js";

export interface BulkSyncResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  /** 予算超過で本文末尾が欠落したまま保存されたページ数。 */
  truncated: number;
  errors: string[];
}

/**
 * 手動取得（管理画面の「手動取得」ボタン）。設定済みの全マッピングを対象に、DB ごとに 1 件ずつ `ingestPage` する。
 * @param m バナー表示に使うメッセージ束。未指定なら既定言語（利用者向け文字列のみ localize、ログは英語のまま）。
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

  const duplicateDbIds = findDuplicateDatabaseIds(config.mappings);
  if (duplicateDbIds.length > 0) {
    ctx.log.warn("manual sync: duplicate databaseId across mappings (only the first wins)", {
      databaseIds: duplicateDbIds,
    });
  }

  const client = new NotionClient(ctx.http, config.notionToken);

  for (const mapping of config.mappings) {
    if (!mapping.databaseId || !mapping.collection) continue;

    // WHY: queryDatabase 自体の失敗（1 DB の権限不足・削除済み等）が他の DB の同期を巻き込んで
    // 全体を throw しないよう、DB 単位で try/catch し、失敗はその DB 分だけ errors に積んで継続する。
    try {
      let cursor: string | undefined;
      do {
        const page = await client.queryDatabase(mapping.databaseId, cursor);

        for (const notionPage of page.results) {
          result.total++;
          try {
            const outcome = await ingestPage(ctx, notionPage.id);
            if (outcome.status === "created") result.created++;
            else if (outcome.status === "updated") result.updated++;
            else if (outcome.status === "unchanged") result.unchanged++;
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

  return result;
}
