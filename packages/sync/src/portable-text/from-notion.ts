import { plainText } from "../notion/plain-text.js";
import type { NotionBlock, NotionRichText } from "../notion/types.js";
import { escapeHtml } from "./html-escape.js";
import { makeKeyGen } from "./keys.js";
import { richTextToInline } from "./rich-text.js";
import type {
  NotionBookmarkBlock,
  NotionCalloutBlock,
  NotionCalloutIcon,
  NotionChildDatabaseBlock,
  NotionChildPageBlock,
  NotionEquationBlock,
  NotionLinkToPageBlock,
  NotionTableOfContentsBlock,
  NotionTodoBlock,
  NotionToggleBlock,
  OgpData,
  PortableTextBlock,
  PortableTextColumnBlock,
  PortableTextColumnsBlock,
  PortableTextEmbedBlock,
  PortableTextFileBlock,
  PortableTextHtmlBlock,
  PortableTextImage,
  PortableTextNode,
  PortableTextTableBlock,
  PortableTextTableRow,
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

/** file/pdf の署名付き URL を emdash メディアへ取り込む。video/audio には使わない（media/resolve.ts 参照）。 */
export type FileResolver = (file: {
  url: string;
  filename?: string;
  blockId: string;
}) => Promise<ImageRef>;

export type { OgpData };

/** bookmark/link_preview の OGP メタデータを取得する。失敗時は undefined を返す。 */
export type OgpFetcher = (url: string) => Promise<OgpData | undefined>;

export interface ConvertOptions {
  keygen?: () => string;
  /** 画像を emdash メディアへ取り込む。未指定なら元 URL をそのまま参照する。 */
  resolveImage?: ImageResolver;
  /** file/pdf を emdash メディアへ取り込む。未指定なら元 URL をそのまま参照する。 */
  resolveFile?: FileResolver;
  /** bookmark/link_preview の OGP メタデータを取得する。未指定なら url/caption のみで表示する。 */
  fetchOgp?: OgpFetcher;
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
  heading_4: "h4",
  heading_5: "h5",
  heading_6: "h6",
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

/** 各種外部依存 resolver をまとめて引き回すための束（引数の肥大化を避ける）。 */
interface Resolvers {
  resolveImage: ImageResolver | undefined;
  resolveFile: FileResolver | undefined;
  fetchOgp: OgpFetcher | undefined;
}

/** Notion ブロックツリーを Portable Text ノード配列へ変換する。 */
export async function notionBlocksToPortableText(
  blocks: NotionBlock[],
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const keygen = options.keygen ?? makeKeyGen();
  const unsupported = new Set<string>();
  const out: PortableTextNode[] = [];
  const resolvers: Resolvers = {
    resolveImage: options.resolveImage,
    resolveFile: options.resolveFile,
    fetchOgp: options.fetchOgp,
  };
  await walk(blocks, 1, out, keygen, resolvers, unsupported);
  return { blocks: out, unsupported: [...unsupported] };
}

async function walk(
  blocks: NotionBlock[],
  level: number,
  out: PortableTextNode[],
  keygen: () => string,
  resolvers: Resolvers,
  unsupported: Set<string>,
): Promise<void> {
  for (const block of blocks) {
    await convertBlock(block, level, out, keygen, resolvers, unsupported);
  }
}

/** `block.children` を独立した Portable Text ノード配列として変換する（toggle の入れ子コンテンツ用）。 */
async function convertChildren(
  blocks: NotionBlock[],
  keygen: () => string,
  resolvers: Resolvers,
  unsupported: Set<string>,
): Promise<PortableTextNode[]> {
  const nested: PortableTextNode[] = [];
  await walk(blocks, 1, nested, keygen, resolvers, unsupported);
  return nested;
}

async function convertBlock(
  block: NotionBlock,
  level: number,
  out: PortableTextNode[],
  keygen: () => string,
  resolvers: Resolvers,
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
    case "heading_3":
    case "heading_4":
    case "heading_5":
    case "heading_6": {
      const heading = data as NotionHeadingPayload | undefined;
      out.push(
        textBlock(HEADING_STYLE[type], heading?.rich_text ?? [], keygen, {
          toggle: heading?.is_toggleable || undefined,
        }),
      );
      // トグル見出しの子は通常ブロックとして続けて出力する。
      await walk(block.children ?? [], level, out, keygen, resolvers, unsupported);
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
      await walk(block.children ?? [], level + 1, out, keygen, resolvers, unsupported);
      return;
    }
    case "to_do": {
      out.push(todoBlock(data as NotionTodoPayload | undefined, level, keygen));
      await walk(block.children ?? [], level + 1, out, keygen, resolvers, unsupported);
      return;
    }
    case "numbered_list_item": {
      out.push(listBlock("number", level, data?.rich_text ?? [], keygen));
      await walk(block.children ?? [], level + 1, out, keygen, resolvers, unsupported);
      return;
    }
    case "toggle": {
      out.push(
        await toggleBlock(
          data?.rich_text ?? [],
          block.children ?? [],
          keygen,
          resolvers,
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
        code: plainText(code?.rich_text),
        language: code?.language ?? "text",
      });
      break;
    }
    case "divider": {
      out.push({ _type: "divider", _key: keygen() });
      break;
    }
    case "image": {
      const img = await convertImage(block, keygen, resolvers.resolveImage);
      if (img) out.push(img);
      break;
    }
    case "table": {
      const table = convertTable(block, keygen);
      if (table) out.push(table);
      // table_row は table 側で畳み込み済みのため、共通 walk には流さない。
      return;
    }
    case "column_list": {
      const columns = await convertColumns(block, keygen, resolvers, unsupported);
      if (columns) out.push(columns);
      // column は column_list 側で畳み込み済みのため、共通 walk には流さない。
      return;
    }
    case "equation": {
      const equation = convertEquation(block, keygen);
      if (equation) out.push(equation);
      break;
    }
    case "video":
    case "audio": {
      const embed = convertMediaEmbed(block, type, keygen);
      if (embed) out.push(embed);
      break;
    }
    case "file":
    case "pdf": {
      const file = await convertFile(block, keygen, resolvers.resolveFile);
      if (file) out.push(file);
      break;
    }
    case "embed": {
      const embed = convertEmbed(block, keygen);
      if (embed) out.push(embed);
      break;
    }
    case "bookmark":
    case "link_preview": {
      const bookmark = await convertBookmark(block, type, keygen, resolvers.fetchOgp);
      if (bookmark) out.push(bookmark);
      break;
    }
    case "table_of_contents": {
      out.push(convertTableOfContents(block, keygen));
      break;
    }
    case "child_page": {
      const childPage = convertChildPage(block, keygen);
      if (childPage) out.push(childPage);
      break;
    }
    case "child_database": {
      const childDatabase = convertChildDatabase(block, keygen);
      if (childDatabase) out.push(childDatabase);
      break;
    }
    case "link_to_page": {
      const linkToPage = convertLinkToPage(block, keygen);
      if (linkToPage) out.push(linkToPage);
      break;
    }
    case "synced_block": {
      // HTML ラッパーは Portable Text の配列構造と相性が悪いため、ノードは出さず子だけ流す。
      await walk(block.children ?? [], level, out, keygen, resolvers, unsupported);
      return;
    }
    case "template": {
      out.push(convertTemplate(block, keygen));
      await walk(block.children ?? [], level, out, keygen, resolvers, unsupported);
      return;
    }
    case "tab": {
      out.push(htmlBlock('<div class="notion-tab"></div>', keygen));
      await walk(block.children ?? [], level, out, keygen, resolvers, unsupported);
      return;
    }
    default: {
      unsupported.add(type);
      // 未知でも rich_text を持つブロックは本文欠落を避けるため段落へフォールバックする。
      if (data?.rich_text && data.rich_text.length > 0) {
        out.push(textBlock("normal", data.rich_text, keygen));
      } else {
        out.push(htmlBlock(`<!-- notion:unsupported ${escapeHtml(type)} -->`, keygen));
      }
      await walk(block.children ?? [], level, out, keygen, resolvers, unsupported);
      return;
    }
  }

  // リスト・見出し以外で子を持つ場合も取りこぼさない。
  await walk(block.children ?? [], level, out, keygen, resolvers, unsupported);
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
  resolvers: Resolvers,
  unsupported: Set<string>,
): Promise<NotionToggleBlock> {
  const { children: spans, markDefs } = richTextToInline(richText, keygen);
  const content = await convertChildren(children, keygen, resolvers, unsupported);
  return { _type: "notionToggle", _key: keygen(), children: spans, markDefs, content };
}

/**
 * Notion の image を emdash コア標準の image 形状へ変換する。file 型（Notion の署名付き URL、
 * 約1時間で失効）のときだけ resolveImage で emdash メディアへ永続化し、external（外部ホストの
 * 恒久 URL）はそのまま参照する（allowedHosts 外のホストへの無駄な fetch を避けるため）。
 */
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
  const url = mediaUrl(image);
  if (!url) return null;
  const alt = plainText(image?.caption);

  const shouldPersist = image?.type === "file" && resolveImage;
  const resolved = shouldPersist
    ? await resolveImage({ url, alt, blockId: block.id })
    : { ref: url, url };

  return {
    _type: "image",
    _key: keygen(),
    asset: { _type: "reference", _ref: resolved.ref, url: resolved.url ?? url },
    alt: alt || undefined,
  };
}

