import { describe, expect, it } from "vitest";

import { mapProperties } from "../src/notion/properties.js";
import type { NotionPage } from "../src/notion/types.js";
import { makeRichText as rt } from "./helpers.js";

function page(properties: NotionPage["properties"]): NotionPage {
  return {
    object: "page",
    id: "p1",
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: "2026-01-02T00:00:00.000Z",
    archived: false,
    parent: { type: "data_source_id", data_source_id: "db1" },
    properties,
  };
}

const opts = { authorProperty: "著者", slugProperty: "slug" };

describe("mapProperties", () => {
  it("title プロパティからタイトルを連結して取り出す", () => {
    const p = page({
      Name: { id: "t", type: "title", title: [rt("Hello "), rt("World")] },
    });
    expect(mapProperties(p, opts).title).toBe("Hello World");
  });

  it("status が公開値なら published=true", () => {
    const p = page({
      Name: { id: "t", type: "title", title: [rt("x")] },
      Status: { id: "s", type: "status", status: { name: "Published" } },
    });
    expect(mapProperties(p, opts).published).toBe(true);
  });

  it("status が非公開値なら published=false", () => {
    const p = page({
      Name: { id: "t", type: "title", title: [rt("x")] },
      Status: { id: "s", type: "status", status: { name: "Draft" } },
    });
    expect(mapProperties(p, opts).published).toBe(false);
  });

  it("title が無ければ空文字", () => {
    expect(mapProperties(page({}), opts).title).toBe("");
  });

  it("設定したプロパティ名で著者・slug を rich_text から取り出す", () => {
    const p = page({
      名前: { id: "t", type: "title", title: [rt("テスト")] },
      slug: { id: "s", type: "rich_text", rich_text: [rt("test")] },
      著者: { id: "a", type: "rich_text", rich_text: [rt("ふすま")] },
    });
    const mapped = mapProperties(p, opts);
    expect(mapped.title).toBe("テスト");
    expect(mapped.slug).toBe("test");
    expect(mapped.author).toBe("ふすま");
  });

  it("該当プロパティが無ければ著者・slug は空文字", () => {
    const p = page({ Name: { id: "t", type: "title", title: [rt("x")] } });
    const mapped = mapProperties(p, opts);
    expect(mapped.author).toBe("");
    expect(mapped.slug).toBe("");
  });
});
