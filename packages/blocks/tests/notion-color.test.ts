import { describe, expect, it } from "vitest";

import { notionBlockColorVars } from "../src/notion-color.js";

describe("notionBlockColorVars", () => {
  it("未指定・default は既定のグレー系を返す", () => {
    expect(notionBlockColorVars()).toEqual({ accent: "#787774", background: "#f1f1ef" });
    expect(notionBlockColorVars("default")).toEqual({ accent: "#787774", background: "#f1f1ef" });
  });

  it("*_background は背景色 + 対応するアクセント色を返す", () => {
    expect(notionBlockColorVars("blue_background")).toEqual({
      accent: "#337ea9",
      background: "#e7f3f8",
    });
  });

  it("テキスト色名はアクセント色 + 透明背景を返す", () => {
    expect(notionBlockColorVars("red")).toEqual({ accent: "#d44c47", background: "transparent" });
  });

  it("未知の色名は既定アクセントへフォールバックする（CSS インジェクション不可）", () => {
    expect(notionBlockColorVars("rgb(0,0,0);evil")).toEqual({
      accent: "#787774",
      background: "transparent",
    });
    expect(notionBlockColorVars("unknown_background")).toEqual({
      accent: "#787774",
      background: "transparent",
    });
  });
});
