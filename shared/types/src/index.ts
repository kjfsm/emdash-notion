/**
 * 標準 Sanity Portable Text の最小型 + notion-sync/notion-blocks が合意する
 * Notion 固有カスタムブロック型。emdash は `@portabletext/types` を使うが、
 * このパッケージは自己完結のため必要分だけ写す。
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
  | PortableTextArbitrary;
