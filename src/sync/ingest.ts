import type { PluginContext } from "emdash";
import { isConfigReady, loadConfig } from "../config.js";
import { createImageResolver } from "../media/resolve.js";
import { NotionClient } from "../notion/client.js";
import { fetchPage } from "../notion/fetch-page.js";
import { mapProperties } from "../notion/properties.js";
import type { NotionPage } from "../notion/types.js";
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

/** 1 つの Notion ページを取得・変換し、emdash コンテンツへ upsert する。 */
export async function ingestPage(ctx: PluginContext, pageId: string): Promise<IngestResult> {
	const config = await loadConfig(ctx);
	if (!isConfigReady(config)) {
		return { status: "skipped", reason: "plugin not configured (notionToken / collection)" };
	}
	if (!ctx.http) return { status: "skipped", reason: "network:request capability unavailable" };
	if (!ctx.content?.create || !ctx.content.update) {
		return { status: "skipped", reason: "content:write capability unavailable" };
	}

	const client = new NotionClient(ctx.http, config.notionToken);
	const { page, blocks } = await fetchPage(client, pageId, {
		onTruncate: (n) => ctx.log.warn("notion block tree truncated at request budget", { pageId, requests: n }),
	});

	if (config.databaseId && !parentMatches(page, config.databaseId)) {
		return { status: "skipped", reason: "page is not in the configured database" };
	}

	const { title, published } = mapProperties(page);
	const { blocks: body, unsupported } = await notionBlocksToPortableText(blocks, {
		resolveImage: createImageResolver(ctx),
	});
	if (unsupported.length > 0) {
		ctx.log.info("unsupported notion block types skipped", { pageId, types: unsupported });
	}

	const data: Record<string, unknown> = {
		[config.titleField]: title,
		[config.bodyField]: body,
	};
	// WHY: emdash 側 last_edited_time とハッシュを比較し、無変更 Webhook の再書き込みと
	// （将来の逆方向同期での）ループを避ける。
	const hash = stableHash({ title, body });
	const existing = await getMapping(ctx, page.id);

	if (existing && existing.hash === hash && existing.notionLastEdited === page.last_edited_time) {
		return { status: "unchanged", emdashId: existing.emdashId, unsupported };
	}

	let status: IngestStatus;
	let emdashId: string;
	if (existing) {
		const updated = await ctx.content.update(config.collection, existing.emdashId, data);
		emdashId = updated.id;
		status = "updated";
	} else {
		const created = await ctx.content.create(config.collection, data);
		emdashId = created.id;
		status = "created";
	}

	await putMapping(ctx, page.id, {
		emdashId,
		updatedAt: new Date().toISOString(),
		hash,
		notionLastEdited: page.last_edited_time,
	});

	ctx.log.info("notion page synced", { pageId: page.id, emdashId, status, published });
	return { status, emdashId, unsupported };
}

function parentMatches(page: NotionPage, databaseId: string): boolean {
	const target = stripDashes(databaseId);
	const { database_id, data_source_id } = page.parent;
	return (
		(database_id !== undefined && stripDashes(database_id) === target) ||
		(data_source_id !== undefined && stripDashes(data_source_id) === target)
	);
}

function stripDashes(id: string): string {
	return id.replace(/-/g, "").toLowerCase();
}
