import type { PluginContext } from "emdash";
import { loadConfig } from "../config.js";
import { NotionClient } from "../notion/client.js";
import type { NotionDatabase } from "../notion/types.js";

export interface OptionsRouteContext extends PluginContext {
	input: unknown;
}

interface OptionItem {
	id: string;
	name: string;
}

function plainTitle(database: NotionDatabase): string {
	const text = database.title.map((t) => t.plain_text).join("");
	return text || database.id;
}

/** 管理画面の「Notion データベース」セレクトの選択肢。integration と共有中の全データベースを検索する。 */
export async function handleListDatabases(ctx: OptionsRouteContext): Promise<{ items: OptionItem[] }> {
	const config = await loadConfig(ctx);
	if (!config.notionToken || !ctx.http) return { items: [] };

	const client = new NotionClient(ctx.http, config.notionToken);
	const items: OptionItem[] = [];
	let cursor: string | undefined;

	do {
		const page = await client.searchDatabases(cursor);
		for (const db of page.results) items.push({ id: db.id, name: plainTitle(db) });
		cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor);

	return { items };
}

/**
 * 管理画面の「著者プロパティ」「slug プロパティ」セレクトの選択肢。
 * integration と共有中の全データベースのプロパティ名（title / rich_text）を集約して重複排除する。
 * WHY: Block Kit の select は選択中の行（database）に応じた絞り込みができないため、
 * 全データベース分の候補をまとめて出す（Notion 側で命名を揃えていれば実用上問題ない）。
 */
export async function handleListProperties(ctx: OptionsRouteContext): Promise<{ items: OptionItem[] }> {
	const config = await loadConfig(ctx);
	if (!config.notionToken || !ctx.http) return { items: [] };

	const client = new NotionClient(ctx.http, config.notionToken);
	const names = new Set<string>();
	let cursor: string | undefined;

	do {
		const page = await client.searchDatabases(cursor);
		for (const db of page.results) {
			const schema = await client.retrieveDatabase(db.id);
			for (const [name, prop] of Object.entries(schema.properties)) {
				if (prop.type === "rich_text" || prop.type === "title") names.add(name);
			}
		}
		cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
	} while (cursor);

	return { items: [...names].sort().map((name) => ({ id: name, name })) };
}
