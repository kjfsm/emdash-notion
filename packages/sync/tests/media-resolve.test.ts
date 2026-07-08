import { describe, expect, it } from "vitest";

import { createFileResolver } from "../src/media/resolve.js";
import { createTestContext } from "./helpers.js";

describe("createFileResolver", () => {
  it("file を取得して emdash メディアへアップロードする", async () => {
    const { ctx } = createTestContext({
      fetch: async () =>
        new Response(new ArrayBuffer(4), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      onUpload: (filename) => ({ mediaId: "media_1", url: `https://cdn.example.com/${filename}` }),
    });
    const resolveFile = createFileResolver(ctx);
    const result = await resolveFile({
      url: "https://files/doc.pdf",
      filename: "doc.pdf",
      blockId: "b1",
    });
    expect(result).toEqual({ ref: "media_1", url: "https://cdn.example.com/doc.pdf" });
  });

  it("fetch が失敗したら元 URL へフォールバックする", async () => {
    const { ctx } = createTestContext({ fetch: async () => new Response("", { status: 500 }) });
    const resolveFile = createFileResolver(ctx);
    const result = await resolveFile({ url: "https://files/doc.pdf", blockId: "b1" });
    expect(result).toEqual({ ref: "https://files/doc.pdf", url: "https://files/doc.pdf" });
  });

  it("例外が発生しても元 URL へフォールバックする（同期を止めない）", async () => {
    const { ctx } = createTestContext({
      fetch: async () => {
        throw new Error("network error");
      },
    });
    const resolveFile = createFileResolver(ctx);
    const result = await resolveFile({ url: "https://files/doc.pdf", blockId: "b1" });
    expect(result).toEqual({ ref: "https://files/doc.pdf", url: "https://files/doc.pdf" });
  });

  it("ctx.media/ctx.http が無ければ元 URL をそのまま返す", async () => {
    const ctx = { ...createTestContext().ctx, media: undefined, http: undefined };
    const resolveFile = createFileResolver(ctx);
    const result = await resolveFile({ url: "https://files/doc.pdf", blockId: "b1" });
    expect(result).toEqual({ ref: "https://files/doc.pdf", url: "https://files/doc.pdf" });
  });
});
