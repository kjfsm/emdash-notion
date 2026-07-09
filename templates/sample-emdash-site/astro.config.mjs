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
      // WHY: notion-sync は sandboxed format だが、Cloudflare の Worker Loader
      // （sandboxRunner）は Workers Paid プラン専用の機能。Free プランで動かすため、
      // sandboxRunner を設定せず plugins: [] に登録して in-process 実行する
      // （isolation は無くなるが、sandboxed 形式のまま動作する — EmDash の仕様）。
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
