import type { PluginContext } from "emdash";

/** Notion 構造取得（データベース/プロパティ）と emdash フィールド候補の選択肢アイテム。 */
export interface OptionItem {
  id: string;
  name: string;
}

/**
 * 1 つの emdash コレクションと 1 つの Notion データベースの対応関係。
 * `mappings` は複数持てる（例: posts ⇔ ブログ DB、pages ⇔ 固定ページ DB）。
 */
export interface NotionMapping {
  /** 書き込み先の emdash コレクション slug。 */
  collection: string;
  /** 対応する Notion データベース（data source）id。ページの routing に必須。 */
  databaseId: string;
  /** タイトルを書き込むフィールド slug。 */
  titleField: string;
  /** Portable Text 本文を書き込むフィールド slug。 */
  bodyField: string;
  /** 著者を読み取る Notion 側プロパティ名（rich_text 想定）。 */
  authorProperty: string;
  /** 著者を書き込む emdash フィールド slug。空文字なら同期しない。 */
  authorField: string;
  /** slug を読み取る Notion 側プロパティ名（rich_text 想定）。 */
  slugProperty: string;
  /** slug を書き込む emdash フィールド slug。空文字なら同期しない（emdash のシステム slug 列は変更できない）。 */
  slugField: string;
}

/**
 * プラグイン設定。Block Kit の設定ページ（`routes/admin.ts`）が `settings:` プレフィックスで
 * kv に保存する。
 */
export interface NdashConfig {
  /** Notion internal integration token（`secret_...`）。 */
  notionToken: string;
  /** Notion 購読 URL の `?token=` に載せる共有シークレット（Webhook 検証用）。 */
  webhookToken: string;
  /** コレクション ⇔ データベースの対応関係一覧。 */
  mappings: NotionMapping[];
  /** 「Notionの構造を取得する」ボタンで取得済みの Notion データベース一覧。 */
  notionDatabases: OptionItem[];
  /** 同ボタンで取得済みの Notion プロパティ名一覧（rich_text/title のみ）。 */
  notionProperties: OptionItem[];
}

export const CONFIG_KEYS = {
  notionToken: "settings:notionToken",
  webhookToken: "settings:webhookToken",
  mappings: "settings:mappings",
  notionDatabases: "settings:notionDatabases",
  notionProperties: "settings:notionProperties",
} as const;

/**
 * emdash の標準シード（`pages`/`posts`）の実フィールド構成に合わせた既定値。
 * `author`/`slug` はどちらのシードコレクションにもカスタムフィールドとして存在しない
 * （著者は emdash コアの bylines 機構が扱う予約領域、`slug` はシステム列の予約語で
 * カスタムフィールドの slug には使えない）ため、既定では同期しない（空文字）。
 */
export const DEFAULT_TITLE_FIELD = "title";
export const DEFAULT_BODY_FIELD = "content";
export const DEFAULT_AUTHOR_PROPERTY = "Author";
export const DEFAULT_SLUG_PROPERTY = "slug";
export const DEFAULT_AUTHOR_FIELD = "";
export const DEFAULT_SLUG_FIELD = "";

function normalizeMapping(raw: Partial<NotionMapping>): NotionMapping {
  return {
    collection: raw.collection ?? "",
    databaseId: raw.databaseId ?? "",
    titleField: raw.titleField || DEFAULT_TITLE_FIELD,
    bodyField: raw.bodyField || DEFAULT_BODY_FIELD,
    authorProperty: raw.authorProperty || DEFAULT_AUTHOR_PROPERTY,
    authorField: raw.authorField ?? DEFAULT_AUTHOR_FIELD,
    slugProperty: raw.slugProperty || DEFAULT_SLUG_PROPERTY,
    slugField: raw.slugField ?? DEFAULT_SLUG_FIELD,
  };
}

/** kv から設定を読み出す。未設定フィールドは既定値または空文字で埋める。 */
export async function loadConfig(ctx: PluginContext): Promise<NdashConfig> {
  const [notionToken, webhookToken, rawMappings, notionDatabases, notionProperties] =
    await Promise.all([
      ctx.kv.get<string>(CONFIG_KEYS.notionToken),
      ctx.kv.get<string>(CONFIG_KEYS.webhookToken),
      ctx.kv.get<Partial<NotionMapping>[]>(CONFIG_KEYS.mappings),
      ctx.kv.get<OptionItem[]>(CONFIG_KEYS.notionDatabases),
      ctx.kv.get<OptionItem[]>(CONFIG_KEYS.notionProperties),
    ]);

  return {
    notionToken: notionToken ?? "",
    webhookToken: webhookToken ?? "",
    mappings: Array.isArray(rawMappings) ? rawMappings.map(normalizeMapping) : [],
    notionDatabases: Array.isArray(notionDatabases) ? notionDatabases : [],
    notionProperties: Array.isArray(notionProperties) ? notionProperties : [],
  };
}

/** 同期に最低限必要な設定が揃っているか。 */
export function isConfigReady(config: NdashConfig): boolean {
  return (
    config.notionToken !== "" &&
    config.mappings.some((m) => m.collection !== "" && m.databaseId !== "")
  );
}

function stripDashes(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/**
 * 同じ Notion データベースを複数コレクションへ割り当てているマッピングを検出する。
 * `findMappingForParent` は先勝ちのため、重複があると 2 つ目以降が無警告で無視される。
 * 正規化済み（ダッシュ除去・小文字化）の databaseId を返す。
 */
export function findDuplicateDatabaseIds(mappings: NotionMapping[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const m of mappings) {
    if (!m.databaseId) continue;
    const key = stripDashes(m.databaseId);
    if (seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }
  return [...duplicates];
}

/** ページの parent（database_id / data_source_id）に一致するマッピングを探す。 */
export function findMappingForParent(
  mappings: NotionMapping[],
  parent: { database_id?: string; data_source_id?: string },
): NotionMapping | undefined {
  return mappings.find((m) => {
    if (!m.databaseId) return false;
    const target = stripDashes(m.databaseId);
    return (
      (parent.database_id !== undefined && stripDashes(parent.database_id) === target) ||
      (parent.data_source_id !== undefined && stripDashes(parent.data_source_id) === target)
    );
  });
}
