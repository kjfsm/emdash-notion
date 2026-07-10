import type { NotionClient } from "./client.js";
import { nextCursor } from "./paging.js";
import type { NotionBlock, NotionPage } from "./types.js";

export interface FetchedPage {
  page: NotionPage;
  blocks: NotionBlock[];
  /** リクエスト予算超過でブロックツリーを打ち切ったとき true（本文が末尾で欠落している）。 */
  truncated: boolean;
}

/**
 * 子ブロック取得の総リクエスト数の上限。
 *
 * WHY: sandbox の subrequest 上限（既定 10）を大きく超えないための安全弁。到達したら
 * `onTruncate` で通知し、静かに握り潰さない。trusted モードでは制限は無いが、暴走防止として残す。
 *
 * TODO(2026-07-09, marketplace 配布前に要対応): この定数（40）は Cloudflare Worker Loader の
 * 実際の subrequest 上限（1呼び出しあたり10、`ctx.kv`/`ctx.content`/`ctx.storage` 呼び出しも
 * 同じ予算を消費しうる）の4倍になっており、コメントの意図と数値が矛盾している。単一ページの
 * ingest だけでも `loadConfig`（kv.get 5並列）+ ページ取得 + ブロックツリー取得（最大40）+
 * 画像解決 + content.create/update + storage 書き込みで実上限を超える可能性が高い。
 * マーケットプレイスへ publish する前に、実際の Cloudflare Workers + Worker Loader 環境で
 * 実測のうえこの値を見直すこと（CLAUDE.md「確認済みの技術メモ」参照）。
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
  if (budget.truncated)
    options.onTruncate?.((options.maxRequests ?? DEFAULT_MAX_REQUESTS) - budget.remaining);
  return { page, blocks, truncated: budget.truncated };
}

interface Budget {
  remaining: number;
  truncated: boolean;
}

/** ブロックの子を再帰的にページングして取得する（nhc `sync/fetch-block-tree.ts` の方針を移植）。 */
async function fetchBlockTree(
  client: NotionClient,
  blockId: string,
  budget: Budget,
): Promise<NotionBlock[]> {
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
    cursor = nextCursor(res);
  } while (cursor);

  for (const block of collected) {
    if (block.has_children) {
      block.children = await fetchBlockTree(client, block.id, budget);
    }
  }

  return collected;
}
