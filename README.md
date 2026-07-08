# emdash-notion

日本語版は [README.ja.md](./README.ja.md) を参照してください。

A pnpm monorepo that receives Notion webhooks, converts pages to [Portable Text](https://github.com/portabletext/portabletext), and syncs them into [EmDash CMS](https://emdashcms.com) content (Notion → EmDash, one-way). MVP. Two plugins split sync logic from rendering.

- **[`packages/sync`](./packages/sync)** — npm: [`@emdash-notion/sync`](https://www.npmjs.com/package/@emdash-notion/sync), plugin id: `notion-sync` (**standard** format). Fetches from Notion, converts to Portable Text, and writes to EmDash content.
- **[`packages/blocks`](./packages/blocks)** — npm: [`@emdash-notion/blocks`](https://www.npmjs.com/package/@emdash-notion/blocks), plugin id: `notion-blocks` (**native** format). Renders Notion-specific blocks (callout, to-do, toggle) with Notion-like styling via `componentsEntry`. Optional — without it, those blocks still contain their text but render with no special styling.

> The admin UI (`notion-sync`) is available in **English (default)** and **Japanese**, switchable from the settings page.

## What it does

- Receives Notion's official webhook at `/_emdash/api/plugins/notion-sync/webhook` and fetches the target page
- Converts the page body (headings, paragraphs, lists, quotes, code, dividers, images, callouts, to-dos, toggles, etc.) to Portable Text — callout/to-do/toggle are kept as dedicated block types (`notionCallout`/`notionTodo`/`notionToggle`) so `notion-blocks` can render them with their original Notion styling (icon, color, checked state, collapsible content)
- Imports images into EmDash media (Notion's signed image URLs expire after ~1 hour)
- Maps title and body (Portable Text), plus optional properties such as author and slug, to EmDash fields
- Supports multiple emdash-collection ⇔ Notion-database mappings
- A “Manual fetch” button in the admin bulk-syncs every configured mapping at once
- Keeps a Notion pageId ↔ EmDash contentId map in `ctx.storage.syncMap` (to skip no-op webhooks)

## Known limitations

- **No reverse sync (EmDash → Notion).** Possible via a `content:afterSave` hook, but out of scope for this MVP.
- **Notion's official `X-Notion-Signature` (raw-body HMAC) cannot be verified.** EmDash always parses the request body before handing it to plugin routes (native or sandboxed), so the raw bytes are unavailable. Instead, a shared secret is passed in the subscription URL's `?token=` query and compared in constant time.
- **EmDash's system slug column cannot be set.** `ctx.content.create/update` accepts field data only, so the value written to the “slug field slug” is stored as a regular data field, not the URL-routing slug column.
- The author/slug property dropdowns aggregate property names across **all** databases shared with the integration (not filtered to the selected row's database).
- EmDash exposes no schema-introspection or raw-DB API to plugins (deliberately locked down). So the “emdash collection slug” is free text, and the title/body/author/slug field slugs are picked from a `list-fields` dropdown that reverse-engineers field names from the mapped collection's existing content. If a collection has no content yet, no candidates appear.
- The body field slug defaults to `content` (matching EmDash's standard `pages`/`posts` seed). Author/slug field slugs default to blank (not synced); if set and the target collection lacks that field, only that field is skipped (a missing title/body field still errors).
- **`notion-blocks` is optional but recommended.** Without it, `notionCallout`/`notionTodo`/`notionToggle` blocks are unknown `_type`s to EmDash's default Portable Text renderer and render as nothing (the text content is preserved in storage, just not shown until `notion-blocks` is installed).
- Regular text color/background annotations (Notion's per-span highlight colors) are not yet converted — out of scope for now.

## Setup

1. Register both plugins in `astro.config.mjs` (`notion-blocks` is native format, so it only works under `plugins: []`. `notion-sync` is standard format but is registered in the same `plugins: []` for now):

   ```typescript
   import { defineConfig } from "astro/config";
   import emdash from "emdash/astro";
   import { notionSyncPlugin } from "@emdash-notion/sync";
   import { notionBlocksPlugin } from "@emdash-notion/blocks";

   export default defineConfig({
     integrations: [
       emdash({
         plugins: [notionSyncPlugin(), notionBlocksPlugin()],
       }),
     ],
   });
   ```

   `notionBlocksPlugin()` only needs to be registered — it has no settings page. If you don't need Notion-styled callouts/to-dos/toggles, you can omit it.

2. Open the `notion-sync` plugin's settings page from the EmDash admin (gear icon), and configure in order:
   1. **Language** — pick English or 日本語 (optional; English by default).
   2. **Save tokens** — enter the Notion integration token, then save. Afterwards the dropdowns query Notion with this token.
   3. **Generate EmDash token** — click "Generate EmDash token" to create a random webhook URL token (saved automatically) and show the full webhook URL to register in Notion. You can also enter your own value in the "Webhook URL token" field instead. Note this token is unrelated to the `verification_token` Notion sends once during subscription setup.
   4. **Add mapping** — fill the empty form at the bottom (emdash collection slug, Notion database, author/slug properties) and save. Each saved mapping becomes an independent form you can edit, save, or delete. Title/body/author/slug field slug candidates fill in automatically once the collection has content.
   5. **Manual fetch** — sync now to verify.

3. Create a Notion webhook subscription pointed at the URL shown after generating the token:

   ```
   https://<your-site>/_emdash/api/plugins/notion-sync/webhook?token=<Webhook URL Token>
   ```

   The subscription handshake (`verification_token`) is echoed back automatically.

## Distribution

`notion-blocks` is a **native** EmDash plugin (it declares a `componentsEntry`), so it isn't eligible for the EmDash Marketplace, which is for sandboxed plugins. `notion-sync` is **standard**, but since it's meant to be paired with `notion-blocks`, both are distributed on **npm** and installed in `astro.config.mjs`.

## Development

This is a pnpm workspace monorepo (`packages/*`, `shared/*`).

```sh
pnpm install
pnpm typecheck   # runs across all packages
pnpm test        # runs across all packages
pnpm lint
pnpm build       # emits dist/ per package (both build as normal npm packages)
```

Run a script for a single package with `pnpm --filter @emdash-notion/sync <script>`, or `cd packages/sync && pnpm <script>`.

Use `pnpm link` (or `pnpm link --global`) to reference a package from a local EmDash site for verification.

## Migrating from the single-package `emdash-notion`

Earlier versions of this repo published a single `emdash-notion` package (plugin id `emdash-notion`). That package is deprecated in favor of `@emdash-notion/sync` + `@emdash-notion/blocks`. To migrate:

1. Replace the `emdash-notion` dependency with `@emdash-notion/sync` (and optionally `@emdash-notion/blocks`).
2. Update `astro.config.mjs` to register `notionSyncPlugin()` (and `notionBlocksPlugin()`) instead of `emdashNotionPlugin()`.
3. Update the Notion webhook subscription URL: the path segment changes from `.../plugins/emdash-notion/webhook` to `.../plugins/notion-sync/webhook`.
4. **Plugin storage is namespaced by plugin id**, so the existing Notion pageId ↔ EmDash contentId sync map (`ctx.storage.syncMap`) does not carry over to `notion-sync`. Because `ingest.ts` decides create-vs-update solely from that map, the first manual fetch after migrating will **re-create** every mapped page as new EmDash content rather than updating the existing entries. Delete the old EmDash entries before re-syncing, or map to a fresh collection, to avoid duplicates.

## License

[MIT](./LICENSE)
