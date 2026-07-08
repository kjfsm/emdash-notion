import { describe, expect, it } from "vitest";

import { fetchNotionStructure } from "../src/routes/notion-options.js";
import { createTestContext } from "./helpers.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchNotionStructure", () => {
  it("トークン未設定なら Notion を呼ばず空を返す", async () => {
    const t = createTestContext({ kv: {} });
    const result = await fetchNotionStructure(t.ctx);
    expect(result).toEqual({ databases: [], properties: [], errors: [] });
  });

  it("複数データベースのプロパティを重複排除・ソートして返す", async () => {
    const t = createTestContext({
      kv: { "settings:notionToken": "secret_x" },
      fetch: async (url) => {
        const u = new URL(url);
        if (u.pathname === "/v1/search") {
          return jsonResponse({
            object: "list",
            results: [
              { object: "database", id: "db1", title: [{ plain_text: "DB One" }] },
              { object: "database", id: "db2", title: [{ plain_text: "DB Two" }] },
            ],
            next_cursor: null,
            has_more: false,
          });
        }
        if (u.pathname === "/v1/databases/db1") {
          return jsonResponse({
            object: "database",
            id: "db1",
            title: [{ plain_text: "DB One" }],
            properties: {
              Name: { id: "title", type: "title" },
              Author: { id: "a", type: "rich_text" },
            },
          });
        }
        if (u.pathname === "/v1/databases/db2") {
          return jsonResponse({
            object: "database",
            id: "db2",
            title: [{ plain_text: "DB Two" }],
            properties: {
              Slug: { id: "s", type: "rich_text" },
              Author: { id: "a2", type: "rich_text" },
            },
          });
        }
        return jsonResponse({ error: "unhandled", url }, 500);
      },
    });

    const result = await fetchNotionStructure(t.ctx);
    expect(result.databases).toEqual([
      { id: "db1", name: "DB One (db1)" },
      { id: "db2", name: "DB Two (db2)" },
    ]);
    expect(result.properties).toEqual([
      { id: "Author", name: "Author" },
      { id: "Name", name: "Name" },
      { id: "Slug", name: "Slug" },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("1 データベースの取得が失敗しても他のデータベースの結果は残り、errors に記録される", async () => {
    const t = createTestContext({
      kv: { "settings:notionToken": "secret_x" },
      fetch: async (url) => {
        const u = new URL(url);
        if (u.pathname === "/v1/search") {
          return jsonResponse({
            object: "list",
            results: [
              { object: "database", id: "db1", title: [{ plain_text: "Broken DB" }] },
              { object: "database", id: "db2", title: [{ plain_text: "Good DB" }] },
            ],
            next_cursor: null,
            has_more: false,
          });
        }
        if (u.pathname === "/v1/databases/db1") {
          return jsonResponse({ object: "error", message: "forbidden" }, 403);
        }
        if (u.pathname === "/v1/databases/db2") {
          return jsonResponse({
            object: "database",
            id: "db2",
            title: [{ plain_text: "Good DB" }],
            properties: { Slug: { id: "s", type: "rich_text" } },
          });
        }
        return jsonResponse({ error: "unhandled", url }, 500);
      },
    });

    const result = await fetchNotionStructure(t.ctx);
    expect(result.databases).toEqual([
      { id: "db1", name: "Broken DB (db1)" },
      { id: "db2", name: "Good DB (db2)" },
    ]);
    expect(result.properties).toEqual([{ id: "Slug", name: "Slug" }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Broken DB (db1)");
  });
});
