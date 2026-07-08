import { describe, expect, it } from "vitest";

import { findDuplicateDatabaseIds } from "../src/config.js";

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
