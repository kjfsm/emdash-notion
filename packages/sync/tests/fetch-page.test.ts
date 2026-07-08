import { describe, expect, it } from "vitest";

import { NotionClient } from "../src/notion/client.js";
import { fetchPage } from "../src/notion/fetch-page.js";
import { makeNotionHttp } from "./helpers.js";

function page(id: string) {
  return {
    object: "page" as const,
    id,
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: "2026-01-01T00:00:00.000Z",
    archived: false,
    parent: { type: "database_id", database_id: "db1" },
    properties: {},
  };
}

function block(id: string, hasChildren = false) {
  return { object: "block" as const, id, type: "paragraph", has_children: hasChildren };
}

describe("fetchPage", () => {
  it("予算内なら全ページングを消費し尽くして truncated=false を返す", async () => {
    const fetch = makeNotionHttp({
      pages: { p1: page("p1") },
      children: {
        p1: { results: [block("b1")], has_more: false },
      },
    });
    const client = new NotionClient({ fetch }, "t");

    const result = await fetchPage(client, "p1", { maxRequests: 10 });

    expect(result.truncated).toBe(false);
    expect(result.page.id).toBe("p1");
    expect(result.blocks.map((b) => b.id)).toEqual(["b1"]);
  });

  it("ページング途中で予算切れになると truncated=true になり、取得済み分は保持する", async () => {
    // page1 の children は常に has_more: true を返し続けるため、予算(2) を使い切って打ち切られる。
    const fetch = makeNotionHttp({
      pages: { p1: page("p1") },
      children: {
        p1: { results: [block("b1")], has_more: true, next_cursor: "c1" },
      },
    });
    const client = new NotionClient({ fetch }, "t");

    let truncatedAt: number | undefined;
    const result = await fetchPage(client, "p1", {
      maxRequests: 2,
      onTruncate: (n) => {
        truncatedAt = n;
      },
    });

    expect(result.truncated).toBe(true);
    // 2 回とも同じ固定フィクスチャを返すため、取得済み分（重複含む）は保持されている。
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(truncatedAt).toBe(2);
  });

  it("has_children を持つブロックの子取得も予算を消費する", async () => {
    const fetch = makeNotionHttp({
      pages: { p1: page("p1") },
      children: {
        p1: { results: [block("parent", true)], has_more: false },
        parent: { results: [block("child")], has_more: false },
      },
    });
    const client = new NotionClient({ fetch }, "t");

    const result = await fetchPage(client, "p1", { maxRequests: 10 });

    expect(result.truncated).toBe(false);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.children).toEqual([expect.objectContaining({ id: "child" })]);
  });

  it("予算が0でもページ本体は返す（本文は空扱いで打ち切り）", async () => {
    const fetch = makeNotionHttp({
      pages: { p1: page("p1") },
      children: {
        p1: { results: [block("b1")], has_more: false },
      },
    });
    const client = new NotionClient({ fetch }, "t");

    const result = await fetchPage(client, "p1", { maxRequests: 0 });

    expect(result.page.id).toBe("p1");
    expect(result.blocks).toEqual([]);
    expect(result.truncated).toBe(true);
  });
});
