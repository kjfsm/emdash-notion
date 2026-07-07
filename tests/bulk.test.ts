import { describe, expect, it } from "vitest";

import { syncAll } from "../src/sync/bulk.js";
import { createTestContext } from "./helpers.js";

function notionPage(id: string, databaseId: string, title: string) {
  return {
    object: "page",
    id,
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: "2026-02-01T00:00:00.000Z",
    archived: false,
    parent: { type: "data_source_id", data_source_id: databaseId },
    properties: {
      Name: {
        id: "title",
        type: "title",
        title: [
          {
            type: "text",
            plain_text: title,
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

/** queryDatabase / retrievePage / blocks を database ごとに切り替えて返す http.fetch を組み立てる。 */
function makeMultiDbHttp(pagesByDb: Record<string, ReturnType<typeof notionPage>[]>) {
  const pageById = new Map<string, ReturnType<typeof notionPage>>();
  for (const pages of Object.values(pagesByDb)) for (const p of pages) pageById.set(p.id, p);

  return async (url: string) => {
    const u = new URL(url);
    const queryMatch = u.pathname.match(/\/v1\/databases\/([^/]+)\/query$/);
    if (queryMatch) {
      const results = pagesByDb[queryMatch[1]!] ?? [];
      return json({ object: "list", results, next_cursor: null, has_more: false });
    }
    const pageMatch = u.pathname.match(/\/v1\/pages\/([^/]+)$/);
    if (pageMatch) {
      const page = pageById.get(pageMatch[1]!);
      return json(page ?? { error: "not found" }, page ? 200 : 404);
    }
    const childMatch = u.pathname.match(/\/v1\/blocks\/([^/]+)\/children$/);
    if (childMatch)
      return json({ object: "list", results: [], next_cursor: null, has_more: false });
    return json({ error: "unhandled" }, 500);
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("syncAll", () => {
  it("複数マッピングそれぞれの DB を問い合わせて対応するコレクションへ取り込む", async () => {
    const fetch = makeMultiDbHttp({
      "db-posts": [notionPage("p1", "db-posts", "Post 1")],
      "db-pages": [notionPage("p2", "db-pages", "Page 1")],
    });
    const t = createTestContext({
      kv: {
        "settings:notionToken": "tok",
        "settings:mappings": [
          { collection: "posts", databaseId: "db-posts" },
          { collection: "pages", databaseId: "db-pages" },
        ],
      },
      fetch,
    });

    const result = await syncAll(t.ctx);

    expect(result.total).toBe(2);
    expect(result.created).toBe(2);
    expect(t.created.map((c) => c.collection).sort()).toEqual(["pages", "posts"]);
  });

  it("マッピングが無ければ何もせずエラーを返す", async () => {
    const t = createTestContext({ kv: {}, fetch: async () => json({}) });
    const result = await syncAll(t.ctx);
    expect(result.total).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
