import { describe, expect, it } from "vitest";

import { ingestPage } from "../src/sync/ingest.js";
import { createTestContext, makeNotionHttp, makeRichText } from "./helpers.js";

function notionPage(id: string, lastEdited: string) {
  return {
    object: "page",
    id,
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: lastEdited,
    archived: false,
    parent: { type: "data_source_id", data_source_id: "db1" },
    properties: {
      Name: { id: "title", type: "title", title: [makeRichText("My Page")] },
    },
  };
}

function paragraph(id: string, text: string) {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: false,
    paragraph: {
      rich_text: [makeRichText(text)],
    },
  };
}

const kv = {
  "settings:notionToken": "secret_token",
  "settings:mappings": [{ collection: "posts", databaseId: "db1" }],
};

describe("ingestPage", () => {
  it("未設定なら skipped", async () => {
    const { ctx } = createTestContext({ kv: {}, fetch: async () => new Response("{}") });
    const res = await ingestPage(ctx, "page1");
    expect(res.status).toBe("skipped");
  });

  it("Notion ページを取得して content.create し、sync_map に記録する", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "Hello body")] } },
    });
    const t = createTestContext({ kv, fetch });
    const res = await ingestPage(t.ctx, "page1");

    expect(res.status).toBe("created");
    expect(t.created).toHaveLength(1);
    expect(t.created[0]!.collection).toBe("posts");
    expect(t.created[0]!.data.title).toBe("My Page");
    const body = t.created[0]!.data.content as Array<{
      _type: string;
      children?: Array<{ text: string }>;
    }>;
    expect(body[0]!._type).toBe("block");
    expect(body[0]!.children?.[0]!.text).toBe("Hello body");
    // sync_map に notionId で記録されている。
    expect(t.syncStore.has("page1")).toBe(true);
  });

  it("同じ内容・同じ last_edited_time の再取り込みは unchanged（再書き込みしない）", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "Hello body")] } },
    });
    const t = createTestContext({ kv, fetch });
    await ingestPage(t.ctx, "page1");
    const second = await ingestPage(t.ctx, "page1");
    expect(second.status).toBe("unchanged");
    expect(t.created).toHaveLength(1);
    expect(t.updated).toHaveLength(0);
  });

  it("既存マッピングがあり内容が変われば content.update", async () => {
    const first = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "v1")] } },
    });
    const t = createTestContext({ kv, fetch: first });
    await ingestPage(t.ctx, "page1");

    // 内容と last_edited_time を変えて再取り込み。
    t.ctx.http!.fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-03-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "v2")] } },
    });
    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("updated");
    expect(t.updated).toHaveLength(1);
    expect(t.updated[0]!.data.title).toBe("My Page");
  });

  it("コレクションに authorField が無い場合、そのフィールドだけ外して再試行する", async () => {
    function notionPageWithAuthor() {
      const p = notionPage("page1", "2026-02-01T00:00:00.000Z");
      p.properties = {
        ...p.properties,
        Author: {
          id: "a",
          type: "rich_text",
          rich_text: [
            {
              type: "text",
              plain_text: "ふすま",
              href: null,
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "default",
              },
            },
          ],
        },
      } as typeof p.properties;
      return p;
    }
    const fetch = makeNotionHttp({
      pages: { page1: notionPageWithAuthor() },
      children: { page1: { results: [] } },
    });
    let attempts = 0;
    const t = createTestContext({
      kv: {
        "settings:notionToken": "secret_token",
        "settings:mappings": [{ collection: "posts", databaseId: "db1", authorField: "author" }],
      },
      fetch,
      onCreate: (_collection, data) => {
        attempts++;
        if (attempts === 1 && "author" in data) {
          throw new Error("D1_ERROR: table ec_posts has no column named author: SQLITE_ERROR");
        }
        return { id: "content_1" };
      },
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("created");
    expect(attempts).toBe(2);
    expect(t.created).toHaveLength(1);
    expect(t.created[0]!.data.author).toBeUndefined();
    expect(t.created[0]!.data.title).toBe("My Page");
  });

  it('SQLite の "no such column: X" 文言でも欠損フィールドを外して再試行する', async () => {
    const fetch = makeNotionHttp({
      pages: {
        page1: {
          ...notionPage("page1", "2026-02-01T00:00:00.000Z"),
          properties: {
            Name: notionPage("page1", "x").properties.Name,
            slug: {
              id: "s",
              type: "rich_text",
              rich_text: [
                {
                  type: "text",
                  plain_text: "my-slug",
                  href: null,
                  annotations: {
                    bold: false,
                    italic: false,
                    strikethrough: false,
                    underline: false,
                    code: false,
                    color: "default",
                  },
                },
              ],
            },
          },
        },
      },
      children: { page1: { results: [] } },
    });
    let attempts = 0;
    const t = createTestContext({
      kv: {
        "settings:notionToken": "secret_token",
        "settings:mappings": [
          { collection: "posts", databaseId: "db1", slugProperty: "slug", slugField: "slug" },
        ],
      },
      fetch,
      onCreate: (_collection, data) => {
        attempts++;
        if (attempts === 1 && "slug" in data) {
          throw new Error("SqliteError: no such column: slug");
        }
        return { id: "content_1" };
      },
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("created");
    expect(attempts).toBe(2);
    expect(t.created[0]!.data.slug).toBeUndefined();
  });

  it('テーブル修飾されたカラム名（"no such column: t.slug"）でも欠損フィールドを特定して外せる', async () => {
    function notionPageWithSlug() {
      const p = notionPage("page1", "2026-02-01T00:00:00.000Z");
      p.properties = {
        ...p.properties,
        slug: {
          id: "s",
          type: "rich_text",
          rich_text: [
            {
              type: "text",
              plain_text: "my-slug",
              href: null,
              annotations: {
                bold: false,
                italic: false,
                strikethrough: false,
                underline: false,
                code: false,
                color: "default",
              },
            },
          ],
        },
      } as typeof p.properties;
      return p;
    }
    const fetch = makeNotionHttp({
      pages: { page1: notionPageWithSlug() },
      children: { page1: { results: [] } },
    });
    let attempts = 0;
    const t = createTestContext({
      kv: {
        "settings:notionToken": "secret_token",
        "settings:mappings": [
          { collection: "posts", databaseId: "db1", slugProperty: "slug", slugField: "slug" },
        ],
      },
      fetch,
      onCreate: (_collection, data) => {
        attempts++;
        if (attempts === 1 && "slug" in data) {
          throw new Error("SqliteError: no such column: t.slug");
        }
        return { id: "content_1" };
      },
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("created");
    expect(attempts).toBe(2);
    expect(t.created[0]!.data.slug).toBeUndefined();
  });

  it("マッピングされていない DB のページは skipped", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [] } },
    });
    const t = createTestContext({
      kv: {
        "settings:notionToken": "secret_token",
        "settings:mappings": [{ collection: "posts", databaseId: "other-db" }],
      },
      fetch,
    });
    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("skipped");
  });

  it("予約直後の読み直しで別リクエストの予約に置き換わっていたら、作成せず中断する（真の同時書き込みを想定）", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "hi")] } },
    });
    const t = createTestContext({ kv, fetch });

    // getMapping の 2 回目の呼び出し（＝自分の予約書き込み直後の読み直し）で、
    // 別リクエストが先に予約を上書きした状況を注入する。content.create() より前なので、
    // 旧方式（create 後に照合）と違い、無駄な重複コンテンツは一切作られないはず。
    const originalGet = t.ctx.storage.sync_map.get.bind(t.ctx.storage.sync_map);
    let getCalls = 0;
    t.ctx.storage.sync_map.get = (async (id: string) => {
      getCalls++;
      if (getCalls === 2) {
        await t.ctx.storage.sync_map.put(id, {
          emdashId: "",
          updatedAt: "2026-02-01T00:00:00.000Z",
          hash: "other",
          notionLastEdited: "2026-02-01T00:00:00.000Z",
          pending: true,
          claimId: "other-actor-claim",
        });
      }
      return originalGet(id);
    }) as typeof t.ctx.storage.sync_map.get;

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("skipped");
    // content.create は一度も呼ばれていない（旧方式は create→削除だったが、新方式は create 前に中断する）。
    expect(t.created).toHaveLength(0);
  });

  it("既存の pending レコード（他リクエストが取り込み中）があれば、即座に中断する", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [] } },
    });
    const t = createTestContext({ kv, fetch });
    t.syncStore.set("page1", {
      emdashId: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
      hash: "whatever",
      notionLastEdited: "2026-01-01T00:00:00.000Z",
      pending: true,
      claimId: "someone-else",
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("skipped");
    expect(t.created).toHaveLength(0);
  });

  it("新規作成が失敗したら予約を解除し、次回の呼び出しでやり直せる", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "hi")] } },
    });
    let attempts = 0;
    const t = createTestContext({
      kv,
      fetch,
      onCreate: () => {
        attempts++;
        if (attempts === 1) throw new Error("boom: unrelated failure");
        return { id: "content_ok" };
      },
    });

    await expect(ingestPage(t.ctx, "page1")).rejects.toThrow("boom");
    // 予約だけが残って永久に取り込めなくなることを防ぐため、失敗時はレコードごと消える。
    expect(t.syncStore.has("page1")).toBe(false);

    const retry = await ingestPage(t.ctx, "page1");
    expect(retry.status).toBe("created");
    expect(t.created).toHaveLength(1);
  });

  it("unchanged 判定でも保存済みの truncated 状態を返す", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [], has_more: true, next_cursor: "c" } },
    });
    const t = createTestContext({ kv, fetch });
    const first = await ingestPage(t.ctx, "page1");
    expect(first.truncated).toBe(true);

    const second = await ingestPage(t.ctx, "page1");
    expect(second.status).toBe("unchanged");
    // truncated はハッシュに含まれ状態が変わっていないため unchanged になるが、
    // 「まだ本文が欠けている」ことは呼び出し元（bulk 集計・管理画面）に伝わり続ける必要がある。
    expect(second.truncated).toBe(true);
  });

  it("予算超過でブロックツリーが打ち切られたら truncated=true を返し、ハッシュに反映する", async () => {
    // children が常に has_more を返すためリクエスト予算（既定 40）を使い切って打ち切られる。
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [], has_more: true, next_cursor: "c" } },
    });
    const t = createTestContext({ kv, fetch });
    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("created");
    expect(res.truncated).toBe(true);
    // truncated 状態がハッシュに含まれるので、あとで全量取得できれば必ず更新が走る。
    const stored = t.syncStore.get("page1") as { hash: string };
    const full = createTestContext({
      kv,
      fetch: makeNotionHttp({
        pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
        children: { page1: { results: [paragraph("b1", "full body")] } },
      }),
    });
    full.syncStore.set("page1", stored);
    const second = await ingestPage(full.ctx, "page1");
    expect(second.status).toBe("updated");
    expect(second.truncated).toBe(false);
  });
});

