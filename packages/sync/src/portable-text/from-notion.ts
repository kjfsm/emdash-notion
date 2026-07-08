import type { NotionBlock, NotionRichText } from "../notion/types.js";
import { makeKeyGen } from "./keys.js";
import { richTextToInline } from "./rich-text.js";
import type {
  NotionCalloutBlock,
  NotionCalloutIcon,
  NotionTodoBlock,
  NotionToggleBlock,
  PortableTextBlock,
  PortableTextImage,
  PortableTextNode,
} from "./types.js";

export interface ImageRef {
  /** emdash メディア id 等の参照値。 */
  ref: string;
  url?: string;
}

export type ImageResolver = (image: {
  url: string;
  alt: string;
  blockId: string;
}) => Promise<ImageRef>;

export interface ConvertOptions {
  keygen?: () => string;
  /** 画像を emdash メディアへ取り込む。未指定なら元 URL をそのまま参照する。 */
  resolveImage?: ImageResolver;
}

export interface ConvertResult {
  blocks: PortableTextNode[];
  /** 変換できなかった Notion ブロック type の一覧（重複なし・ログ用）。 */
  unsupported: string[];
}

const HEADING_STYLE: Record<string, string> = {
  heading_1: "h1",
  heading_2: "h2",
  heading_3: "h3",
};

interface NotionCalloutPayload {
  rich_text?: NotionRichText[];
  icon?: {
    type: "emoji" | "external" | "file";
    emoji?: string;
    external?: { url: string };
    file?: { url: string };
  };
  color?: string;
}

interface NotionTodoPayload {
  rich_text?: NotionRichText[];
  checked?: boolean;
}

interface NotionHeadingPayload {
  rich_text?: NotionRichText[];
  is_toggleable?: boolean;
}

/** Notion ブロックツリーを Portable Text ノード配列へ変換する。 */
export async function notionBlocksToPortableText(
  blocks: NotionBlock[],
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const keygen = options.keygen ?? makeKeyGen();
  const unsupported = new Set<string>();
  const out: PortableTextNode[] = [];
  await walk(blocks, 1, out, keygen, options.resolveImage, unsupported);
  return { blocks: out, unsupported: [...unsupported] };
}

async function walk(
  blocks: NotionBlock[],
  level: number,
  out: PortableTextNode[],
  keygen: () => string,
  resolveImage: ImageResolver | undefined,
  unsupported: Set<string>,
): Promise<void> {
  for (const block of blocks) {
    await convertBlock(block, level, out, keygen, resolveImage, unsupported);
  }
}

/** `block.children` を独立した Portable Text ノード配列として変換する（toggle の入れ子コンテンツ用）。 */
async function convertChildren(
  blocks: NotionBlock[],
  keygen: () => string,
  resolveImage: ImageResolver | undefined,
  unsupported: Set<string>,
): Promise<PortableTextNode[]> {
  const nested: PortableTextNode[] = [];
  await walk(blocks, 1, nested, keygen, resolveImage, unsupported);
  return nested;
}

async function convertBlock(
  block: NotionBlock,
  level: number,
  out: PortableTextNode[],
  keygen: () => string,
  resolveImage: ImageResolver | undefined,
  unsupported: Set<string>,
): Promise<void> {
  const type = block.type;
  const data = block[type] as { rich_text?: NotionRichText[] } | undefined;

  switch (type) {
    case "paragraph": {
      out.push(textBlock("normal", data?.rich_text ?? [], keygen));
      break;
    }
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const heading = data as NotionHeadingPayload | undefined;
      out.push(
        textBlock(HEADING_STYLE[type], heading?.rich_text ?? [], keygen, {
          toggle: heading?.is_toggleable || undefined,
        }),
      );
      // トグル見出しの子は通常ブロックとして続けて出力する。
      await walk(block.children ?? [], level, out, keygen, resolveImage, unsupported);
      return;
    }
    case "quote": {
      out.push(textBlock("blockquote", data?.rich_text ?? [], keygen));
      break;
    }
    case "callout": {
      out.push(calloutBlock(data as NotionCalloutPayload | undefined, keygen));
      break;
    }
    case "bulleted_list_item": {
      out.push(listBlock("bullet", level, data?.rich_text ?? [], keygen));
      await walk(block.children ?? [], level + 1, out, keygen, resolveImage, unsupported);
      return;
    }
    case "to_do": {
      out.push(todoBlock(data as NotionTodoPayload | undefined, level, keygen));
      await walk(block.children ?? [], level + 1, out, keygen, resolveImage, unsupported);
      return;
    }
    case "numbered_list_item": {
      out.push(listBlock("number", level, data?.rich_text ?? [], keygen));
      await walk(block.children ?? [], level + 1, out, keygen, resolveImage, unsupported);
      return;
    }
    case "toggle": {
      out.push(
        await toggleBlock(
          data?.rich_text ?? [],
          block.children ?? [],
          keygen,
          resolveImage,
          unsupported,
        ),
      );
      return;
    }
    case "code": {
      const code = block.code as { rich_text?: NotionRichText[]; language?: string } | undefined;
      out.push({
        _type: "code",
        _key: keygen(),
        code: (code?.rich_text ?? []).map((rt) => rt.plain_text).join(""),
        language: code?.language ?? "text",
      });
      break;
    }
    case "divider": {
      out.push({ _type: "divider", _key: keygen() });
      break;
    }
    case "image": {
      const img = await convertImage(block, keygen, resolveImage);
      if (img) out.push(img);
      break;
    }
    default: {
      unsupported.add(type);
      // 未知でも rich_text を持つブロックは本文欠落を避けるため段落へフォールバックする。
      if (data?.rich_text && data.rich_text.length > 0) {
        out.push(textBlock("normal", data.rich_text, keygen));
      }
      await walk(block.children ?? [], level, out, keygen, resolveImage, unsupported);
      return;
    }
  }

  // リスト・見出し以外で子を持つ場合も取りこぼさない。
  await walk(block.children ?? [], level, out, keygen, resolveImage, unsupported);
}

