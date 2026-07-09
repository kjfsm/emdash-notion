import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { notionBlocksPlugin } from "@emdash-notion/blocks";
import notionSync from "@emdash-notion/sync";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  image: {
    layout: "constrained",
    responsiveStyles: true,
  },
  integrations: [
    react(),
    emdash({
      database: d1({ binding: "DB", session: "auto" }),
      storage: r2({ binding: "MEDIA" }),
      // notion-sync は sandboxed 形式でビルドされ、default export がプラグイン記述子そのもの
      // （ファクトリ関数ではない）。本来は `sandboxed: []` + `sandboxRunner` の組み合わせで
      // isolate 実行するのが望ましいが、`worker_loaders` は Workers Paid 専用機能のため
      // wrangler.jsonc では未設定（無効化コメントのまま）。よってここでは `plugins: []`
      // に置き、in-process 実行にする（isolation は無くなる。有効化する場合は wrangler.jsonc の
      // `worker_loaders` を有効化し、`sandboxRunner: sandbox()`（`@emdash-cms/cloudflare`）を追加した上で
      // ここを `sandboxed: [notionSync]` に移す）。
      plugins: [notionBlocksPlugin(), notionSync],
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Playfair Display",
      cssVariable: "--font-heading",
      weights: [400, 500, 600, 700],
      fallbacks: ["serif"],
    },
  ],
  devToolbar: { enabled: false },
});