describe("ingestPage の削除・アーカイブ検知", () => {
  it("archived:true のページは content.delete してゴミ箱へ移し、sync_map に deletedAt/collection を残す", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "Hello body")] } },
    });
    const t = createTestContext({ kv, fetch });
    await ingestPage(t.ctx, "page1");
    expect(t.deleted).toHaveLength(0);

    const archivedFetch = makeNotionHttp({
      pages: { page1: { ...notionPage("page1", "2026-02-02T00:00:00.000Z"), archived: true } },
      children: {},
    });
    const t2 = createTestContext({ kv, fetch: archivedFetch });
    t2.syncStore.set("page1", t.syncStore.get("page1"));

    const res = await ingestPage(t2.ctx, "page1");
    expect(res.status).toBe("deleted");
    expect(t2.deleted).toEqual([{ collection: "posts", id: res.emdashId }]);
    const stored = t2.syncStore.get("page1") as { deletedAt?: string; collection?: string };
    expect(stored.deletedAt).toBeTruthy();
    expect(stored.collection).toBe("posts");
  });

  it("in_trash:true のページも削除フローに入る", async () => {
    const fetch = makeNotionHttp({
      pages: {
        page1: { ...notionPage("page1", "2026-02-01T00:00:00.000Z"), in_trash: true },
      },
      children: {},
    });
    const t = createTestContext({ kv, fetch });
    t.syncStore.set("page1", {
      emdashId: "content_1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      hash: "abc",
      notionLastEdited: "2026-01-01T00:00:00.000Z",
      collection: "posts",
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("deleted");
    expect(t.deleted).toEqual([{ collection: "posts", id: "content_1" }]);
  });

  it("404（ページ完全削除）で既存マッピングがあれば削除フローに入る", async () => {
    const fetch = makeNotionHttp({ pages: {}, children: {} });
    const t = createTestContext({ kv, fetch });
    t.syncStore.set("page1", {
      emdashId: "content_1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      hash: "abc",
      notionLastEdited: "2026-01-01T00:00:00.000Z",
      collection: "posts",
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("deleted");
    expect(t.deleted).toEqual([{ collection: "posts", id: "content_1" }]);
  });

  it("404 で未同期ページなら skipped", async () => {
    const fetch = makeNotionHttp({ pages: {}, children: {} });
    const t = createTestContext({ kv, fetch });

    const res = await ingestPage(t.ctx, "unknown-page");
    expect(res.status).toBe("skipped");
    expect(t.deleted).toHaveLength(0);
  });

  it("deletedAt 済みで emdash 側が生存していなければ新規作成（復活）し、deletedAt をクリアする", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-03-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "revived body")] } },
    });
    const t = createTestContext({ kv, fetch, onGet: () => null });
    t.syncStore.set("page1", {
      emdashId: "content_old",
      updatedAt: "2026-01-01T00:00:00.000Z",
      hash: "stale-hash",
      notionLastEdited: "2026-01-01T00:00:00.000Z",
      collection: "posts",
      deletedAt: "2026-02-01T00:00:00.000Z",
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("created");
    expect(t.created).toHaveLength(1);
    const stored = t.syncStore.get("page1") as { deletedAt?: string; emdashId: string };
    expect(stored.deletedAt).toBeUndefined();
    expect(stored.emdashId).toBe(res.emdashId);
  });

  it("deletedAt 済みで emdash 側が生存していれば通常の update 扱いにする", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-03-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "restored body")] } },
    });
    const t = createTestContext({
      kv,
      fetch,
      onGet: (collection, id) =>
        collection === "posts" && id === "content_restored" ? { title: "old" } : null,
    });
    t.syncStore.set("page1", {
      emdashId: "content_restored",
      updatedAt: "2026-01-01T00:00:00.000Z",
      hash: "stale-hash",
      notionLastEdited: "2026-01-01T00:00:00.000Z",
      collection: "posts",
      deletedAt: "2026-02-01T00:00:00.000Z",
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("updated");
    expect(res.emdashId).toBe("content_restored");
    expect(t.updated).toHaveLength(1);
  });

  it("二重削除は unchanged（冪等）", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: { ...notionPage("page1", "2026-02-01T00:00:00.000Z"), archived: true } },
      children: {},
    });
    const t = createTestContext({ kv, fetch });
    t.syncStore.set("page1", {
      emdashId: "content_1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      hash: "abc",
      notionLastEdited: "2026-01-01T00:00:00.000Z",
      collection: "posts",
      deletedAt: "2026-01-15T00:00:00.000Z",
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("unchanged");
    expect(t.deleted).toHaveLength(0);
  });
});