function textBlock(
  style: string,
  richText: NotionRichText[],
  keygen: () => string,
  extra: { toggle?: boolean } = {},
): PortableTextBlock {
  const { children, markDefs } = richTextToInline(richText, keygen);
  return { _type: "block", _key: keygen(), style, children, markDefs, ...extra };
}

function listBlock(
  listItem: "bullet" | "number",
  level: number,
  richText: NotionRichText[],
  keygen: () => string,
): PortableTextBlock {
  const { children, markDefs } = richTextToInline(richText, keygen);
  return { _type: "block", _key: keygen(), style: "normal", listItem, level, children, markDefs };
}

function calloutIcon(icon: NotionCalloutPayload["icon"]): NotionCalloutIcon | undefined {
  if (!icon) return undefined;
  if (icon.type === "emoji" && icon.emoji) return { type: "emoji", emoji: icon.emoji };
  if (icon.type === "external" && icon.external?.url)
    return { type: "external", url: icon.external.url };
  if (icon.type === "file" && icon.file?.url) return { type: "file", url: icon.file.url };
  return undefined;
}

function calloutBlock(
  payload: NotionCalloutPayload | undefined,
  keygen: () => string,
): NotionCalloutBlock {
  const { children, markDefs } = richTextToInline(payload?.rich_text ?? [], keygen);
  return {
    _type: "notionCallout",
    _key: keygen(),
    children,
    markDefs,
    icon: calloutIcon(payload?.icon),
    color: payload?.color && payload.color !== "default" ? payload.color : undefined,
  };
}

function todoBlock(
  payload: NotionTodoPayload | undefined,
  level: number,
  keygen: () => string,
): NotionTodoBlock {
  const { children, markDefs } = richTextToInline(payload?.rich_text ?? [], keygen);
  return {
    _type: "notionTodo",
    _key: keygen(),
    children,
    markDefs,
    checked: payload?.checked ?? false,
    level,
  };
}

async function toggleBlock(
  richText: NotionRichText[],
  children: NotionBlock[],
  keygen: () => string,
  resolveImage: ImageResolver | undefined,
  unsupported: Set<string>,
): Promise<NotionToggleBlock> {
  const { children: spans, markDefs } = richTextToInline(richText, keygen);
  const content = await convertChildren(children, keygen, resolveImage, unsupported);
  return { _type: "notionToggle", _key: keygen(), children: spans, markDefs, content };
}

async function convertImage(
  block: NotionBlock,
  keygen: () => string,
  resolveImage: ImageResolver | undefined,
): Promise<PortableTextImage | null> {
  const image = block.image as
    | {
        type?: string;
        external?: { url: string };
        file?: { url: string };
        caption?: NotionRichText[];
      }
    | undefined;
  const url = image?.external?.url ?? image?.file?.url;
  if (!url) return null;
  const alt = (image?.caption ?? []).map((rt) => rt.plain_text).join("");

  const resolved = resolveImage
    ? await resolveImage({ url, alt, blockId: block.id })
    : { ref: url, url };

  return {
    _type: "image",
    _key: keygen(),
    asset: { _type: "reference", _ref: resolved.ref, url: resolved.url ?? url },
    alt: alt || undefined,
  };
}
