# emdash-notion

日本語版は [README.ja.md](./README.ja.md) を参照してください。

A pnpm monorepo that receives Notion webhooks, converts pages to [Portable Text](https://github.com/portabletext/portabletext), and syncs them into [EmDash CMS](https://emdashcms.com) content (Notion → EmDash, one-way). MVP. Two plugins split sync logic from rendering.

- **[`packages/sync`](./packages/sync)** — npm: [`@emdash-notion/sync`](https://www.npmjs.com/package/@emdash-notion/sync), plugin id: `notion-sync` (**standard** format). Fetches from Notion, converts to Portable Text, and writes to EmDash content.
- **[`packages/blocks`](./packages/blocks)** — npm: [`@emdash-notion/blocks`](https://www.npmjs.com/package/@emdash-notion/blocks), plugin id: `notion-blocks` (**native** format). Renders Notion-specific blocks (callout, to-do, toggle, equation, bookmark, divider) with Notion-like styling via `componentsEntry`. Optional — without it, those blocks still contain their text but render with no special styling.

> The admin UI (`notion-sync`) is available in **English (default)** and **Japanese**, switchable from the settings page.

## What it does

- Receives Notion's official webhook at `/_emdash/api/plugins/notion-sync/webhook` and fetches the target page
- Converts the page body (headings, paragraphs, lists, quotes, code, dividers, images, callouts, to-dos, toggles, etc.) to Portable Text — callout/to-do/toggle are kept as dedicated block types (`notionCallout`/`notionTodo`/`notionToggle`) so `notion-blocks` can render them with their original Notion styling (icon, color, checked state, collapsible content)
- Imports images into EmDash media (Notion's signed image URLs expire after ~1 hour)
- Maps title and body (Portable Text), plus optional properties such as author and slug, to EmDash fields
- Supports multiple emdash-collection ⇔ Notion-database mappings
- A “Manual fetch” button in the admin bulk-syncs every configured mapping at once
- Keeps a Notion pageId ↔ EmDash contentId map in `ctx.storage.syncMap` (to skip no-op webhooks)
- When a synced page is deleted or archived in Notion, the corresponding EmDash content is moved to trash (soft delete). If it's later restored (undeleted) in Notion, the next sync re-creates it as new content. Detected three ways: the `page.deleted`/`page.undeleted` webhook event type, an `archived`/`in_trash` check inside every ingest (also covers pages reached via a manual fetch), and a 404 fallback when the page is fully deleted. A manual fetch also reconciles pages that stopped appearing in Notion's database query (which excludes archived pages) by checking each one individually — pages that are still alive elsewhere are left untouched
- Notion API calls retry 429/5xx responses with exponential backoff (up to 3 retries) and honor `Retry-After` (capped at 30s)

## Known limitations

- **No reverse sync (EmDash → Notion).** Possible via a `content:afterSave` hook, but out of scope for this MVP.
- **Notion's official `X-Notion-Signature` (raw-body HMAC) cannot be verified.** EmDash always parses the request body before handing it to plugin routes (native or sandboxed), so the raw bytes are unavailable. Instead, a shared secret is passed in the subscription URL's `?token=` query and compared in constant time.
- **EmDash's system `slug`/`status` columns cannot be set from a plugin.** `ctx.content.create/update` only accepts `{ type, data }` — system columns are filtered out server-side, so the value written to the “slug field slug” is stored as a regular data field (not the URL-routing slug column), and every synced item is created as `draft` regardless of Notion's publish state. This is an upstream EmDash plugin-API limitation, not a bug in this plugin; EmDash's REST API (Bearer-token authenticated) _can_ set both, so a future version could optionally write through it instead of `ctx.content`.
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

## Notion blocks & styling (`notion-blocks`)

`notion-blocks` ships Astro components for these custom Portable Text block types (produced by `notion-sync`):

| `_type`          | Notion source           | Notes                                                                                      |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `notionCallout`  | callout                 | Keeps icon (emoji/image) and color.                                                        |
| `notionTodo`     | to-do                   | Keeps checked state and nesting level.                                                     |
| `notionToggle`   | toggle                  | Collapsible; nested children kept as Portable Text.                                        |
| `notionEquation` | block equation          | Renders the **raw LaTeX string** as text — no KaTeX/MathJax is bundled.                    |
| `notionBookmark` | bookmark / link preview | Card with OGP metadata **only if** `notion-sync` fetched it (see below); else a bare link. |
| `divider`        | divider                 | Simple `<hr>`.                                                                             |

Other Notion blocks (tables, columns, video/audio/file/pdf, embeds, images) are converted to EmDash's **core** Portable Text block types and rendered by EmDash's default components — `notion-blocks` is not involved.

**Bookmark OGP** is fetched by `notion-sync` at sync time (its `fetchOgp` helper). If the fetch fails or the host is unreachable, the block is stored without `og` metadata and `notion-blocks` renders a plain link. URLs from Notion are scheme-checked before rendering, so `javascript:`-style hrefs/`src`s are dropped.

**Overriding styles** — components read CSS custom properties, so you can theme them from your site's global CSS without ejecting:

| Property                      | Component | Purpose               |
| ----------------------------- | --------- | --------------------- |
| `--notion-callout-accent`     | callout   | Text/foreground color |
| `--notion-callout-bg`         | callout   | Background color      |
| `--notion-todo-checked-color` | to-do     | Checked mark color    |
| `--notion-todo-indent`        | to-do     | Nested indent width   |

Only callout and to-do expose theme variables. `notionBookmark`, `notionEquation`, and `divider` have no CSS custom properties (they don't yet support dark mode) — to adjust their colors/spacing, override the `.notion-bookmark`, `.notion-equation`, or `.notion-divider` classes from your site's global CSS with higher specificity.

## Distribution

`notion-blocks` is a **native** EmDash plugin (it declares a `componentsEntry`), so it isn't eligible for the EmDash Marketplace, which is for sandboxed plugins. `notion-sync` is **standard**, but since it's meant to be paired with `notion-blocks`, both are distributed on **npm** and installed in `astro.config.mjs`.

## Development

This is a pnpm workspace monorepo (`packages/*`).

```sh
pnpm install
pnpm typecheck   # runs across all packages
pnpm test        # runs across all packages
pnpm lint
pnpm build       # emits dist/ per package (both build as normal npm packages)
```

Run a script for a single package with `pnpm --filter @emdash-notion/sync <script>`, or `cd packages/sync && pnpm <script>`.

**Verifying against a local EmDash site:** `pnpm link` is tempting but causes a duplicate `emdash` module instance — the linked package keeps resolving `emdash` from this monorepo's own `node_modules` (a different pnpm store than the site's), even after aligning version numbers, which can break plugin registration. Instead, `pnpm build && pnpm pack` each package (from `packages/sync` and `packages/blocks`) and add the resulting `.tgz` via an `overrides` entry in the site's `pnpm-workspace.yaml` (not the `package.json` `pnpm` field — recent pnpm versions no longer read overrides from there):

```yaml
overrides:
  "@emdash-notion/sync": "file:/absolute/path/to/emdash-notion-sync-X.Y.Z.tgz"
  "@emdash-notion/blocks": "file:/absolute/path/to/emdash-notion-blocks-X.Y.Z.tgz"
```

Then `pnpm install` in the site. This resolves through the site's own single lockfile, so there's exactly one `emdash` instance. Revert the override and reinstall when done.

For exercising the plugin without a browser (its admin routes require a session + CSRF token that's awkward to fake with `curl`), the `emdash` CLI (already a site dependency) is useful: `pnpm exec emdash content create/get/delete/restore <collection> ...` lets you inspect trash/soft-delete behavior directly against the same D1 database the dev server uses.

## Migrating from the single-package `emdash-notion`

Earlier versions of this repo published a single `emdash-notion` package (plugin id `emdash-notion`). That package is deprecated in favor of `@emdash-notion/sync` + `@emdash-notion/blocks`. To migrate:

1. Replace the `emdash-notion` dependency with `@emdash-notion/sync` (and optionally `@emdash-notion/blocks`).
2. Update `astro.config.mjs` to register `notionSyncPlugin()` (and `notionBlocksPlugin()`) instead of `emdashNotionPlugin()`.
3. Update the Notion webhook subscription URL: the path segment changes from `.../plugins/emdash-notion/webhook` to `.../plugins/notion-sync/webhook`.
4. **Plugin storage is namespaced by plugin id**, so the existing Notion pageId ↔ EmDash contentId sync map (`ctx.storage.syncMap`) does not carry over to `notion-sync`. Because `ingest.ts` decides create-vs-update solely from that map, the first manual fetch after migrating will **re-create** every mapped page as new EmDash content rather than updating the existing entries. Delete the old EmDash entries before re-syncing, or map to a fresh collection, to avoid duplicates.

## License

[MIT](./LICENSE)
