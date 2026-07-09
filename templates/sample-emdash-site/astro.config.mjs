import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { notionBlocksPlugin } from "@emdash-notion/blocks";
import { notionSyncPlugin } from "@emdash-notion/sync";
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
      plugins: [notionBlocksPlugin(), notionSyncPlugin()],
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
