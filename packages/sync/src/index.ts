import type { PluginDescriptor } from "emdash";

/**
 * プラグイン記述子。`astro.config.mjs` の `plugins: []`（in-process、trusted）で読み込む。
 * standard format のため、識別情報（id/version/capabilities/allowedHosts/storage/adminPages）は
 * すべてこの descriptor に集約する。ランタイム本体（routes）は別ファイル（`sandbox-entry.ts`）に
 * 分離し、`entrypoint` が指す `./sandbox` export から読み込まれる
 * （descriptor は Vite ビルド時、ランタイムはリクエスト時に実行されるため実行環境が異なる）。
 */
export function notionSyncPlugin(): PluginDescriptor {
  return {
    id: "notion-sync",
    version: "0.1.0",
    format: "standard",
    entrypoint: "@emdash-notion/sync/sandbox",

    capabilities: ["content:read", "content:write", "media:read", "media:write", "network:request"],
    allowedHosts: ["api.notion.com", "*.notion.so", "*.amazonaws.com", "*.notion-static.com"],

    storage: {
      // Notion pageId ↔ emdash contentId のマッピングと同期ハッシュ。
      syncMap: { indexes: ["emdashId", "updatedAt"] },
    },

    // WHY: emdash@0.27.0 は admin.settingsSchema だけでは設定 UI を自動生成しない
    // （マニフェストに載るだけで実行時に消費されない）。サイドバー/歯車アイコンは
    // adminPages の有無で決まるため、Block Kit ページを自前で登録する（routes/admin.ts）。
    adminPages: [{ path: "/", label: "notion-sync", icon: "settings" }],
  };
}

export default notionSyncPlugin;
