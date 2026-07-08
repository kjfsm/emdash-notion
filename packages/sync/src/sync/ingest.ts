import type { PluginContext } from "emdash";

import { findMappingForParent, isConfigReady, loadConfig } from "../config.js";
import { createOgpFetcher } from "../media/ogp.js";
import { createFileResolver, createImageResolver } from "../media/resolve.js";
import { NotionApiError, NotionClient } from "../notion/client.js";
import { fetchPage } from "../notion/fetch-page.js";
import { mapProperties } from "../notion/properties.js";
import { notionBlocksToPortableText } from "../portable-text/from-notion.js";
import { deleteSyncedPage } from "./delete.js";
import { stableHash } from "./hash.js";
import { deleteMapping, getMapping, putMapping } from "./sync-map.js";

export type IngestStatus = "created" | "updated" | "skipped" | "unchanged" | "deleted";

export interface IngestResult {
  status: IngestStatus;
  reason?: string;
  emdashId?: string;
  unsupported?: string[];
  /** リクエスト予算超過で本文末尾が欠落したまま保存したとき true。 */
  truncated?: boolean;
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
  const fallbackCollections = config.mappings.map((m) => m.collection);

  let page, blocks, truncated;
  try {
    ({ page, blocks, truncated } = await fetchPage(client, pageId, {
      onTruncate: (n) =>
        ctx.log.warn("notion block tree truncated at request budget", { pageId, requests: n }),
    }));
  } catch (err) {
    // 層3（404 フォールバック）: ページが完全削除され取得できない場合、既に同期済みなら
    // emdash 側をゴミ箱へ移す。未同期ページの 404 は単に対象外として skip する。
    if (err instanceof NotionApiError && err.status === 404) {
      return deleteSyncedPage(ctx, pageId, fallbackCollections);
    }
    throw err;
  }

  // 層2（ingest 内防御）: webhook のイベント種別に依存せず、アーカイブ/ゴミ箱入りを検知する
  // （syncAll 経由や、アーカイブ後に届いた別種の webhook からもこの分岐を通す）。
  if (page.archived || page.in_trash) {
    return deleteSyncedPage(ctx, pageId, fallbackCollections);
  }

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
  // truncated をハッシュに含めることで、予算超過で欠落したまま保存された状態を「未確定」として
  // 記録する。あとで全量取得できた（truncated=false の）同期が走れば必ずハッシュが変わり、
  // last_edited_time が同じでも欠落が上書き修復される（unchanged で固定されない）。
  const hash = stableHash({ title, body, author, slug, truncated });
  const existingRaw = await getMapping(ctx, page.id);

  if (existingRaw?.pending) {
    // 別リクエストがこのページを新規作成中（下記の予約参照）。二重作成を避けるため今回は何もしない。
    return {
      status: "skipped",
      reason: "concurrent ingest already in progress for this page",
      unsupported,
    };
  }

  // 復活（undelete）判定: 以前ゴミ箱へ移したページが再び ingest された場合、emdash 側の生存を
  // 確認する。ゴミ箱内（get が null）なら新規作成として扱う。手動復元済み（get が非 null）
  // なら通常の update 扱いにする。
  let existing = existingRaw;
  if (existingRaw?.deletedAt) {
    const alive = await ctx.content!.get!(mapping.collection, existingRaw.emdashId);
    existing = alive ? existingRaw : null;
  }

  if (existing && existing.hash === hash && existing.notionLastEdited === page.last_edited_time) {
    return {
      status: "unchanged",
      emdashId: existing.emdashId,
      unsupported,
      truncated: existing.truncated,
    };
  }

  // 冪等性の予約（新規作成パスのみ）。EmDash の storage には原子的な compare-and-set が無いため
  // 「読んでから書く」を完全には排他できない。そこで実際に emdash へ書き込む（低速な）前に、
  // まず軽量な予約レコードを書き、直後に読み直して自分の予約がまだ有効かを確認する。
  // こうすることで無防備な区間を「content.create() の往復全体」から「予約の書き込みと読み直しの
  // 間」というごく短い区間に縮められる（真の同時書き込みが起きた場合の残存ウィンドウはあるが、
  // 旧方式のように無駄な重複コンテンツを作ってから削除する必要が無くなる）。
  let claimId: string | undefined;
  if (!existing) {
    claimId = crypto.randomUUID();
    await putMapping(ctx, page.id, {
      emdashId: "",
      updatedAt: new Date().toISOString(),
      hash,
      notionLastEdited: page.last_edited_time,
      truncated,
      pending: true,
      claimId,
      collection: mapping.collection,
    });
    const afterClaim = await getMapping(ctx, page.id);
    if (afterClaim?.claimId !== claimId) {
      // 予約直後の読み直しで別リクエストの予約に置き換わっていた＝先を越された。
      // まだ content.create() を呼んでいないため、無駄な重複コンテンツは一切発生しない。
      return {
        status: "skipped",
        reason: "concurrent ingest already in progress for this page",
        unsupported,
      };
    }
  }

  let result: { id: string };
  try {
    const write = existing
      ? (d: Record<string, unknown>) =>
          ctx.content!.update!(mapping.collection, existing.emdashId, d)
      : (d: Record<string, unknown>) => ctx.content!.create!(mapping.collection, d);
    result = await writeContent(write, data, optionalFields, ctx, pageId);
  } catch (err) {
    if (!existing) {
      // 予約だけ残して失敗すると、このページが「予約中」のまま永久に取り込めなくなる
      // （以後の呼び出しが毎回 pending 判定でスキップされ続ける）。失敗時は予約を解除し、
      // 次回の呼び出しで最初からやり直せるようにする。
      await deleteMapping(ctx, page.id).catch(() => undefined);
    }
    throw err;
  }

  const status: IngestStatus = existing ? "updated" : "created";
  const emdashId = result.id;

  await putMapping(ctx, page.id, {
    emdashId,
    updatedAt: new Date().toISOString(),
    hash,
    notionLastEdited: page.last_edited_time,
    truncated,
    collection: mapping.collection,
  });

  ctx.log.info("notion page synced", {
    pageId: page.id,
    emdashId,
    status,
    published,
    collection: mapping.collection,
    truncated,
  });
  return { status, emdashId, unsupported, truncated };
}

// TODO: emdash がプラグインからコレクションスキーマを取得する API を公開したら、
// このエラー文言依存の検知を「事前にフィールド存在を確認してから書く」方式へ差し替える。
// 現状は emdash/D1 のエラーメッセージ文字列に依存しており脆い（CLAUDE.md 確認済みの技術メモ参照）。
// 代表的な 2 系統（SQLite/D1: "no such column: X" / "table ... has no column named X"）を許容する。
// キャプチャは `.` を含む修飾名（例 "t.slug"）も拾えるようにし、呼び出し側で修飾子を落として
// 末尾のカラム名でも突き合わせる（`\w+` だけだと "t.slug" が "t" までしか取れず不一致になるため）。
const MISSING_COLUMN_RE = /no (?:such )?column(?: named)?[:\s]+["'`]?([\w.]+)["'`]?/i;

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
      const captured = message.match(MISSING_COLUMN_RE)?.[1];
      // 修飾名（"t.slug"）はそのままでは remaining のキー（"slug"）と一致しないため、
      // 修飾子を落とした末尾のカラム名でも突き合わせる。
      const missingField = [captured, captured?.split(".").pop()].find(
        (f): f is string => !!f && f in remaining,
      );
      if (missingField) {
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
