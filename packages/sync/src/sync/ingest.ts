import type { PluginContext } from "emdash";

import { findMappingForParent, isConfigReady, loadConfig } from "../config.js";
import { createOgpFetcher } from "../media/ogp.js";
import { createFileResolver, createImageResolver } from "../media/resolve.js";
import { NotionClient } from "../notion/client.js";
import { fetchPage } from "../notion/fetch-page.js";
import { mapProperties } from "../notion/properties.js";
import { notionBlocksToPortableText } from "../portable-text/from-notion.js";
import { stableHash } from "./hash.js";
import { getMapping, putMapping } from "./sync-map.js";

export type IngestStatus = "created" | "updated" | "skipped" | "unchanged";

export interface IngestResult {
  status: IngestStatus;
  reason?: string;
  emdashId?: string;
  unsupported?: string[];
}

/** 1 つの Notion ページを取得・変換し、対応する emdash コレクションへ upsert する。 */
export async function ingestPage(ctx: PluginContext, pageId: string): Promise<IngestResult> {
  const config = await loadConfig(ctx);
  if (!isConfigReady(config)) {
    return { status: "skipped", reason: "plugin not configured (notionToken / mappings)" };
  }
  if (!ctx.http) return { status: "skipped", reason: "network:request capability unavailable" };
  if (!ctx.content?.create || !ctx.content.update) {
    return { status: "skipped", reason: "content:write capability unavailable" };
  }

  const client = new NotionClient(ctx.http, config.notionToken);
  const { page, blocks } = await fetchPage(client, pageId, {
    onTruncate: (n) =>
      ctx.log.warn("notion block tree truncated at request budget", { pageId, requests: n }),
  });

  const mapping = findMappingForParent(config.mappings, page.parent);
  if (!mapping) {
    return { status: "skipped", reason: "page's database is not mapped to any emdash collection" };
  }

  const { title, published, author, slug } = mapProperties(page, {
    authorProperty: mapping.authorProperty,
    slugProperty: mapping.slugProperty,
  });
  const { blocks: body, unsupported } = await notionBlocksToPortableText(blocks, {
    resolveImage: createImageResolver(ctx),
    resolveFile: createFileResolver(ctx),
    fetchOgp: createOgpFetcher(ctx),
  });
  if (unsupported.length > 0) {
    ctx.log.info("unsupported notion block types skipped", { pageId, types: unsupported });
  }

  const data: Record<string, unknown> = {
    [mapping.titleField]: title,
    [mapping.bodyField]: body,
  };
  // WHY: authorField/slugField はユーザーが手入力するフィールド名で、実際にはコレクション側に
  // 存在しないこともある。emdash にはスキーマを事前確認する手段が無いため、「存在しない列」
  // エラーを検知して該当フィールドだけ外して再試行する（writeContent 参照）。
  const optionalFields: Record<string, unknown> = {};
  if (mapping.authorField && author) optionalFields[mapping.authorField] = author;
  if (mapping.slugField && slug) optionalFields[mapping.slugField] = slug;

  // WHY: emdash 側 last_edited_time とハッシュを比較し、無変更 Webhook の再書き込みと
  // （将来の逆方向同期での）ループを避ける。
  const hash = stableHash({ title, body, author, slug });
  const existing = await getMapping(ctx, page.id);

  if (existing && existing.hash === hash && existing.notionLastEdited === page.last_edited_time) {
    return { status: "unchanged", emdashId: existing.emdashId, unsupported };
  }

  const write = existing
    ? (d: Record<string, unknown>) => ctx.content!.update!(mapping.collection, existing.emdashId, d)
    : (d: Record<string, unknown>) => ctx.content!.create!(mapping.collection, d);
  const result = await writeContent(write, data, optionalFields, ctx, pageId);

  const status: IngestStatus = existing ? "updated" : "created";
  const emdashId = result.id;

  await putMapping(ctx, page.id, {
    emdashId,
    updatedAt: new Date().toISOString(),
    hash,
    notionLastEdited: page.last_edited_time,
  });

  ctx.log.info("notion page synced", {
    pageId: page.id,
    emdashId,
    status,
    published,
    collection: mapping.collection,
  });
  return { status, emdashId, unsupported };
}

const MISSING_COLUMN_RE = /no column named[:\s]+["'`]?(\w+)["'`]?/i;

/**
 * `ctx.content.create/update` を実行する。emdash にはプラグインからコレクションのスキーマを
 * 事前確認する手段が無いため、authorField/slugField（任意フィールド）が原因で
 * 「存在しない列」エラーになった場合は、そのフィールドだけ外して再試行する。
 * titleField/bodyField は必須フィールドのため対象外（それ以外の理由での失敗はそのまま投げる）。
 */
async function writeContent(
  write: (data: Record<string, unknown>) => Promise<{ id: string }>,
  baseData: Record<string, unknown>,
  optionalFields: Record<string, unknown>,
  ctx: PluginContext,
  pageId: string,
): Promise<{ id: string }> {
  const remaining = { ...optionalFields };
  for (;;) {
    try {
      return await write({ ...baseData, ...remaining });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const missingField = message.match(MISSING_COLUMN_RE)?.[1];
      if (missingField && missingField in remaining) {
        ctx.log.warn("notion sync: dropping field not present in collection schema", {
          pageId,
          field: missingField,
        });
        delete remaining[missingField];
        continue;
      }
      throw err;
    }
  }
}
