/**
 * notion-sync が出力し notion-blocks が描画する Portable Text 型の単一情報源。
 * 標準 Portable Text の最小型 + Notion 固有カスタムブロック型（callout/todo/toggle/
 * equation/bookmark）を定義する。emdash 本体も基礎型を export するが、sync 固有の
 * `toggle` 見出しフラグ等の拡張を含むため、ここで自己完結して定義する。
 * `@emdash-notion/sync/portable-text` として公開し、notion-blocks 側はこの形状に
 * 手書き Props を合わせ、`packages/blocks/tests/type-parity.test.ts` がズレを検出する。
 */

export interface PortableTextSpan {
  _type: "span";
  _key: string;
  text: string;
  marks: string[];
}

/** リンク等のマーク定義。`_key` を span の `marks` から参照する。 */
export interface PortableTextMarkDef {
  _type: string;
  _key: string;
  [key: string]: unknown;
}

export interface PortableTextBlock {
  _type: "block";
  _key: string;
  /** "normal" | "h1".."h4" | "blockquote" など。 */
  style: string;
  children: PortableTextSpan[];
  markDefs: PortableTextMarkDef[];
  /** リスト項目のとき "bullet" | "number"。 */
  listItem?: "bullet" | "number";
  /** リストのネスト深さ（1 始まり）。 */
  level?: number;
  /** トグル見出し（`heading_*` + `is_toggleable`）のとき true。 */
  toggle?: boolean;
}

export interface PortableTextImage {
  _type: "image";
  _key: string;
  asset: { _type: "reference"; _ref: string; url?: string };
  alt?: string;
}

/** Notion の callout ブロック。アイコン・背景色を保持したまま `notion-blocks` が描画する。 */
export interface NotionCalloutIcon {
  type: "emoji" | "external" | "file";
  emoji?: string;
  url?: string;
}

export interface NotionCalloutBlock {
  _type: "notionCallout";
  _key: string;
  children: PortableTextSpan[];
  markDefs: PortableTextMarkDef[];
  icon?: NotionCalloutIcon;
  /** Notion の `color`（例 "gray_background"）。省略時は既定色。 */
  color?: string;
}

/** Notion の to_do ブロック。チェック状態を保持する。 */
export interface NotionTodoBlock {
  _type: "notionTodo";
  _key: string;
  children: PortableTextSpan[];
  markDefs: PortableTextMarkDef[];
  checked: boolean;
  /** リストのネスト深さ（1 始まり）。 */
  level?: number;
}

/** Notion の toggle ブロック。子ブロックを入れ子の Portable Text として保持する。 */
export interface NotionToggleBlock {
  _type: "notionToggle";
  _key: string;
  children: PortableTextSpan[];
  markDefs: PortableTextMarkDef[];
  content: PortableTextNode[];
}

/**
 * emdash コア標準の table ブロック（`emdash/ui` の `PortableText` がデフォルトで描画する）。
 * Notion の table/table_row をこの形状に変換することで、専用の描画コンポーネントを
 * 新設せずに済む（emdash 標準コンポーネントが `_type: "table"` を自動で処理する）。
 */
export interface PortableTextTableCell {
  _type: "tableCell";
  _key: string;
  content: PortableTextSpan[];
  markDefs?: PortableTextMarkDef[];
  /** true のとき `<th>` として描画される（Notion の has_row_header 由来）。 */
  isHeader?: boolean;
}

export interface PortableTextTableRow {
  _type: "tableRow";
  _key: string;
  cells: PortableTextTableCell[];
}

export interface PortableTextTableBlock {
  _type: "table";
  _key: string;
  rows: PortableTextTableRow[];
  /** true のとき先頭行が `<thead>` として分離される（Notion の has_column_header 由来）。 */
  hasHeaderRow?: boolean;
}

/**
 * emdash コア標準の columns ブロック。Notion の column_list/column をこの形状に変換する。
 * Notion API は列幅比率（width_ratio）を公開しないため width は設定しない（等幅）。
 */
export interface PortableTextColumnBlock {
  _type: "column";
  _key: string;
  content: PortableTextNode[];
  width?: string;
}

export interface PortableTextColumnsBlock {
  _type: "columns";
  _key: string;
  columns: PortableTextColumnBlock[];
}

