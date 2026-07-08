import type { PluginContext } from "emdash";

/** Map で裏打ちした最小 StorageCollection。テストで必要なメソッドのみ実装する。 */
export function mapStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    collection: {
      get: async (id: string) => (store.has(id) ? store.get(id) : null),
      put: async (id: string, data: unknown) => void store.set(id, data),
      delete: async (id: string) => store.delete(id),
      exists: async (id: string) => store.has(id),
      getMany: async (ids: string[]) =>
        new Map(ids.filter((i) => store.has(i)).map((i) => [i, store.get(i)])),
      putMany: async (items: Array<{ id: string; data: unknown }>) => {
        for (const { id, data } of items) store.set(id, data);
      },
      deleteMany: async (ids: string[]) => ids.filter((i) => store.delete(i)).length,
      query: async () => ({
        items: [...store.entries()].map(([id, data]) => ({ id, data })),
        hasMore: false,
      }),
      count: async () => store.size,
    },
  };
}

export interface TestContextOptions {
  kv?: Record<string, unknown>;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  onCreate?: (collection: string, data: Record<string, unknown>) => { id: string };
  onUpdate?: (collection: string, id: string, data: Record<string, unknown>) => { id: string };
  onUpload?: (
    filename: string,
    contentType: string,
    bytes: ArrayBuffer,
  ) => { mediaId: string; url: string };
}

export interface TestContext {
  ctx: PluginContext;
  kv: Map<string, unknown>;
  syncStore: Map<string, unknown>;
  created: Array<{ collection: string; data: Record<string, unknown> }>;
  updated: Array<{ collection: string; id: string; data: Record<string, unknown> }>;
  logs: Array<{ level: string; message: string }>;
}

/** テスト用の PluginContext を組み立てる。 */
export function createTestContext(options: TestContextOptions = {}): TestContext {
  const kv = new Map<string, unknown>(Object.entries(options.kv ?? {}));
  const sync = mapStorage();
  const created: TestContext["created"] = [];
  const updated: TestContext["updated"] = [];
  const logs: TestContext["logs"] = [];
  let idSeq = 0;

  const log = (level: string) => (message: string) => void logs.push({ level, message });

  const ctx = {
    plugin: { id: "notion-sync", version: "0.1.0" },
    site: { name: "Test", url: "https://example.com", locale: "en" },
    url: (p: string) => `https://example.com${p}`,
    storage: { syncMap: sync.collection },
    kv: {
      get: async <T>(key: string) => (kv.has(key) ? (kv.get(key) as T) : null),
      set: async (key: string, value: unknown) => void kv.set(key, value),
      delete: async (key: string) => kv.delete(key),
      list: async (prefix?: string) =>
        [...kv.entries()]
          .filter(([k]) => !prefix || k.startsWith(prefix))
          .map(([key, value]) => ({ key, value })),
    },
    log: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
    http: options.fetch ? { fetch: options.fetch } : undefined,
    content: {
      get: async () => null,
      list: async () => ({ items: [], hasMore: false }),
      create: async (collection: string, data: Record<string, unknown>) => {
        const item = options.onCreate?.(collection, data) ?? { id: `content_${++idSeq}` };
        created.push({ collection, data });
        return {
          id: item.id,
          type: collection,
          slug: null,
          status: "draft",
          data,
          locale: "en",
          createdAt: "",
          updatedAt: "",
          publishedAt: null,
        };
      },
      update: async (collection: string, id: string, data: Record<string, unknown>) => {
        options.onUpdate?.(collection, id, data);
        updated.push({ collection, id, data });
        return {
          id,
          type: collection,
          slug: null,
          status: "draft",
          data,
          locale: "en",
          createdAt: "",
          updatedAt: "",
          publishedAt: null,
        };
      },
      delete: async () => true,
    },
    media: {
      get: async () => null,
      list: async () => ({ items: [], hasMore: false }),
      upload: async (filename: string, contentType: string, bytes: ArrayBuffer) => {
        const r = options.onUpload?.(filename, contentType, bytes) ?? {
          mediaId: `media_${++idSeq}`,
          url: `https://cdn.example.com/${filename}`,
        };
        return { mediaId: r.mediaId, storageKey: r.mediaId, url: r.url };
      },
      delete: async () => true,
    },
  } as unknown as PluginContext;

  return { ctx, kv, syncStore: sync.store, created, updated, logs };
}

/** Notion REST を模した http.fetch を作る。 */
export function makeNotionHttp(fixtures: {
  pages: Record<string, unknown>;
  children: Record<string, { results: unknown[]; next_cursor?: string | null; has_more?: boolean }>;
  images?: Record<string, { contentType: string; bytes: ArrayBuffer }>;
}): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url: string) => {
    const u = new URL(url);
    const path = u.pathname;

    const pageMatch = path.match(/\/v1\/pages\/([^/]+)$/);
    if (pageMatch) {
      const page = fixtures.pages[pageMatch[1]!];
      return jsonResponse(page ?? { error: "not found" }, page ? 200 : 404);
    }

    const childMatch = path.match(/\/v1\/blocks\/([^/]+)\/children$/);
    if (childMatch) {
      const res = fixtures.children[childMatch[1]!] ?? { results: [] };
      return jsonResponse({
        object: "list",
        results: res.results,
        next_cursor: res.next_cursor ?? null,
        has_more: res.has_more ?? false,
      });
    }

    const img = fixtures.images?.[url];
    if (img) {
      return new Response(img.bytes, { status: 200, headers: { "Content-Type": img.contentType } });
    }

    return jsonResponse({ error: "unhandled", url }, 500);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * native のルートハンドラは単一引数 `RouteContext`（`input`/`request` を `PluginContext` に
 * マージした形）を受け取る。テスト用に同じ形を組み立てる。
 */
export function withRoute<T extends object>(ctx: PluginContext, input: unknown, url: string): T {
  return { ...ctx, input, request: { url } } as unknown as T;
}
