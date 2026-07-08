import { describe, expect, it } from "vitest";

import { safeHref, safeImageSrc } from "../src/safe-url.js";

describe("safeHref", () => {
  it("http(s)/mailto は通す", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("相対・プロトコル相対・アンカーは通す", () => {
    expect(safeHref("/path")).toBe("/path");
    expect(safeHref("./rel")).toBe("./rel");
    expect(safeHref("//cdn.example.com/x")).toBe("//cdn.example.com/x");
    expect(safeHref("#anchor")).toBe("#anchor");
  });

  it("javascript: 等の危険スキームは undefined（リンク抑止）", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("  JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>")).toBeUndefined();
    expect(safeHref("vbscript:msgbox")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref("")).toBeUndefined();
  });
});

describe("safeImageSrc", () => {
  it("http(s)・相対・プロトコル相対のみ通す", () => {
    expect(safeImageSrc("https://cdn.example.com/i.png")).toBe("https://cdn.example.com/i.png");
    expect(safeImageSrc("//cdn.example.com/i.png")).toBe("//cdn.example.com/i.png");
    expect(safeImageSrc("/local.png")).toBe("/local.png");
  });

  it("mailto/javascript/data は画像に不適で undefined", () => {
    expect(safeImageSrc("mailto:a@example.com")).toBeUndefined();
    expect(safeImageSrc("javascript:alert(1)")).toBeUndefined();
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBeUndefined();
  });
});
