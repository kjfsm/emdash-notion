import { describe, expect, it } from "vitest";

import { createOgpFetcher, extractOgp } from "../src/media/ogp.js";
import { createTestContext } from "./helpers.js";

describe("extractOgp", () => {
  it("og:* meta タグを抽出する", () => {
    const html = `<html><head>
      <meta property="og:title" content="Example Title">
      <meta property="og:description" content="Example description">
      <meta property="og:image" content="https://e.com/og.png">
      <meta property="og:site_name" content="Example Site">
      </head></html>`;
    expect(extractOgp(html)).toEqual({
      title: "Example Title",
      description: "Example description",
      image: "https://e.com/og.png",
      siteName: "Example Site",
    });
  });

  it("content 属性が property より先に来ても抽出できる", () => {
    const html = `<meta content="Reordered" property="og:title">`;
    expect(extractOgp(html).title).toBe("Reordered");
  });

  it('name="og:*" 形式も許容する', () => {
    const html = `<meta name="og:title" content="Named">`;
    expect(extractOgp(html).title).toBe("Named");
  });

  it("HTML エンティティをデコードする", () => {
    const html = `<meta property="og:title" content="Fish &amp; Chips">`;
    expect(extractOgp(html).title).toBe("Fish & Chips");
  });

  it("og:* タグが無ければ全フィールドが undefined", () => {
    const html = `<meta property="twitter:card" content="summary">`;
    expect(extractOgp(html)).toEqual({
      title: undefined,
      description: undefined,
      image: undefined,
      siteName: undefined,
    });
  });
});

describe("createOgpFetcher", () => {
  it("HTML を取得して OGP を返す", async () => {
    const { ctx } = createTestContext({
      fetch: async () =>
        new Response(`<meta property="og:title" content="Fetched">`, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    });
    const fetchOgp = createOgpFetcher(ctx);
    expect(await fetchOgp("https://e.com")).toEqual({
      title: "Fetched",
      description: undefined,
      image: undefined,
      siteName: undefined,
    });
  });

  it("fetch 失敗時は undefined を返す（同期を止めない）", async () => {
    const { ctx } = createTestContext({
      fetch: async () => {
        throw new Error("network error");
      },
    });
    expect(await createOgpFetcher(ctx)("https://e.com")).toBeUndefined();
  });

  it("HTML 以外のレスポンスは undefined を返す", async () => {
    const { ctx } = createTestContext({
      fetch: async () => new Response("{}", { headers: { "Content-Type": "application/json" } }),
    });
    expect(await createOgpFetcher(ctx)("https://e.com")).toBeUndefined();
  });

  it("localhost 等のプライベートホストは fetch せず undefined を返す", async () => {
    let called = false;
    const { ctx } = createTestContext({
      fetch: async () => {
        called = true;
        return new Response("");
      },
    });
    expect(await createOgpFetcher(ctx)("http://localhost:3000")).toBeUndefined();
    expect(called).toBe(false);
  });

  it("ctx.http 未指定なら undefined を返す", async () => {
    const { ctx } = createTestContext();
    expect(await createOgpFetcher(ctx)("https://e.com")).toBeUndefined();
  });
});
