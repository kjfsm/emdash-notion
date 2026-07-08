import { describe, expect, it } from "vitest";

import {
  generateWebhookToken,
  timingSafeEqual,
  verifyWebhookToken,
} from "../src/notion/signature.js";

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

describe("generateWebhookToken", () => {
  it("64文字の16進文字列を返す", () => {
    const token = generateWebhookToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
  it("呼ぶたびに異なる値を返す", () => {
    expect(generateWebhookToken()).not.toBe(generateWebhookToken());
  });
});
