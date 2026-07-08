import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createPlugin } from "../src/index.js";

/**
 * `src/astro/index.ts` の `blockComponents` は Vitest から直接 import できない
 * （`.astro` を含むため）。代わりにソースを読み、登録済みの `_type` キーを抽出して
 * `portableTextBlocks` 宣言との網羅を検証する。CHANGELOG 0.1.1 の「divider 未登録」回帰を捕捉する。
 */
function registeredBlockComponentKeys(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL("../src/astro/index.ts", import.meta.url)),
    "utf8",
  );
  const body = src.slice(src.indexOf("blockComponents"));
  // `key: Component,` の左辺キー（識別子 or クオート文字列）を拾う。
  const keys = [...body.matchAll(/^\s*["']?([A-Za-z][A-Za-z0-9_]*)["']?\s*:/gm)].map((m) => m[1]!);
  return keys;
}

describe("blockComponents ↔ portableTextBlocks の網羅", () => {
  it("portableTextBlocks で宣言した全 _type に描画コンポーネントが登録されている", () => {
    const declared = createPlugin().admin!.portableTextBlocks!.map((b) => b.type);
    const registered = new Set(registeredBlockComponentKeys());
    for (const type of declared) {
      expect(registered.has(type)).toBe(true);
    }
  });

  it("divider も描画コンポーネントに登録されている（0.1.1 回帰防止）", () => {
    expect(registeredBlockComponentKeys()).toContain("divider");
  });
});
