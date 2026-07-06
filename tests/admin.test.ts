import { describe, expect, it } from "vitest";
import type { AdminRouteContext } from "../src/routes/admin.js";
import { handleAdmin } from "../src/routes/admin.js";
import { createTestContext, withRoute } from "./helpers.js";

function mappingValues(overrides: Record<string, unknown> = {}) {
	return {
		collection: "posts",
		databaseId: "db1",
		authorProperty: "著者",
		authorField: "author",
		slugProperty: "slug",
		slugField: "slug",
		titleField: "title",
		bodyField: "body",
		...overrides,
	};
}

describe("handleAdmin", () => {
	it("save_connection: 空欄でないトークンだけ保存し、空欄は変更しない", async () => {
		const t = createTestContext({ kv: { "settings:webhookToken": "existing" } });
		const routeCtx = withRoute<AdminRouteContext>(
			t.ctx,
			{ type: "form_submit", action_id: "save_connection", values: { notionToken: "secret_new", webhookToken: "" } },
			"https://x/admin",
		);
		await handleAdmin(routeCtx);
		expect(t.kv.get("settings:notionToken")).toBe("secret_new");
		expect(t.kv.get("settings:webhookToken")).toBe("existing");
	});

	it("save_mapping_new: 新しい対応を末尾に追加する", async () => {
		const t = createTestContext({ kv: {} });
		const routeCtx = withRoute<AdminRouteContext>(
			t.ctx,
			{ type: "form_submit", action_id: "save_mapping_new", values: mappingValues() },
			"https://x/admin",
		);
		const res = await handleAdmin(routeCtx);
		expect(t.kv.get("settings:mappings")).toEqual([mappingValues()]);
		expect(res.toast?.message).toContain("追加");
	});

	it("save_mapping_0: 既存の対応を置き換える", async () => {
		const t = createTestContext({
			kv: { "settings:mappings": [mappingValues({ collection: "old" })] },
		});
		const routeCtx = withRoute<AdminRouteContext>(
			t.ctx,
			{ type: "form_submit", action_id: "save_mapping_0", values: mappingValues({ collection: "new" }) },
			"https://x/admin",
		);
		await handleAdmin(routeCtx);
		const saved = t.kv.get("settings:mappings") as Array<{ collection: string }>;
		expect(saved).toHaveLength(1);
		expect(saved[0]!.collection).toBe("new");
	});

	it("authorField/slugField を空欄で保存すると同期しない設定として保持される", async () => {
		const t = createTestContext({ kv: {} });
		const routeCtx = withRoute<AdminRouteContext>(
			t.ctx,
			{ type: "form_submit", action_id: "save_mapping_new", values: mappingValues({ authorField: "", slugField: "" }) },
			"https://x/admin",
		);
		await handleAdmin(routeCtx);
		const saved = t.kv.get("settings:mappings") as Array<{ authorField: string; slugField: string }>;
		expect(saved[0]!.authorField).toBe("");
		expect(saved[0]!.slugField).toBe("");
	});

	it("delete_mapping_0: 指定インデックスの対応を削除する", async () => {
		const t = createTestContext({
			kv: {
				"settings:mappings": [mappingValues({ collection: "keep-me-not" }), mappingValues({ collection: "keep" })],
			},
		});
		const routeCtx = withRoute<AdminRouteContext>(
			t.ctx,
			{ type: "block_action", action_id: "delete_mapping_0" },
			"https://x/admin",
		);
		await handleAdmin(routeCtx);
		const saved = t.kv.get("settings:mappings") as Array<{ collection: string }>;
		expect(saved).toHaveLength(1);
		expect(saved[0]!.collection).toBe("keep");
	});

	it("page_load: repeater を含まない form ブロックのみで構成される", async () => {
		const t = createTestContext({ kv: {} });
		const routeCtx = withRoute<AdminRouteContext>(t.ctx, { type: "page_load", page: "/" }, "https://x/admin");
		const res = await handleAdmin(routeCtx);
		const types = JSON.stringify(res.blocks);
		expect(types).not.toContain('"repeater"');
	});
});
