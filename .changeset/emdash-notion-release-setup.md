---
"@emdash-notion/sync": minor
---

リリースに向けた整備。パッケージ名を `ndash` から `emdash-notion` に変更し、npm 公開可能にした（`private` 解除、`license`/`repository`/`keywords`/`publishConfig` 等を追加、peerDependencies を `>=0.27.0` に厳格化）。

- 管理画面の UI を日英対応（既定 `en`、設定ページで切替。`src/i18n/` にメッセージカタログを追加）。Notion 著者プロパティの既定名を `著者` → `Author` に変更
- pnpm へ移行し、oxlint / eslint / oxfmt と CI/CD（changesets による canary + stable 2 段リリース、publint / attw / size-limit / CodeQL / dependency-review / dependabot）を追加

プラグイン `id`（`ndash`）と webhook URL は変更なし。
