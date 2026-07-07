import type { PluginContext } from "emdash";

import type { OptionItem } from "../config.js";
import { loadConfig } from "../config.js";
import { NotionClient } from "../notion/client.js";
import type { NotionDatabase } from "../notion/types.js";

export interface NotionStructure {
  databases: OptionItem[];
  properties: OptionItem[];
  /** データベース単位で発生したエラーメッセージ（`{DB名} (id): 理由` 形式）。 */
  errors: string[];
}

function plainTitle(database: NotionDatabase): string {
  const text = database.title.map((t) => t.plain_text).join("");
  return text || database.id;
}

/**
 * 管理画面の「Notionの構造を取得する」ボタンから呼ばれる。
 * integration と共有中の全データベースを列挙し、各データベースのスキーマから
 * 著者/slug プロパティ候補（rich_text/title のみ）を集約する。
 * WHY: 1 データベースの取得失敗が残り全体を巻き込まないよう、データベース単位で
 * try/catch し、失敗は `errors` に積んで画面（banner）に見える形で返す。
 */
export async function fetchNotionStructure(ctx: PluginContext): Promise<NotionStructure> {
  const config = await loadConfig(ctx);
  if (!config.notionToken || !ctx.http) return { databases: [], properties: [], errors: [] };

  const client = new NotionClient(ctx.http, config.notionToken);
  const databases: OptionItem[] = [];
  const propertyNames = new Set<string>();
  const errors: string[] = [];

  let cursor: string | undefined;
  do {
    const page = await client.searchDatabases(cursor);
    for (const db of page.results) {
      const label = `${plainTitle(db)} (${db.id})`;
      databases.push({ id: db.id, name: label });

      try {
        const schema = await client.retrieveDatabase(db.id);
        for (const [name, prop] of Object.entries(schema.properties)) {
          if (prop.type === "rich_text" || prop.type === "title") propertyNames.add(name);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${label}: ${message}`);
        ctx.log.warn("fetch-structure: failed to inspect database", {
          databaseId: db.id,
          error: message,
        });
      }
    }
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return {
    databases,
    properties: [...propertyNames].sort().map((name) => ({ id: name, name })),
    errors,
  };
}
