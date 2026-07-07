import { describe, expect, it } from "vitest";

import { timingSafeEqual, verifyWebhookToken } from "../src/notion/signature.js";

describe("timingSafeEqual", () => {
  it("等しい文字列で true", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
  });
  it("異なる文字列で false", () => {
    expect(timingSafeEqual("secret", "secreu")).toBe(false);
  });
  it("長さ違いで false", () => {
    expect(timingSafeEqual("secret", "secret1")).toBe(false);
  });
});

describe("verifyWebhookToken", () => {
  it("クエリの token が一致すれば true", () => {
    expect(verifyWebhookToken("https://x.com/webhook?token=abc123", "abc123")).toBe(true);
  });
  it("token が不一致なら false", () => {
    expect(verifyWebhookToken("https://x.com/webhook?token=wrong", "abc123")).toBe(false);
  });
  it("token クエリが無ければ false", () => {
    expect(verifyWebhookToken("https://x.com/webhook", "abc123")).toBe(false);
  });
  it("期待値が空（未設定）なら常に false（fail-closed）", () => {
    expect(verifyWebhookToken("https://x.com/webhook?token=abc", "")).toBe(false);
  });
});