/**
 * emdash コア標準の embed ブロック。Notion の video/audio（`provider` 指定でセルフホスト扱い）と
 * embed（YouTube/Vimeo 自動判定 + プレーンリンクへのフォールバックを emdash 側が内蔵）をこの形状に変換する。
 */
export interface PortableTextEmbedBlock {
  _type: "embed";
  _key: string;
  url: string;
  provider?: "video" | "audio";
  caption?: string;
}

/** emdash コア標準の file ブロック。Notion の file/pdf をこの形状に変換する（caption は未対応）。 */
export interface PortableTextFileBlock {
  _type: "file";
  _key: string;
  url: string;
  filename?: string;
}

/** Notion のブロック数式（equation）。KaTeX 等は使わず生の LaTeX 文字列のみ保持する。 */
export interface NotionEquationBlock {
  _type: "notionEquation";
  _key: string;
  expression: string;
}

/**
 * Notion の bookmark/link_preview ブロック。2 種とも Notion API 上のペイロードが
 * url + caption のみで同一のため単一型に統一し、OGP メタデータ取得結果をカード表示用に保持する。
 * fetch 失敗時は og が undefined になり、url/caption だけの簡易表示にフォールバックする。
 * （embed は emdash 標準の `PortableTextEmbedBlock` へ変換するためこの型の対象外。）
 */
export interface NotionBookmarkBlock {
  _type: "notionBookmark";
  _key: string;
  kind: "bookmark" | "link_preview";
  url: string;
  caption?: PortableTextSpan[];
  markDefs?: PortableTextMarkDef[];
  og?: {
    title?: string;
    description?: string;
    /** OGP 画像は長期間有効な CDN URL であることが多いため resolveImage には通さず URL のまま保持する。 */
    image?: string;
    siteName?: string;
  };
}

/** Notion の table_of_contents ブロック。見出し一覧の実生成はサイト側 CSS/JS に委ねる。 */
export interface NotionTableOfContentsBlock {
  _type: "notionTableOfContents";
  _key: string;
  /** Notion の `color`（例 "gray_background"）。省略時は既定色。 */
  color?: string;
}

/** Notion の child_page ブロック（サブページへのリンクカード）。 */
export interface NotionChildPageBlock {
  _type: "notionChildPage";
  _key: string;
  pageId: string;
  title: string;
}

/** Notion の child_database ブロック（インラインデータベースへのリンクカード）。 */
export interface NotionChildDatabaseBlock {
  _type: "notionChildDatabase";
  _key: string;
  databaseId: string;
  title: string;
}

/**
 * Notion の link_to_page ブロック。Notion API はリンク先のタイトルを返さないため、
 * タイトル未解決時は `title` を省略し `notion-blocks` 側で targetId を表示する。
 */
export interface NotionLinkToPageBlock {
  _type: "notionLinkToPage";
  _key: string;
  kind: "page" | "database";
  targetId: string;
  title?: string;
}

/**
 * emdash コア標準の htmlBlock。サニタイズ済みで自動描画されるが、既定の許可リストに
 * `class`/`id`/`style` が含まれないため見た目の制御はできない。native カスタムブロック化
 * するほどの価値がないレアケース（synced_block の派生・template・tab・真に未知のブロック）
 * のフォールバック専用。
 */
export interface PortableTextHtmlBlock {
  _type: "htmlBlock";
  _key: string;
  html: string;
}

/** その他ブロック（code など）は緩く許容する。 */
export interface PortableTextArbitrary {
  _type: string;
  _key: string;
  [key: string]: unknown;
}

export type PortableTextNode =
  | PortableTextBlock
  | PortableTextImage
  | NotionCalloutBlock
  | NotionTodoBlock
  | NotionToggleBlock
  | PortableTextTableBlock
  | PortableTextColumnsBlock
  | PortableTextEmbedBlock
  | PortableTextFileBlock
  | NotionEquationBlock
  | NotionBookmarkBlock
  | NotionTableOfContentsBlock
  | NotionChildPageBlock
  | NotionChildDatabaseBlock
  | NotionLinkToPageBlock
  | PortableTextHtmlBlock
  | PortableTextArbitrary;
