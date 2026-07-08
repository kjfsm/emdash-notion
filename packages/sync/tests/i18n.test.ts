import { describe, expect, it } from "vitest";

import {
  defaultLocale,
  getMessages,
  isLocale,
  LOCALE_CONFIG_KEY,
  LOCALES,
  resolveLocale,
} from "../src/i18n/index.js";
import { messages } from "../src/i18n/messages.js";
import type { AdminRouteContext } from "../src/routes/admin.js";
import { handleAdmin } from "../src/routes/admin.js";
import { createTestContext, withRoute } from "./helpers.js";

function pageLoad(ctx: AdminRouteContext) {
  return handleAdmin(ctx);
}

describe("i18n catalog", () => {
  it("全ロケールが同じキー集合を持つ（翻訳漏れ検出）", () => {
    const enKeys = Object.keys(messages.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(enKeys);
    }
  });

  it("全ロケールで各キーの型（string / function）が一致する", () => {
    for (const key of Object.keys(messages.en) as Array<keyof typeof messages.en>) {
      const enType = typeof messages.en[key];
      for (const locale of LOCALES) {
        expect(typeof messages[locale][key]).toBe(enType);
      }
    }
  });

  it("isLocale は既知ロケールのみ真", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("resolveLocale", () => {
  it("未設定なら既定言語（en）", async () => {
    const t = createTestContext({ kv: {} });
    expect(await resolveLocale(t.ctx)).toBe(defaultLocale);
    expect(defaultLocale).toBe("en");
  });

  it("不正値なら既定言語にフォールバック", async () => {
    const t = createTestContext({ kv: { [LOCALE_CONFIG_KEY]: "fr" } });
    expect(await resolveLocale(t.ctx)).toBe("en");
  });

  it("保存済みロケールを返す", async () => {
    const t = createTestContext({ kv: { [LOCALE_CONFIG_KEY]: "ja" } });
    expect(await resolveLocale(t.ctx)).toBe("ja");
  });
});

describe("handleAdmin i18n rendering", () => {
  it("既定では英語で描画する", async () => {
    const t = createTestContext({ kv: {} });
    const res = await pageLoad(
      withRoute<AdminRouteContext>(t.ctx, { type: "page_load", page: "/" }, "https://x/admin"),
    );
    expect(JSON.stringify(res.blocks)).toContain(getMessages("en").pageTitle);
    expect(JSON.stringify(res.blocks)).not.toContain(getMessages("ja").saveConnection);
  });

  it("settings:locale=ja なら日本語で描画する", async () => {
    const t = createTestContext({ kv: { [LOCALE_CONFIG_KEY]: "ja" } });
    const res = await pageLoad(
      withRoute<AdminRouteContext>(t.ctx, { type: "page_load", page: "/" }, "https://x/admin"),
    );
    expect(JSON.stringify(res.blocks)).toContain(getMessages("ja").saveConnection);
  });

  it("save_connection で選択言語を保存し、応答も新言語で描画する", async () => {
    const t = createTestContext({ kv: {} });
    const res = await pageLoad(
      withRoute<AdminRouteContext>(
        t.ctx,
        {
          type: "form_submit",
          action_id: "save_connection",
          values: { locale: "ja", notionToken: "", webhookToken: "" },
        },
        "https://x/admin",
      ),
    );
    expect(t.kv.get(LOCALE_CONFIG_KEY)).toBe("ja");
    expect(res.toast?.message).toBe(getMessages("ja").tokenSaved);
  });
});
