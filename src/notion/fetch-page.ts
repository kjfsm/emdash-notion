import type { NotionClient } from "./client.js";
import type { NotionBlock, NotionPage } from "./types.js";

export interface FetchedPage {
	page: NotionPage;
	blocks: NotionBlock[];
}

/**
 * 子ブロック取得の総リクエスト数の上限。
 *
 * WHY: sandbox の subrequest 上限（既定 10）を大きく超えないための安全弁。到達したら
 * `onTruncate` で通知し、静かに握り潰さない。trusted モードでは制限は無いが、暴走防止として残す。
 */
const DEFAULT_MAX_REQUESTS = 40;

export interface FetchPageOptions {
	maxRequests?: number;
	/** 上限到達でツリーを打ち切ったときに呼ばれる（ログ用）。 */
	onTruncate?: (fetchedRequests: number) => void;
}

/** ページ本体と、子まで再帰取得したブロックツリーを取得する。 */
export async function fetchPage(
	client: NotionClient,
	pageId: string,
	options: FetchPageOptions = {},
): Promise<FetchedPage> {
	const page = await client.retrievePage(pageId);
	const budget = { remaining: options.maxRequests ?? DEFAULT_MAX_REQUESTS, truncated: false };
	const blocks = await fetchBlockTree(client, pageId, budget);
	if (budget.truncated) options.onTruncate?.((options.maxRequests ?? DEFAULT_MAX_REQUESTS) - budget.remaining);
	return { page, blocks };
}

interface Budget {
	remaining: number;
	truncated: boolean;
}

/** ブロックの子を再帰的にページングして取得する（nhc `sync/fetch-block-tree.ts` の方針を移植）。 */
async function fetchBlockTree(client: NotionClient, blockId: string, budget: Budget): Promise<NotionBlock[]> {
	const collected: NotionBlock[] = [];
	let cursor: string | undefined;

	do {
		if (budget.remaining <= 0) {
			budget.truncated = true;
			return collected;
		}
		budget.remaining--;
		const res = await client.listBlockChildren(blockId, cursor);
		collected.push(...res.results);
		cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
	} while (cursor);

	for (const block of collected) {
		if (block.has_children) {
			block.children = await fetchBlockTree(client, block.id, budget);
		}
	}

	return collected;
}
