---
"@emdash-notion/sync": patch
"@emdash-notion/blocks": patch
---

メジャーリリースに向けた品質改善（1.0 前ハードニング）:

- descriptor の `version` を package.json から自動生成（`gen-version`）し、マニフェスト上のバージョン乖離を解消
- webhook の並行/重複配信による二重コンテンツ作成を、create 前の軽量な予約（pending/claimId）で best-effort に抑止（レビューで判明した「create 後の照合では真の同時実行を防げない」問題を受けて設計を修正し、無駄な重複作成自体を避けるようにした）
- リクエスト予算超過でブロックツリーが打ち切られた場合に `truncated` を伝播し、ハッシュに含めて次回の全量同期で自動修復（unchanged 判定時も保存済みの truncated 状態を返し続ける。管理画面バナーは実際の失敗と区別して表示）
- 重複 databaseId マッピングの警告を `loadConfig` に一本化し、webhook 経由の取り込みでも手動同期でも自動的に効くように修正
- スキーマ欠損検知の正規表現がテーブル修飾されたカラム名（`t.slug` 等）でも欠損フィールドを正しく特定できるよう修正
- 内部型パッケージ `@emdash-notion/types` を廃止し、カスタム Portable Text ブロック型を `@emdash-notion/sync/portable-text` として公開。公開物からの未公開パッケージ参照を除去し、notion-blocks とのズレを型パリティテストで検出
- notion-blocks の bookmark/callout で Notion 由来 URL のスキームを検証（`javascript:` 等を破棄）
- Notion API レスポンス型を公式 `@notionhq/client` 型と型レベルで照合しドリフトを検知（`import type` のみ、ランタイム非依存）
- 一括同期で 1 データベースのクエリ失敗が全体を止めないよう継続化、重複 databaseId マッピングを警告
- Retry-After の上限クランプ、`verification_token` のログマスク
- notion-blocks（color/safe-url/コンポーネント網羅/型パリティ）と sync（冪等性/truncate 等）のテスト拡充、README にブロック一覧・CSS カスタムプロパティを追記