/** Notion のブロック数式を生の LaTeX 文字列のまま notionEquation に変換する（KaTeX 等は使わない）。 */
function convertEquation(block: NotionBlock, keygen: () => string): NotionEquationBlock | null {
  const equation = block.equation as { expression?: string } | undefined;
  if (!equation?.expression) return null;
  return { _type: "notionEquation", _key: keygen(), expression: equation.expression };
}

function htmlBlock(html: string, keygen: () => string): PortableTextHtmlBlock {
  return { _type: "htmlBlock", _key: keygen(), html };
}

function convertTableOfContents(
  block: NotionBlock,
  keygen: () => string,
): NotionTableOfContentsBlock {
  const toc = block.table_of_contents as { color?: string } | undefined;
  return {
    _type: "notionTableOfContents",
    _key: keygen(),
    color: toc?.color && toc.color !== "default" ? toc.color : undefined,
  };
}

function convertChildPage(block: NotionBlock, keygen: () => string): NotionChildPageBlock | null {
  const childPage = block.child_page as { title?: string } | undefined;
  if (!childPage) return null;
  return {
    _type: "notionChildPage",
    _key: keygen(),
    pageId: block.id,
    title: childPage.title || "Untitled",
  };
}

function convertChildDatabase(
  block: NotionBlock,
  keygen: () => string,
): NotionChildDatabaseBlock | null {
  const childDatabase = block.child_database as { title?: string } | undefined;
  if (!childDatabase) return null;
  return {
    _type: "notionChildDatabase",
    _key: keygen(),
    databaseId: block.id,
    title: childDatabase.title || "Untitled",
  };
}

