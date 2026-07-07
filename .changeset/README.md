# Changesets

このディレクトリの `.md` ファイルは、次回リリースに含める変更内容とバージョン bump 種別を記録する。

## 使い方

1. `packages`（このリポジトリでは `src/`）に利用者影響のある変更を入れたら `pnpm changeset` を実行する。
2. bump 種別を選ぶ（明示的な指示が無い限り既定は **`patch`**。`minor` は後方互換の公開 API 追加、`major` は破壊的変更のみ）。
3. 生成された `.changeset/*.md` を変更と同じ PR にコミットする。

## リリースの流れ

- **canary（自動）**: `main` への push ごとに `0.0.0-canary-<sha>` を npm の `canary` タグへ公開する（changeset は消費しない）。
- **stable（手動）**: メンテナが `release-stable` ワークフローを workflow_dispatch で起動 → 未消化の changeset があれば "Version Packages" PR が作られ、これをマージすると `latest` タグへ公開される。

ドキュメント・CI・リポジトリ設定のみの変更は changeset 不要（PR に `skip-changeset` ラベルを付ける）。

詳細: https://github.com/changesets/changesets
