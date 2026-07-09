import type { PluginContext } from "emdash";
import type { SandboxedRouteContext } from "emdash/plugin";

import { loadConfig, type OptionItem } from "../config.js";

/**
 * 1 コレクションあたりサンプルする件数。
 * WHY: 1 件だけだと、そのコンテンツで未入力のフィールド（例: featured_image, excerpt）が
 * `data` のキーに出ず候補から漏れる。複数件をマージして拾い漏れを減らす。
 */
const SAMPLE_SIZE = 20;

/**
 * 管理画面の「タイトル/本文/著者/slug フィールド Slug」セレクトの選択肢。
 * emdash はプラグインにコレクションのスキーマを問い合わせる API を提供していないため、
 * 設定済みの対応関係が指す各コレクションから既存コンテンツを複数件取得し、その `data` の
 * キー（＝実際のフィールド Slug）を候補として集約する。
 * WHY: 空のコレクション（コンテンツが 1 件も無い）や、これから追加する新規対応の
 * コレクションは候補に出せない（他の設定済みコレクションの候補が代わりに出る）。
 */
export async function handleListFields(
  _routeCtx: SandboxedRouteContext,
  ctx: PluginContext,
): Promise<{ items: OptionItem[] }> {
  if (!ctx.content?.list) return { items: [] };
  const config = await loadConfig(ctx);

  const collections = new Set(config.mappings.map((m) => m.collection).filter(Boolean));
  const names = new Set<string>();

  for (const collection of collections) {
    try {
      const result = await ctx.content.list(collection, { limit: SAMPLE_SIZE });
      for (const item of result.items) for (const key of Object.keys(item.data)) names.add(key);
    } catch (err) {
      ctx.log.warn("list-fields: failed to inspect collection", { collection, error: String(err) });
    }
  }

  return { items: [...names].sort().map((name) => ({ id: name, name })) };
}