/** Notion API はリンク先のタイトルを返さないため、`title` は付与せず targetId をそのまま保持する。 */
function convertLinkToPage(block: NotionBlock, keygen: () => string): NotionLinkToPageBlock | null {
  const linkToPage = block.link_to_page as
    | { type?: string; page_id?: string; database_id?: string }
    | undefined;
  if (!linkToPage) return null;
  if (linkToPage.type === "page_id" && linkToPage.page_id) {
    return {
      _type: "notionLinkToPage",
      _key: keygen(),
      kind: "page",
      targetId: linkToPage.page_id,
    };
  }
  if (linkToPage.type === "database_id" && linkToPage.database_id) {
    return {
      _type: "notionLinkToPage",
      _key: keygen(),
      kind: "database",
      targetId: linkToPage.database_id,
    };
  }
  return null;
}

function convertTemplate(block: NotionBlock, keygen: () => string): PortableTextHtmlBlock {
  const template = block.template as { rich_text?: NotionRichText[] } | undefined;
  const text = plainText(template?.rich_text);
  return htmlBlock(`<div class="notion-template">${escapeHtml(text)}</div>`, keygen);
}

interface NotionTablePayload {
  has_column_header?: boolean;
  has_row_header?: boolean;
}

interface NotionTableRowPayload {
  cells?: NotionRichText[][];
}

/**
 * Notion の table/table_row を emdash コア標準の table 形状へ変換する。
 * has_column_header は先頭行を thead に分離する `hasHeaderRow` に、has_row_header は
 * 各行の先頭セルの `isHeader` にマッピングする（emdash の Table コンポーネントはセル単位で
 * isHeader を持てるため、行ヘッダー・列ヘッダーの両方をこの形状だけで表現できる）。
 */
function convertTable(block: NotionBlock, keygen: () => string): PortableTextTableBlock | null {
  const table = block.table as NotionTablePayload | undefined;
  const rowBlocks = (block.children ?? []).filter((c) => c.type === "table_row");
  if (rowBlocks.length === 0) return null;

  const rows: PortableTextTableRow[] = rowBlocks.map((rowBlock) => {
    const cells = (rowBlock.table_row as NotionTableRowPayload | undefined)?.cells ?? [];
    return {
      _type: "tableRow",
      _key: keygen(),
      cells: cells.map((cell, cellIndex) => {
        const { children, markDefs } = richTextToInline(cell, keygen);
        return {
          _type: "tableCell",
          _key: keygen(),
          content: children,
          markDefs: markDefs.length > 0 ? markDefs : undefined,
          isHeader: (table?.has_row_header && cellIndex === 0) || undefined,
        };
      }),
    };
  });

  return {
    _type: "table",
    _key: keygen(),
    rows,
    hasHeaderRow: table?.has_column_header || undefined,
  };
}

