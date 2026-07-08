import { describe, expect, it } from "vitest";

import { ingestPage } from "../src/sync/ingest.js";
import { createTestContext, makeNotionHttp } from "./helpers.js";

function notionPage(id: string, lastEdited: string) {
  return {
    object: "page",
    id,
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: lastEdited,
    archived: false,
    parent: { type: "data_source_id", data_source_id: "db1" },
    properties: {
      Name: {
        id: "title",
        type: "title",
        title: [
          {
            type: "text",
            plain_text: "My Page",
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
  };
}

function paragraph(id: string, text: string) {
  return {
    object: "block",
    id,
    type: "paragraph",
    has_children: false,
    paragraph: {
      rich_text: [
        {
          type: "text",
          plain_text: text,
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

  it("Notion ページを取得して content.create し、syncMap に記録する", async () => {
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
    // syncMap に notionId で記録されている。
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

  it("並行作成の照合: create 中に別リクエストが確定したら二重作成を消して勝者を採用する", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("page1", "2026-02-01T00:00:00.000Z") },
      children: { page1: { results: [paragraph("b1", "hi")] } },
    });
    const t = createTestContext({
      kv,
      fetch,
      // create の最中に「並行リクエストが先に確定した」状況を注入する。
      onCreate: (_collection, _data) => {
        t.syncStore.set("page1", {
          emdashId: "winner",
          updatedAt: "2026-02-01T00:00:00.000Z",
          hash: "other",
          notionLastEdited: "2026-02-01T00:00:00.000Z",
        });
        return { id: "loser" };
      },
    });

    const res = await ingestPage(t.ctx, "page1");
    expect(res.status).toBe("unchanged");
    expect(res.emdashId).toBe("winner");
    // 自分が作った重複（loser）は削除される。
    expect(t.deleted).toEqual([{ collection: "posts", id: "loser" }]);
    // マッピングは勝者のまま上書きされない。
    expect((t.syncStore.get("page1") as { emdashId: string }).emdashId).toBe("winner");
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
