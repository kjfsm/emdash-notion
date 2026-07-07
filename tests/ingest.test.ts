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
    const body = t.created[0]!.data.body as Array<{
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
      kv,
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
});
