import type { NotionPage, NotionProperty, NotionRichText } from "./types.js";

export interface MappedProperties {
	title: string;
	/**
	 * Notion 側で公開扱いか（status/select が "published"/"public" 等）。
	 * WHY: Sandboxed の content 書込 API では emdash の status 列を設定できないため、
	 * 現状は syncMap に記録するだけで content には反映しない（Native 移行時に利用）。
	 */
	published: boolean;
}

const PUBLISHED_VALUES = new Set(["published", "public", "live", "done", "公開"]);

/** ページプロパティから title と公開状態を取り出す。 */
export function mapProperties(page: NotionPage): MappedProperties {
	const title = extractTitle(page.properties);
	const published = extractPublished(page.properties);
	return { title, published };
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
