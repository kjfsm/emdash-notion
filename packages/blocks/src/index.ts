import { definePlugin } from "emdash";
import type { PluginDescriptor } from "emdash";

import { VERSION } from "./version.js";

/**
 * プラグイン記述子。`notion-sync` が生成する notionCallout/notionTodo/notionToggle を
 * Notion 風の見た目で描画する。`componentsEntry` が指す `./astro` から
 * `blockComponents`（`_type` → Astro コンポーネント）が EmDash 本体へ登録される。
 */
export function notionBlocksPlugin(): PluginDescriptor {
  return {
    id: "notion-blocks",
    version: VERSION,
    format: "native",
    entrypoint: "@emdash-notion/blocks",
    componentsEntry: "@emdash-notion/blocks/astro",
    capabilities: [],
  };
}

/**
 * これらのブロックは Notion 同期由来で自動生成されるため、エディタからの手動追加・編集は
 * 想定しない。`portableTextBlocks` はスラッシュメニュー/表示用のラベル・アイコンのみを宣言する。
 */
export function createPlugin() {
  return definePlugin({
    id: "notion-blocks",
    version: VERSION,
    hooks: {},
    admin: {
      portableTextBlocks: [
        { type: "notionCallout", label: "Notion Callout", icon: "info" },
        { type: "notionTodo", label: "Notion To-do", icon: "check-square" },
        { type: "notionToggle", label: "Notion Toggle", icon: "chevron-down" },
        { type: "notionEquation", label: "Notion Equation", icon: "sigma" },
        { type: "notionBookmark", label: "Notion Bookmark", icon: "link" },
      ],
    },
  });
}

export default createPlugin;
