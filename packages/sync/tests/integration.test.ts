import { describe, expect, it } from "vitest";

import { handleWebhook } from "../src/routes/webhook.js";
import { createTestContext, makeNotionHttp, withRoute } from "./helpers.js";

function richText(text: string) {
  return [
    {
      type: "text" as const,
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
  ];
}

function notionPage(lastEdited: string) {
  return {
    object: "page",
    id: "page1",
    created_time: "2026-01-01T00:00:00.000Z",
    last_edited_time: lastEdited,
    archived: false,
    parent: { type: "data_source_id", data_source_id: "db1" },
    properties: {
      Name: { id: "title", type: "title", title: richText("Integration Post") },
    },
  };
}

/** heading・image(file, 要アップロード)・callout・未対応ブロックを含む一気通貫のページ。 */
function pageBlocks(bodyText: string) {
  return [
    {
      object: "block",
      id: "b1",
      type: "heading_1",
      has_children: false,
      heading_1: { rich_text: richText("見出し") },
    },
    {
      object: "block",
      id: "b2",
      type: "paragraph",
      has_children: false,
      paragraph: { rich_text: richText(bodyText) },
    },
    {
      object: "block",
      id: "b3",
      type: "image",
      has_children: false,
      image: { type: "file", file: { url: "https://notion.example/img.png" }, caption: [] },
    },
    {
      object: "block",
      id: "b4",
      type: "callout",
      has_children: false,
      callout: { rich_text: richText("注意"), icon: { type: "emoji", emoji: "⚠️" } },
    },
    { object: "block", id: "b5", type: "unsupported_block_type", has_children: false },
  ];
}

describe("webhook → ingest → portable text 変換 → storage 保存の一気通貫フロー", () => {
  it("新規ページを webhook 経由で取り込み、画像アップロード・未対応ブロック検知を含めて保存する", async () => {
    const fetch = makeNotionHttp({
      pages: { page1: notionPage("2026-02-01T00:00:00.000Z") },
      children: { page1: { results: pageBlocks("本文v1") } },
      images: {
        "https://notion.example/img.png": {
          contentType: "image/png",
          bytes: new TextEncoder().encode("fake-png-bytes").buffer,
        },
      },
    });
    const t = createTestContext({
      kv: {
        "settings:webhookToken": "right",
        "settings:notionToken": "tok",
        "settings:mappings": [{ collection: "posts", databaseId: "db1" }],
      },
      fetch,
    });

    const routeCtx = withRoute(
      t.ctx,
      { entity: { id: "page1", type: "page" } },
      "https://x/webhook?token=right",
    );
    const res = (await handleWebhook(...routeCtx)) as {
      ok: boolean;
      status: string;
      unsupported: string[];
    };

    expect(res.ok).toBe(true);
    expect(res.status).toBe("created");
    expect(res.unsupported).toContain("unsupported_block_type");

    expect(t.created).toHaveLength(1);
    const saved = t.created[0]!;
    expect(saved.collection).toBe("posts");
    expect(saved.data.title).toBe("Integration Post");

    const body = saved.data.content as Array<Record<string, unknown>>;
    expect(body.some((b) => b._type === "block" && b.style === "h1")).toBe(true);
    expect(body.some((b) => b._type === "notionCallout")).toBe(true);
    const image = body.find((b) => b._type === "image") as { asset: { _ref: string } } | undefined;
    // file 型画像は resolveImage 経由で emdash メディアにアップロードされ、参照が mediaId に置き換わる。
    expect(image?.asset._ref).toMatch(/^media_/);
  });

  it("同じページを内容変更つきで再送すると、既存コンテンツを update する", async () => {
    const fetchV1 = makeNotionHttp({
      pages: { page1: notionPage("2026-02-01T00:00:00.000Z") },
      children: { page1: { results: pageBlocks("本文v1") } },
    });
    const t = createTestContext({
      kv: {
        "settings:webhookToken": "right",
        "settings:notionToken": "tok",
        "settings:mappings": [{ collection: "posts", databaseId: "db1" }],
      },
      fetch: fetchV1,
    });
    const routeCtx = withRoute(
      t.ctx,
      { entity: { id: "page1", type: "page" } },
      "https://x/webhook?token=right",
    );
    await handleWebhook(...routeCtx);

    t.ctx.http!.fetch = makeNotionHttp({
      pages: { page1: notionPage("2026-03-01T00:00:00.000Z") },
      children: { page1: { results: pageBlocks("本文v2") } },
    });
    const res = (await handleWebhook(...routeCtx)) as { ok: boolean; status: string };

    expect(res.status).toBe("updated");
    expect(t.updated).toHaveLength(1);
    const body = t.updated[0]!.data.content as Array<{
      _type: string;
      children?: Array<{ text: string }>;
    }>;
    expect(body.some((b) => b.children?.some((c) => c.text === "本文v2"))).toBe(true);
  });
});
