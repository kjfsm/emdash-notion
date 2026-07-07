import { definePlugin } from "emdash";
import type { PluginDescriptor } from "emdash";

import { handleAdmin } from "./routes/admin.js";
import { handleListFields } from "./routes/emdash-options.js";
import { handleListDatabases, handleListProperties } from "./routes/notion-options.js";
import { handleWebhook } from "./routes/webhook.js";

export interface NdashOptions {
  /** 既定書き込み先コレクション（未設定なら管理 UI の設定値を使う）。 */
  collection?: string;
}

/**
 * プラグイン記述子。`astro.config.mjs` の `plugins: []`（in-process、native 専用）で読み込む。
 * ネイティブ形式のため descriptor とランタイム（`createPlugin`）は同一ファイルに同居できる
 * （sandboxed と異なり実行環境が分かれないため）。
 */
export function ndashPlugin(options: NdashOptions = {}): PluginDescriptor<NdashOptions> {
  return {
    id: "ndash",
    version: "0.1.0",
    format: "native",
    entrypoint: "ndash",
    options,
  };
}

/**
 * ランタイム本体。Notion Webhook を受け取り、ページを Portable Text に変換して
 * emdash のコンテンツへ保存する（Notion → emdash 一方向。逆方向は未実装）。
 *
 * 設定（Notion トークン・Webhook 検証トークン・対象コレクション等）は管理画面の
 * Block Kit 設定ページ（`routes/admin.ts`）から入力し、`ctx.kv` の `settings:` 名前空間へ
 * 保存される（`src/config.ts` が同じキー名で読み出す）。
 */
export function createPlugin(_options: NdashOptions = {}) {
  return definePlugin({
    id: "ndash",
    version: "0.1.0",

    capabilities: ["content:read", "content:write", "media:read", "media:write", "network:request"],
    allowedHosts: ["api.notion.com", "*.notion.so", "*.amazonaws.com", "*.notion-static.com"],

    storage: {
      // Notion pageId ↔ emdash contentId のマッピングと同期ハッシュ。
      syncMap: { indexes: ["emdashId", "updatedAt"] },
    },

    // WHY: emdash@0.27.0 は admin.settingsSchema だけでは設定 UI を自動生成しない
    // （マニフェストに載るだけで実行時に消費されない）。サイドバー/歯車アイコンは
    // admin.pages の有無で決まるため、Block Kit ページを自前で登録する（routes/admin.ts）。
    admin: {
      pages: [{ path: "/", label: "ndash", icon: "settings" }],
    },

    routes: {
      webhook: {
        public: true,
        handler: handleWebhook,
      },
      admin: {
        handler: handleAdmin,
      },
      "list-databases": {
        handler: handleListDatabases,
      },
      "list-properties": {
        handler: handleListProperties,
      },
      "list-fields": {
        handler: handleListFields,
      },
    },
  });
}

export default createPlugin;
