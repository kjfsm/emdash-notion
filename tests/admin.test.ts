import { describe, expect, it } from "vitest";

import type { AdminRouteContext } from "../src/routes/admin.js";
import { handleAdmin } from "../src/routes/admin.js";
import { createTestContext, withRoute } from "./helpers.js";

function mappingValues(overrides: Record<string, unknown> = {}) {
  return {
    collection: "posts",
    databaseId: "db1",
    authorProperty: "著者",
    authorField: "author",
    slugProperty: "slug",
    slugField: "slug",
    titleField: "title",
    bodyField: "body",
    ...overrides,
  };
}

describe("handleAdmin", () => {
  it("save_connection: 空欄でないトークンだけ保存し、空欄は変更しない", async () => {
    const t = createTestContext({ kv: { "settings:webhookToken": "existing" } });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      {
        type: "form_submit",
        action_id: "save_connection",
        values: { notionToken: "secret_new", webhookToken: "" },
      },
      "https://x/admin",
    );
    await handleAdmin(routeCtx);
    expect(t.kv.get("settings:notionToken")).toBe("secret_new");
    expect(t.kv.get("settings:webhookToken")).toBe("existing");
  });

  it("save_mapping_new: 新しい対応を末尾に追加する", async () => {
    const t = createTestContext({ kv: {} });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      { type: "form_submit", action_id: "save_mapping_new", values: mappingValues() },
      "https://x/admin",
    );
    const res = await handleAdmin(routeCtx);
    expect(t.kv.get("settings:mappings")).toEqual([mappingValues()]);
    expect(res.toast?.message).toContain("added");
  });

  it("save_mapping_0: 既存の対応を置き換える", async () => {
    const t = createTestContext({
      kv: { "settings:mappings": [mappingValues({ collection: "old" })] },
    });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      {
        type: "form_submit",
        action_id: "save_mapping_0",
        values: mappingValues({ collection: "new" }),
      },
      "https://x/admin",
    );
    await handleAdmin(routeCtx);
    const saved = t.kv.get("settings:mappings") as Array<{ collection: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.collection).toBe("new");
  });

  it("authorField/slugField を空欄で保存すると同期しない設定として保持される", async () => {
    const t = createTestContext({ kv: {} });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      {
        type: "form_submit",
        action_id: "save_mapping_new",
        values: mappingValues({ authorField: "", slugField: "" }),
      },
      "https://x/admin",
    );
    await handleAdmin(routeCtx);
    const saved = t.kv.get("settings:mappings") as Array<{
      authorField: string;
      slugField: string;
    }>;
    expect(saved[0]!.authorField).toBe("");
    expect(saved[0]!.slugField).toBe("");
  });

  it("delete_mapping_0: 指定インデックスの対応を削除する", async () => {
    const t = createTestContext({
      kv: {
        "settings:mappings": [
          mappingValues({ collection: "keep-me-not" }),
          mappingValues({ collection: "keep" }),
        ],
      },
    });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      { type: "block_action", action_id: "delete_mapping_0" },
      "https://x/admin",
    );
    await handleAdmin(routeCtx);
    const saved = t.kv.get("settings:mappings") as Array<{ collection: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.collection).toBe("keep");
  });

  it("page_load: repeater を含まない form ブロックのみで構成される", async () => {
    const t = createTestContext({ kv: {} });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      { type: "page_load", page: "/" },
      "https://x/admin",
    );
    const res = await handleAdmin(routeCtx);
    const types = JSON.stringify(res.blocks);
    expect(types).not.toContain('"repeater"');
  });

  it("fetch_structure: トークン未保存ならエラー banner を返し kv は変化しない", async () => {
    const t = createTestContext({ kv: {} });
    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      { type: "block_action", action_id: "fetch_structure" },
      "https://x/admin",
    );
    const res = await handleAdmin(routeCtx);
    expect(res.toast?.type).toBe("error");
    expect(JSON.stringify(res.blocks)).toContain('"variant":"error"');
    expect(t.kv.get("settings:notionDatabases")).toBeUndefined();
  });

  it("fetch_structure: 成功時に notionDatabases/notionProperties を保存し、選択肢に反映する", async () => {
    const t = createTestContext({
      kv: { "settings:notionToken": "secret_x" },
      fetch: async (url) => {
        const u = new URL(url);
        if (u.pathname === "/v1/search") {
          return new Response(
            JSON.stringify({
              object: "list",
              results: [{ object: "database", id: "db1", title: [{ plain_text: "DB One" }] }],
              next_cursor: null,
              has_more: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.pathname === "/v1/databases/db1") {
          return new Response(
            JSON.stringify({
              object: "database",
              id: "db1",
              title: [{ plain_text: "DB One" }],
              properties: { Author: { id: "a", type: "rich_text" } },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "unhandled" }), { status: 500 });
      },
    });

    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      { type: "block_action", action_id: "fetch_structure" },
      "https://x/admin",
    );
    const res = await handleAdmin(routeCtx);

    expect(res.toast?.type).toBe("success");
    expect(t.kv.get("settings:notionDatabases")).toEqual([{ id: "db1", name: "DB One (db1)" }]);
    expect(t.kv.get("settings:notionProperties")).toEqual([{ id: "Author", name: "Author" }]);
    const blocksJson = JSON.stringify(res.blocks);
    expect(blocksJson).toContain("DB One (db1)");
    expect(blocksJson).not.toContain('"structureNotFetchedHint"');
  });

  it("fetch_structure: 一部データベースが失敗すると banner にエラーが含まれ、成功分は反映される", async () => {
    const t = createTestContext({
      kv: { "settings:notionToken": "secret_x" },
      fetch: async (url) => {
        const u = new URL(url);
        if (u.pathname === "/v1/search") {
          return new Response(
            JSON.stringify({
              object: "list",
              results: [
                { object: "database", id: "db1", title: [{ plain_text: "Broken DB" }] },
                { object: "database", id: "db2", title: [{ plain_text: "Good DB" }] },
              ],
              next_cursor: null,
              has_more: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.pathname === "/v1/databases/db1") {
          return new Response(JSON.stringify({ message: "forbidden" }), { status: 403 });
        }
        if (u.pathname === "/v1/databases/db2") {
          return new Response(
            JSON.stringify({
              object: "database",
              id: "db2",
              title: [{ plain_text: "Good DB" }],
              properties: { Slug: { id: "s", type: "rich_text" } },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "unhandled" }), { status: 500 });
      },
    });

    const routeCtx = withRoute<AdminRouteContext>(
      t.ctx,
      { type: "block_action", action_id: "fetch_structure" },
      "https://x/admin",
    );
    const res = await handleAdmin(routeCtx);

    expect(res.toast?.type).toBe("error");
    expect(t.kv.get("settings:notionProperties")).toEqual([{ id: "Slug", name: "Slug" }]);
    const blocksJson = JSON.stringify(res.blocks);
    expect(blocksJson).toContain("Broken DB (db1)");
    expect(blocksJson).toContain('"variant":"alert"');
  });
});
