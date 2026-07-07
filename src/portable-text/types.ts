/**
 * 標準 Sanity Portable Text の最小型。emdash は `@portabletext/types` を使うが、
 * emdash-notion は自己完結のため必要分だけ写す。
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
}

export interface PortableTextImage {
  _type: "image";
  _key: string;
  asset: { _type: "reference"; _ref: string; url?: string };
  alt?: string;
}

/** その他ブロック（code など）は緩く許容する。 */
export interface PortableTextArbitrary {
  _type: string;
  _key: string;
  [key: string]: unknown;
}

export type PortableTextNode = PortableTextBlock | PortableTextImage | PortableTextArbitrary;
