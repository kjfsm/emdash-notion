import { describe, expect, it } from "vitest";

import { stableHash } from "../src/sync/hash.js";

describe("stableHash", () => {
  it("同じ値なら決定的に同じハッシュを返す", () => {
    expect(stableHash({ a: 1, b: "x" })).toBe(stableHash({ a: 1, b: "x" }));
  });

  it("オブジェクトのキー順序に依存しない", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it("配列の順序には敏感（内容が同じでも並びが違えば別ハッシュ）", () => {
    expect(stableHash([1, 2, 3])).not.toBe(stableHash([3, 2, 1]));
  });

  it("値が異なればハッシュも変わる", () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("null / undefined / ネストが混在しても安定する", () => {
    const value = { a: null, b: undefined, c: { d: [1, null, "x"] } };
    expect(stableHash(value)).toBe(stableHash({ c: { d: [1, null, "x"] }, b: undefined, a: null }));
  });

  it("プリミティブ値も扱える", () => {
    expect(stableHash("hello")).toBe(stableHash("hello"));
    expect(stableHash(42)).not.toBe(stableHash(43));
    expect(stableHash(true)).not.toBe(stableHash(false));
  });
});
