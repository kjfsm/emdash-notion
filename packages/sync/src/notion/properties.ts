import type { NotionPage, NotionProperty, NotionRichText } from "./types.js";

export interface MappedProperties {
  title: string;
  /**
   * Notion 側で公開扱いか（status/select が "published"/"public" 等）。
   * WHY: Sandboxed の content 書込 API では emdash の status 列を設定できないため、
   * 現状は sync_map に記録するだけで content には反映しない（Native 移行時に利用）。
   */
  published: boolean;
  /** `authorProperty` で指定した rich_text プロパティの値。未設定/該当なしなら空文字。 */
  author: string;
  /** `slugProperty` で指定した rich_text プロパティの値。未設定/該当なしなら空文字。 */
  slug: string;
}

export interface MapPropertiesOptions {
  /** 著者を読み取る Notion 側プロパティ名。 */
  authorProperty: string;
  /** slug を読み取る Notion 側プロパティ名。 */
  slugProperty: string;
}

const PUBLISHED_VALUES = new Set(["published", "public", "live", "done", "公開"]);

/** ページプロパティから title・公開状態・任意の rich_text プロパティ（著者/slug）を取り出す。 */
export function mapProperties(page: NotionPage, options: MapPropertiesOptions): MappedProperties {
  const title = extractTitle(page.properties);
  const published = extractPublished(page.properties);
  const author = extractRichTextProperty(page.properties, options.authorProperty);
  const slug = extractRichTextProperty(page.properties, options.slugProperty);
  return { title, published, author, slug };
}

/** 指定名のプロパティを rich_text（無ければ title）として読み、プレーンテキストへ連結する。 */
function extractRichTextProperty(
  properties: Record<string, NotionProperty>,
  propertyName: string,
): string {
  const prop = propertyName ? properties[propertyName] : undefined;
  if (!prop) return "";
  if (Array.isArray(prop.rich_text)) return plainText(prop.rich_text);
  if (Array.isArray(prop.title)) return plainText(prop.title);
  return "";
}

function extractTitle(properties: Record<string, NotionProperty>): string {
  for (const prop of Object.values(properties)) {
    if (prop.type === "title" && Array.isArray(prop.title)) {
      return plainText(prop.title);
    }
  }
  return "";
}

function extractPublished(properties: Record<string, NotionProperty>): boolean {
  for (const prop of Object.values(properties)) {
    if (prop.type === "status" && prop.status) {
      return PUBLISHED_VALUES.has(prop.status.name.toLowerCase());
    }
    if (prop.type === "select" && prop.select) {
      return PUBLISHED_VALUES.has(prop.select.name.toLowerCase());
    }
  }
  return false;
}

function plainText(richText: NotionRichText[]): string {
  return richText.map((rt) => rt.plain_text).join("");
}
