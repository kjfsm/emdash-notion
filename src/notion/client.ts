import type { HttpAccess } from "emdash";
import type { NotionBlock, NotionListResponse, NotionPage } from "./types.js";

const NOTION_API_BASE = "https://api.notion.com/v1";
/** Notion-Version ヘッダ。data source 系 API を含むバージョンに固定する。 */
const NOTION_VERSION = "2022-06-28";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 400;

export class NotionApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "NotionApiError";
	}
}

/**
 * Notion REST の薄いクライアント。ネットワークは sandbox 制約に従い `ctx.http.fetch` 経由でのみ行う。
 * 429/5xx は指数バックオフでリトライする（nhc `sync/retry.ts` の方針を移植）。
 */
export class NotionClient {
	constructor(
		private readonly http: HttpAccess,
		private readonly token: string,
	) {}

	async retrievePage(pageId: string): Promise<NotionPage> {
		return this.request<NotionPage>(`/pages/${pageId}`);
	}

	async listBlockChildren(
		blockId: string,
		startCursor?: string,
	): Promise<NotionListResponse<NotionBlock>> {
		const query = startCursor ? `?start_cursor=${encodeURIComponent(startCursor)}&page_size=100` : "?page_size=100";
		return this.request<NotionListResponse<NotionBlock>>(`/blocks/${blockId}/children${query}`);
	}

	private async request<T>(path: string): Promise<T> {
		let lastError: unknown;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			let res: Response;
			try {
				res = await this.http.fetch(`${NOTION_API_BASE}${path}`, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.token}`,
						"Notion-Version": NOTION_VERSION,
					},
				});
			} catch (err) {
				lastError = err;
				if (attempt < MAX_RETRIES) {
					await sleep(RETRY_BASE_MS * 2 ** attempt);
					continue;
				}
				throw err;
			}

			if (res.ok) return (await res.json()) as T;

			// 429 / 5xx はリトライ、それ以外は即時失敗。
			if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
				const retryAfter = Number(res.headers.get("Retry-After"));
				const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * 2 ** attempt;
				await sleep(waitMs);
				continue;
			}

			const body = await res.text().catch(() => "");
			throw new NotionApiError(`Notion API ${res.status} for ${path}: ${body.slice(0, 200)}`, res.status);
		}
		throw lastError instanceof Error ? lastError : new NotionApiError("Notion API request failed", 0);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
