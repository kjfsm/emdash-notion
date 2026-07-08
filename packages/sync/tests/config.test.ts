import { describe, expect, it } from "vitest";

import { findDuplicateDatabaseIds, loadConfig } from "../src/config.js";
import { createTestContext } from "./helpers.js";

function mapping(collection: string, databaseId: string) {
  return {
    collection,
    databaseId,
    titleField: "title",
    bodyField: "content",
    authorProperty: "Author",
    authorField: "",
    slugProperty: "slug",
    slugField: "",
  };
}

describe("findDuplicateDatabaseIds", () => {
  it("重複が無ければ空配列", () => {
    expect(findDuplicateDatabaseIds([mapping("posts", "db1"), mapping("pages", "db2")])).toEqual(
      [],
    );
  });

  it("同じ databaseId を複数コレクションへ割り当てたら検出する（正規化して比較）", () => {
    const dups = findDuplicateDatabaseIds([
      mapping("posts", "abcd-1234"),
      mapping("news", "ABCD1234"),
    ]);
    expect(dups).toEqual(["abcd1234"]);
  });

  it("databaseId 未設定のマッピングは無視する", () => {
    expect(findDuplicateDatabaseIds([mapping("posts", ""), mapping("pages", "")])).toEqual([]);
  });
});

describe("loadConfig の重複 databaseId 警告", () => {
  it("webhook 経由（ingestPage）・手動同期（syncAll）のどちらも通る loadConfig 単体で警告する", async () => {
    const t = createTestContext({
      kv: {
        "settings:mappings": [mapping("posts", "db1"), mapping("news", "db1")],
      },
    });
    await loadConfig(t.ctx);
    expect(
      t.logs.some(
        (l) => l.level === "warn" && l.message.includes("duplicate databaseId across mappings"),
      ),
    ).toBe(true);
  });

  it("重複が無ければ警告しない", async () => {
    const t = createTestContext({
      kv: {
        "settings:mappings": [mapping("posts", "db1"), mapping("news", "db2")],
      },
    });
    await loadConfig(t.ctx);
    expect(t.logs.some((l) => l.level === "warn")).toBe(false);
  });
});
