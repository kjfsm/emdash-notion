import { describe, expect, it } from "vitest";

import { extractPageId, handleWebhook } from "../src/routes/webhook.js";
import { createTestContext, makeNotionHttp, withRoute } from "./helpers.js";

describe("extractPageId", () => {
  it("entity.type=page から id を取る", () => {
    expect(extractPageId({ entity: { id: "p1", type: "page" } })).toBe("p1");
  });
  it("page.id フォールバック", () => {
    expect(extractPageId({ page: { id: "p2" } })).toBe("p2");
  });
  it("ページ以外は null", () => {
    expect(extractPageId({ entity: { id: "d1", type: "database" } })).toBeNull();
  });
});

describe("handleWebhook", () => {
  it("verification_token ハンドシェイクをエコー返しし、ログにはマスク値のみ出す", async () => {
    const t = createTestContext();
    const token = "vt-1234567890";
    const routeCtx = withRoute(t.ctx, { verification_token: token }, "https://x/webhook");
    const res = (await handleWebhook(...routeCtx)) as { verification_token: string };
    // レスポンスにはフル値を返す（Notion 側の照合に必要）。
    expect(res.verification_token).toBe(token);
    // ログにはフル値を残さない（先頭数文字のみのマスク）。
    expect(t.logs.some((l) => l.message.includes(token))).toBe(false);
    expect(t.logs.some((l) => l.message.includes("vt-123"))).toBe(true);
  });

  it("token 不一致は 401 Response を throw する", async () => {
    const t = createTestContext({ kv: { "settings:webhookToken": "right" } });
    const routeCtx = withRoute(
      t.ctx,
      { entity: { id: "p1", type: "page" } },
      "https://x/webhook?token=wrong",
    );
    await expect(handleWebhook(...routeCtx)).rejects.toBeInstanceOf(Response);
  });

  it("token 一致でページを取り込む", async () => {
    const fetch = makeNotionHttp({
      pages: {
        p1: {
          object: "page",
          id: "p1",
          created_time: "2026-01-01T00:00:00.000Z",
          last_edited_time: "2026-02-01T00:00:00.000Z",
          archived: false,
          parent: { type: "data_source_id", data_source_id: "db1" },
          properties: { Name: { id: "t", type: "title", title: [] } },
        },
      },
      children: { p1: { results: [] } },
    });
    const t = createTestContext({
      kv: {
        "settings:webhookToken": "right",
        "settings:notionToken": "tok",
        "settings:mappings": [{ collection: "posts", databaseId: "db1" }],
      },
      fetch,
    });
    const routeCtx = withRoute(
      t.ctx,
      { entity: { id: "p1", type: "page" } },
      "https://x/webhook?token=right",
    );
    const res = (await handleWebhook(...routeCtx)) as { ok: boolean; status: string };
    expect(res.ok).toBe(true);
    expect(res.status).toBe("created");
    expect(t.created).toHaveLength(1);
  });

  it("ページエンティティが無ければ skip", async () => {
    const t = createTestContext({ kv: { "settings:webhookToken": "right" } });
    const routeCtx = withRoute(
      t.ctx,
      { entity: { id: "d1", type: "database" } },
      "https://x/webhook?token=right",
    );
    const res = (await handleWebhook(...routeCtx)) as { ok: boolean; skipped: string };
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeDefined();
  });
});
