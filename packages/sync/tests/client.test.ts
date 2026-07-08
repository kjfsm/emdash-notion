import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotionApiError, NotionClient } from "../src/notion/client.js";

/** fetch 呼び出しの記録付きスタブ。応答は呼び出し順に消費する。 */
function stubFetch(responses: Array<() => Response | Promise<never>>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`unexpected fetch call #${calls.length}: ${url}`);
    return next();
  });
  return { fetch, calls };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("NotionClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功レスポンスの JSON を返し、認証・バージョンヘッダを付与する", async () => {
    const { fetch, calls } = stubFetch([() => jsonResponse({ object: "page", id: "p1" })]);
    const client = new NotionClient({ fetch }, "secret-token");

    const result = await client.retrievePage("p1");

    expect(result).toEqual({ object: "page", id: "p1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.notion.com/v1/pages/p1");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers["Notion-Version"]).toBe("2022-06-28");
  });

  it("429 で Retry-After（秒）を尊重して待ってからリトライする", async () => {
    const { fetch, calls } = stubFetch([
      () => jsonResponse({}, 429, { "Retry-After": "2" }),
      () => jsonResponse({ object: "page", id: "p1" }),
    ]);
    const client = new NotionClient({ fetch }, "t");

    const promise = client.retrievePage("p1");
    // 1999ms ではまだリトライされない。
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    // 2000ms でリトライされる。
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);

    await expect(promise).resolves.toEqual({ object: "page", id: "p1" });
  });

  it("Retry-After が上限（30秒）にクランプされる", async () => {
    const { fetch, calls } = stubFetch([
      () => jsonResponse({}, 429, { "Retry-After": "999999" }),
      () => jsonResponse({ object: "page", id: "p1" }),
    ]);
    const client = new NotionClient({ fetch }, "t");

    const promise = client.retrievePage("p1");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);

    await expect(promise).resolves.toEqual({ object: "page", id: "p1" });
  });

  it("Retry-After 無しの 429/503 は指数バックオフ（400→800→1600ms）でリトライする", async () => {
    const { fetch, calls } = stubFetch([
      () => jsonResponse({}, 429),
      () => jsonResponse({}, 503),
      () => jsonResponse({}, 503),
      () => jsonResponse({ object: "page", id: "p1" }),
    ]);
    const client = new NotionClient({ fetch }, "t");

    const promise = client.retrievePage("p1");

    await vi.advanceTimersByTimeAsync(399);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(799);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1599);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(4);

    await expect(promise).resolves.toEqual({ object: "page", id: "p1" });
  });

  it("5xx が MAX_RETRIES（3）回のリトライ後も失敗すると NotionApiError で失敗する（fetch 計4回）", async () => {
    const { fetch, calls } = stubFetch([
      () => jsonResponse({ message: "boom" }, 500),
      () => jsonResponse({ message: "boom" }, 500),
      () => jsonResponse({ message: "boom" }, 500),
      () => jsonResponse({ message: "boom" }, 500),
    ]);
    const client = new NotionClient({ fetch }, "t");

    const promise = client.retrievePage("p1");
    await Promise.all([expect(promise).rejects.toThrow(NotionApiError), vi.runAllTimersAsync()]);
    expect(calls).toHaveLength(4);
  });

  it("4xx（429 以外）はリトライせず即時失敗し、status を保持する", async () => {
    const { fetch, calls } = stubFetch([() => jsonResponse({ message: "nope" }, 404)]);
    const client = new NotionClient({ fetch }, "t");

    let error: unknown;
    try {
      await client.retrievePage("missing");
    } catch (err) {
      error = err;
    }

    expect(calls).toHaveLength(1);
    expect(error).toBeInstanceOf(NotionApiError);
    expect((error as NotionApiError).status).toBe(404);
  });

  it("ネットワーク例外（fetch の throw）も指数バックオフでリトライし、成功すれば結果を返す", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      calls.push(url);
      if (calls.length < 2) throw new TypeError("network down");
      return jsonResponse({ object: "page", id: "p1" });
    });
    const client = new NotionClient({ fetch }, "t");

    const promise = client.retrievePage("p1");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ object: "page", id: "p1" });
    expect(calls).toHaveLength(2);
  });

  it("ネットワーク例外が MAX_RETRIES 回を超えて続くと、元の例外を rethrow する", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const client = new NotionClient({ fetch }, "t");

    const promise = client.retrievePage("p1");
    await Promise.all([expect(promise).rejects.toThrow("network down"), vi.runAllTimersAsync()]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
