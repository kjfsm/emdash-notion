# emdash-notion

日本語版は [README.ja.md](./README.ja.md) を参照してください。

A **native [EmDash CMS](https://emdashcms.com) plugin** that receives Notion webhooks, converts pages to [Portable Text](https://github.com/portabletext/portabletext), and syncs them into EmDash content (Notion → EmDash, one-way). MVP.

> The admin UI is available in **English (default)** and **Japanese**, switchable from the settings page.

## What it does

- Receives Notion's official webhook at `/_emdash/api/plugins/ndash/webhook` and fetches the target page
- Converts the page body (headings, paragraphs, lists, quotes, code, dividers, images, etc.) to Portable Text
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

## Setup

1. Register it in `astro.config.mjs` (native only — works under `plugins: []`, **not** `sandboxed: []`):

   ```typescript
   import { defineConfig } from "astro/config";
   import emdash from "emdash/astro";
   import { ndashPlugin } from "emdash-notion";

   export default defineConfig({
     integrations: [
       emdash({
         plugins: [ndashPlugin()],
       }),
     ],
   });
   ```

2. Open the plugin's settings page from the EmDash admin (gear icon), and configure in order:
   1. **Language** — pick English or 日本語 (optional; English by default).
   2. **Save tokens** — enter the Notion integration token, then save. Afterwards the dropdowns query Notion with this token.
   3. **Generate EmDash token** — click "Generate EmDash token" to create a random webhook URL token (saved automatically) and show the full webhook URL to register in Notion. You can also enter your own value in the "Webhook URL token" field instead. Note this token is unrelated to the `verification_token` Notion sends once during subscription setup.
   4. **Add mapping** — fill the empty form at the bottom (emdash collection slug, Notion database, author/slug properties) and save. Each saved mapping becomes an independent form you can edit, save, or delete. Title/body/author/slug field slug candidates fill in automatically once the collection has content.
   5. **Manual fetch** — sync now to verify.

3. Create a Notion webhook subscription pointed at the URL shown after generating the token:

   ```
   https://<your-site>/_emdash/api/plugins/ndash/webhook?token=<Webhook URL Token>
   ```

   The subscription handshake (`verification_token`) is echoed back automatically.

## Distribution

This is a **native** EmDash plugin that declares API routes, so it is distributed on **npm** and installed in `astro.config.mjs` (it is not eligible for the EmDash Marketplace, which is for sandboxed plugins).

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build   # emits to dist/ (a native plugin builds as a normal npm package)
```

Use `pnpm link` (or `pnpm link --global`) to reference it from a local EmDash site for verification.

## License

[MIT](./LICENSE)
