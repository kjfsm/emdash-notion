import type { NotionRichText } from "../notion/types.js";
import type { PortableTextMarkDef, PortableTextSpan } from "./types.js";

export interface InlineResult {
	children: PortableTextSpan[];
	markDefs: PortableTextMarkDef[];
}

/** Notion annotations → Portable Text の装飾マーク名。 */
const DECORATOR_MARKS: Array<[keyof NotionRichText["annotations"], string]> = [
	["bold", "strong"],
	["italic", "em"],
	["strikethrough", "strike-through"],
	["underline", "underline"],
	["code", "code"],
];

/**
 * Notion の rich_text 配列を Portable Text の span 群へ変換する。
 * 装飾は marks に、リンクは markDefs（`_type: "link"`）へ振り分ける。
 */
export function richTextToInline(richText: NotionRichText[], keygen: () => string): InlineResult {
	const children: PortableTextSpan[] = [];
	const markDefs: PortableTextMarkDef[] = [];
	// 同一 href は 1 つの markDef に集約する。
	const linkKeys = new Map<string, string>();

	for (const rt of richText) {
		if (rt.plain_text === "") continue;
		const marks: string[] = [];

		for (const [flag, mark] of DECORATOR_MARKS) {
			if (rt.annotations[flag]) marks.push(mark);
		}

		if (rt.href) {
			let key = linkKeys.get(rt.href);
			if (key === undefined) {
				key = keygen();
				linkKeys.set(rt.href, key);
				markDefs.push({ _type: "link", _key: key, href: rt.href });
			}
			marks.push(key);
		}

		children.push({ _type: "span", _key: keygen(), text: rt.plain_text, marks });
	}

	return { children, markDefs };
}
