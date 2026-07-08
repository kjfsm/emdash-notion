import type { PluginContext } from "emdash";

import { isConfigReady, loadConfig } from "../config.js";
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
    errors: [],
  };

  if (!isConfigReady(config)) {
    result.errors.push(m.configMissing);
    return result;
  }
  if (!ctx.http) {
    result.errors.push("network:request capability unavailable");
    return result;
  }

  const client = new NotionClient(ctx.http, config.notionToken);

  for (const mapping of config.mappings) {
    if (!mapping.databaseId || !mapping.collection) continue;
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
  }

  return result;
}
