import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdmin } from "./routes/admin.js";
import { handleListFields } from "./routes/emdash-options.js";
import { handleWebhook } from "./routes/webhook.js";

/**
 * ランタイム本体。Notion Webhook を受け取り、ページを Portable Text に変換して
 * emdash のコンテンツへ保存する（Notion → emdash 一方向。逆方向は未実装）。
 *
 * 設定（Notion トークン・Webhook 検証トークン・対象コレクション等）は管理画面の
 * Block Kit 設定ページ（`routes/admin.ts`）から入力し、`ctx.kv` の `settings:` 名前空間へ
 * 保存される（`src/config.ts` が同じキー名で読み出す）。
 *
 * id/version/capabilities/allowedHosts/storage/adminPages は descriptor（`index.ts`）側で
 * 宣言する（standard format のランタイム定義には含めない）。
 */
export default {
  routes: {
    webhook: {
      public: true,
      handler: handleWebhook,
    },
    admin: {
      handler: handleAdmin,
    },
    "list-fields": {
      handler: handleListFields,
    },
  },
} satisfies SandboxedPlugin;
