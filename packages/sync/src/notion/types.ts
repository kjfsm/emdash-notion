/**
 * Notion REST API のレスポンスのうち、notion-sync が実際に読む部分だけを写した最小型。
 * `@notionhq/client` に依存すると sandbox バンドルが重くなるため、自前で定義して自己完結させる。
 */

export interface NotionAnnotations {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: string;
}

export interface NotionRichText {
  type: string;
  plain_text: string;
  href: string | null;
  annotations: NotionAnnotations;
}

/** Notion のブロック。`type` に対応するキー（例 `paragraph`）へ実体が入る。 */
export interface NotionBlock {
  object: "block";
  id: string;
  type: string;
  has_children: boolean;
  /** `block[block.type]` に相当する任意ペイロード。 */
  [key: string]: unknown;
  /** `fetchBlockTree` が再帰取得して差し込む子ブロック。 */
  children?: NotionBlock[];
}

export interface NotionParent {
  type: string;
  database_id?: string;
  data_source_id?: string;
  page_id?: string;
}

export interface NotionPage {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  parent: NotionParent;
  properties: Record<string, NotionProperty>;
}

/** ページプロパティ。title だけ厳密に、他は緩く扱う。 */
export interface NotionProperty {
  id: string;
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  select?: { name: string } | null;
  status?: { name: string } | null;
  [key: string]: unknown;
}

export interface NotionDatabaseTitleFragment {
  plain_text: string;
}

/** データベース（data source）のスキーマ。notion-sync が読む部分のみ。 */
export interface NotionDatabase {
  object: "database";
  id: string;
  title: NotionDatabaseTitleFragment[];
  properties: Record<string, NotionProperty>;
}

export interface NotionListResponse<T> {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

/** Notion 公式 Webhook のイベントペイロード（notion-sync が読む部分のみ）。 */
export interface NotionWebhookPayload {
  /** 購読作成時のハンドシェイク。存在すればイベントではなく検証リクエスト。 */
  verification_token?: string;
  type?: string;
  entity?: { id: string; type: string };
  /** 旧形式・別形式のフォールバック。 */
  page?: { id: string };
  [key: string]: unknown;
}