/**
 * Notion の column_list/column を emdash コア標準の columns 形状へ変換する。
 * Notion API は列幅比率（width_ratio）を公開しないため width は設定しない。
 */
async function convertColumns(
  block: NotionBlock,
  keygen: () => string,
  resolvers: Resolvers,
  unsupported: Set<string>,
): Promise<PortableTextColumnsBlock | null> {
  const columnBlocks = (block.children ?? []).filter((c) => c.type === "column");
  if (columnBlocks.length === 0) return null;

  const columns: PortableTextColumnBlock[] = [];
  for (const col of columnBlocks) {
    const content = await convertChildren(col.children ?? [], keygen, resolvers, unsupported);
    columns.push({ _type: "column", _key: keygen(), content });
  }

  return { _type: "columns", _key: keygen(), columns };
}

interface NotionMediaPayload {
  type?: string;
  external?: { url: string };
  file?: { url: string; name?: string };
  caption?: NotionRichText[];
}

/** Notion のメディアペイロード（external/file の 2 形態）から実 URL を取り出す。 */
function mediaUrl(
  payload: { external?: { url: string }; file?: { url: string } } | undefined,
): string | undefined {
  return payload?.external?.url ?? payload?.file?.url;
}

/**
 * Notion の video/audio を emdash コア標準の embed 形状（`provider` 指定でセルフホスト扱い）へ変換する。
 * サイズが大きく Worker の実行時間・メモリを圧迫しうるため resolver は通さず、元 URL
 * （file 型の場合は Notion の署名付き URL で約1時間後に失効する）をそのまま参照する。
 */
function convertMediaEmbed(
  block: NotionBlock,
  kind: "video" | "audio",
  keygen: () => string,
): PortableTextEmbedBlock | null {
  const payload = block[kind] as NotionMediaPayload | undefined;
  const url = mediaUrl(payload);
  if (!url) return null;
  const caption = plainText(payload?.caption);
  return { _type: "embed", _key: keygen(), url, provider: kind, caption: caption || undefined };
}

/**
 * Notion の file/pdf を emdash コア標準の file 形状へ変換する。file 型（Notion の署名付き URL、
 * 約1時間で失効）のときだけ resolveFile で emdash メディアへ永続化し、失敗時は元 URL へフォールバックする。
 */
async function convertFile(
  block: NotionBlock,
  keygen: () => string,
  resolveFile: FileResolver | undefined,
): Promise<PortableTextFileBlock | null> {
  const type = block.type as "file" | "pdf";
  const payload = block[type] as NotionMediaPayload | undefined;
  const url = mediaUrl(payload);
  if (!url) return null;

  const shouldPersist = payload?.type === "file" && resolveFile;
  const resolved = shouldPersist
    ? await resolveFile({ url, filename: payload?.file?.name, blockId: block.id })
    : null;

  return {
    _type: "file",
    _key: keygen(),
    url: resolved?.url ?? url,
    filename: payload?.file?.name,
  };
}

/** Notion の embed（任意 URL）を emdash コア標準の embed 形状へ変換する。YouTube/Vimeo 自動判定・
 * プレーンリンクへのフォールバックは emdash 側の Embed コンポーネントが内蔵しているため変換は薄く済む。 */
function convertEmbed(block: NotionBlock, keygen: () => string): PortableTextEmbedBlock | null {
  const payload = block.embed as { url?: string; caption?: NotionRichText[] } | undefined;
  if (!payload?.url) return null;
  const caption = plainText(payload.caption);
  return { _type: "embed", _key: keygen(), url: payload.url, caption: caption || undefined };
}

/**
 * Notion の bookmark/link_preview を OGP メタデータ付きカードへ変換する。fetchOgp 未指定・失敗時は
 * og が undefined になり、url/caption のみの簡易表示（NotionBookmark.astro）にフォールバックする。
 */
async function convertBookmark(
  block: NotionBlock,
  kind: "bookmark" | "link_preview",
  keygen: () => string,
  fetchOgp: OgpFetcher | undefined,
): Promise<NotionBookmarkBlock | null> {
  const payload = block[kind] as { url?: string; caption?: NotionRichText[] } | undefined;
  if (!payload?.url) return null;
  const { children: caption, markDefs } = richTextToInline(payload.caption ?? [], keygen);
  const og = fetchOgp ? await fetchOgp(payload.url).catch(() => undefined) : undefined;

  return {
    _type: "notionBookmark",
    _key: keygen(),
    kind,
    url: payload.url,
    caption: caption.length > 0 ? caption : undefined,
    markDefs: markDefs.length > 0 ? markDefs : undefined,
    og,
  };
}
