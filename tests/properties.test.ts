import { describe, expect, it } from "vitest";
import { mapProperties } from "../src/notion/properties.js";
import type { NotionPage, NotionRichText } from "../src/notion/types.js";

function rt(text: string): NotionRichText {
	return {
		type: "text",
		plain_text: text,
		href: null,
		annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" },
	};
}

function page(properties: NotionPage["properties"]): NotionPage {
	return {
		object: "page",
		id: "p1",
		created_time: "2026-01-01T00:00:00.000Z",
		last_edited_time: "2026-01-02T00:00:00.000Z",
		archived: false,
		parent: { type: "data_source_id", data_source_id: "db1" },
		properties,
	};
}

describe("mapProperties", () => {
	it("title プロパティからタイトルを連結して取り出す", () => {
		const p = page({
			Name: { id: "t", type: "title", title: [rt("Hello "), rt("World")] },
		});
		expect(mapProperties(p).title).toBe("Hello World");
	});

	it("status が公開値なら published=true", () => {
		const p = page({
			Name: { id: "t", type: "title", title: [rt("x")] },
			Status: { id: "s", type: "status", status: { name: "Published" } },
		});
		expect(mapProperties(p).published).toBe(true);
	});

	it("status が非公開値なら published=false", () => {
		const p = page({
			Name: { id: "t", type: "title", title: [rt("x")] },
			Status: { id: "s", type: "status", status: { name: "Draft" } },
		});
		expect(mapProperties(p).published).toBe(false);
	});

	it("title が無ければ空文字", () => {
		expect(mapProperties(page({})).title).toBe("");
	});
});
