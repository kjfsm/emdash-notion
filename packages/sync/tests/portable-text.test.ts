import { describe, expect, it } from "vitest";

import type { NotionBlock, NotionRichText } from "../src/notion/types.js";
import { notionBlocksToPortableText } from "../src/portable-text/from-notion.js";
import type {
  NotionBookmarkBlock,
  NotionCalloutBlock,
  NotionEquationBlock,
  NotionTodoBlock,
  NotionToggleBlock,
  PortableTextBlock,
  PortableTextColumnsBlock,
  PortableTextEmbedBlock,
  PortableTextFileBlock,
  PortableTextImage,
  PortableTextTableBlock,
} from "../src/portable-text/types.js";

function rt(text: string, opts: { bold?: boolean; href?: string } = {}): NotionRichText {
  return {
    type: "text",
    plain_text: text,
    href: opts.href ?? null,
    annotations: {
      bold: opts.bold ?? false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: "default",
    },
  };
}

function block(id: string, type: string, payload: unknown, children?: NotionBlock[]): NotionBlock {
  return { object: "block", id, type, has_children: !!children, [type]: payload, children };
}

describe("notionBlocksToPortableText", () => {
  it("段落を装飾マークとリンク markDef 付きで変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("b1", "paragraph", {
        rich_text: [
          rt("Hello "),
          rt("bold", { bold: true }),
          rt("link", { href: "https://e.com" }),
        ],
      }),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0] as PortableTextBlock;
    expect(b._type).toBe("block");
    expect(b.style).toBe("normal");
    expect(b.children.map((c) => c.text)).toEqual(["Hello ", "bold", "link"]);
    expect(b.children[1]!.marks).toEqual(["strong"]);
    expect(b.markDefs).toHaveLength(1);
    expect(b.markDefs[0]!._type).toBe("link");
    expect(b.markDefs[0]!.href).toBe("https://e.com");
    // リンク span の mark が markDef の _key を参照している。
    expect(b.children[2]!.marks).toEqual([b.markDefs[0]!._key]);
  });

  it("見出しを style h2 に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("h", "heading_2", { rich_text: [rt("Title")] }),
    ]);
    expect((blocks[0] as PortableTextBlock).style).toBe("h2");
  });

  it("ネストしたリストを listItem + level に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("l1", "bulleted_list_item", { rich_text: [rt("parent")] }, [
        block("l2", "bulleted_list_item", { rich_text: [rt("child")] }),
      ]),
    ]);
    expect(blocks).toHaveLength(2);
    const [parent, child] = blocks as PortableTextBlock[];
    expect(parent!.listItem).toBe("bullet");
    expect(parent!.level).toBe(1);
    expect(child!.listItem).toBe("bullet");
    expect(child!.level).toBe(2);
    expect(child!.children[0]!.text).toBe("child");
  });

  it("番号付きリストは listItem number", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("n", "numbered_list_item", { rich_text: [rt("a")] }),
    ]);
    expect((blocks[0] as PortableTextBlock).listItem).toBe("number");
  });

  it("code ブロックを言語付きで変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("c", "code", { rich_text: [rt("const x = 1")], language: "javascript" }),
    ]);
    expect(blocks[0]).toMatchObject({ _type: "code", code: "const x = 1", language: "javascript" });
  });

  it("quote を blockquote に、divider を divider ノードに変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("q", "quote", { rich_text: [rt("wise")] }),
      block("d", "divider", {}),
    ]);
    expect((blocks[0] as PortableTextBlock).style).toBe("blockquote");
    expect(blocks[1]).toMatchObject({ _type: "divider" });
  });

  it("callout を notionCallout に、色とアイコンを保持して変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("co", "callout", {
        rich_text: [rt("heads up")],
        icon: { type: "emoji", emoji: "💡" },
        color: "gray_background",
      }),
    ]);
    expect(blocks).toHaveLength(1);
    const callout = blocks[0] as NotionCalloutBlock;
    expect(callout._type).toBe("notionCallout");
    expect(callout.children.map((c) => c.text)).toEqual(["heads up"]);
    expect(callout.icon).toEqual({ type: "emoji", emoji: "💡" });
    expect(callout.color).toBe("gray_background");
  });

  it("callout の色が default のときは color を省略する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("co", "callout", { rich_text: [rt("plain")], color: "default" }),
    ]);
    expect((blocks[0] as NotionCalloutBlock).color).toBeUndefined();
  });

  it("to_do を notionTodo に、チェック状態を保持して変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("t1", "to_do", { rich_text: [rt("parent")], checked: true }, [
        block("t2", "to_do", { rich_text: [rt("child")], checked: false }),
      ]),
    ]);
    expect(blocks).toHaveLength(2);
    const [parent, child] = blocks as NotionTodoBlock[];
    expect(parent!._type).toBe("notionTodo");
    expect(parent!.checked).toBe(true);
    expect(parent!.level).toBe(1);
    expect(child!.checked).toBe(false);
    expect(child!.level).toBe(2);
  });

  it("toggle を notionToggle に、子ブロックを content として入れ子保持して変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("tg", "toggle", { rich_text: [rt("Details")] }, [
        block("p", "paragraph", { rich_text: [rt("inner")] }),
      ]),
    ]);
    expect(blocks).toHaveLength(1);
    const toggle = blocks[0] as NotionToggleBlock;
    expect(toggle._type).toBe("notionToggle");
    expect(toggle.children.map((c) => c.text)).toEqual(["Details"]);
    expect(toggle.content).toHaveLength(1);
    expect((toggle.content[0] as PortableTextBlock).children[0]!.text).toBe("inner");
  });

  it("トグル見出しは style を保ったまま toggle: true を付与する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("h", "heading_2", { rich_text: [rt("Section")], is_toggleable: true }),
    ]);
    const heading = blocks[0] as PortableTextBlock;
    expect(heading.style).toBe("h2");
    expect(heading.toggle).toBe(true);
  });

  it("heading_4/5/6 を h4/h5/h6 に変換し unsupported に記録しない", async () => {
    const { blocks, unsupported } = await notionBlocksToPortableText([
      block("h4", "heading_4", { rich_text: [rt("H4")] }),
      block("h5", "heading_5", { rich_text: [rt("H5")] }),
      block("h6", "heading_6", { rich_text: [rt("H6")] }),
    ]);
    expect((blocks[0] as PortableTextBlock).style).toBe("h4");
    expect((blocks[1] as PortableTextBlock).style).toBe("h5");
    expect((blocks[2] as PortableTextBlock).style).toBe("h6");
    expect(unsupported).toEqual([]);
  });

  it("画像を resolver 経由でメディア参照に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText(
      [
        block("i", "image", {
          type: "file",
          file: { url: "https://files/img.png" },
          caption: [rt("cap")],
        }),
      ],
      { resolveImage: async () => ({ ref: "media_9", url: "https://cdn/x.png" }) },
    );
    const img = blocks[0] as PortableTextImage;
    expect(img._type).toBe("image");
    expect(img.asset._ref).toBe("media_9");
    expect(img.asset.url).toBe("https://cdn/x.png");
    expect(img.alt).toBe("cap");
  });

  it("外部ホストの画像は resolver を呼ばず元 URL をそのまま参照する", async () => {
    let called = false;
    const { blocks } = await notionBlocksToPortableText(
      [
        block("i", "image", {
          type: "external",
          external: { url: "https://images.unsplash.com/photo-1.jpg" },
          caption: [rt("cap")],
        }),
      ],
      {
        resolveImage: async () => {
          called = true;
          return { ref: "media_9", url: "https://cdn/x.png" };
        },
      },
    );
    const img = blocks[0] as PortableTextImage;
    expect(called).toBe(false);
    expect(img.asset._ref).toBe("https://images.unsplash.com/photo-1.jpg");
    expect(img.asset.url).toBe("https://images.unsplash.com/photo-1.jpg");
  });

  it("未対応ブロックは unsupported に記録する", async () => {
    const { blocks, unsupported } = await notionBlocksToPortableText([
      block("u", "table_of_contents", {}),
    ]);
    expect(blocks).toHaveLength(0);
    expect(unsupported).toContain("table_of_contents");
  });

  it("table を emdash 標準の table 形状に変換する（列ヘッダー・行ヘッダーともに）", async () => {
    const { blocks, unsupported } = await notionBlocksToPortableText([
      block("tbl", "table", { has_column_header: true, has_row_header: true }, [
        block("r1", "table_row", { cells: [[rt("見出しA")], [rt("見出しB")]] }),
        block("r2", "table_row", { cells: [[rt("行見出し")], [rt("値")]] }),
      ]),
    ]);
    expect(blocks).toHaveLength(1);
    const table = blocks[0] as PortableTextTableBlock;
    expect(table._type).toBe("table");
    expect(table.hasHeaderRow).toBe(true);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]!.cells[0]!.content[0]!.text).toBe("見出しA");
    // has_row_header により各行の先頭セルが isHeader になる。
    expect(table.rows[0]!.cells[0]!.isHeader).toBe(true);
    expect(table.rows[0]!.cells[1]!.isHeader).toBeUndefined();
    expect(table.rows[1]!.cells[0]!.isHeader).toBe(true);
    // table_row が unsupported に混入しない。
    expect(unsupported).not.toContain("table_row");
  });

  it("table にヘッダー指定が無ければ hasHeaderRow/isHeader を省略する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("tbl", "table", { has_column_header: false, has_row_header: false }, [
        block("r1", "table_row", { cells: [[rt("a")], [rt("b")]] }),
      ]),
    ]);
    const table = blocks[0] as PortableTextTableBlock;
    expect(table.hasHeaderRow).toBeUndefined();
    expect(table.rows[0]!.cells[0]!.isHeader).toBeUndefined();
  });

  it("column_list + column を emdash 標準の columns 形状に変換する", async () => {
    const { blocks, unsupported } = await notionBlocksToPortableText([
      block("cl", "column_list", {}, [
        block("c1", "column", {}, [block("p1", "paragraph", { rich_text: [rt("左")] })]),
        block("c2", "column", {}, [block("p2", "paragraph", { rich_text: [rt("右")] })]),
      ]),
    ]);
    expect(blocks).toHaveLength(1);
    const columns = blocks[0] as PortableTextColumnsBlock;
    expect(columns._type).toBe("columns");
    expect(columns.columns).toHaveLength(2);
    expect((columns.columns[0]!.content[0] as PortableTextBlock).children[0]!.text).toBe("左");
    expect((columns.columns[1]!.content[0] as PortableTextBlock).children[0]!.text).toBe("右");
    expect(unsupported).not.toContain("column");
  });

  it("equation ブロックを生の LaTeX 文字列のまま notionEquation に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("eq", "equation", { expression: "a^2 + b^2 = c^2" }),
    ]);
    const equation = blocks[0] as NotionEquationBlock;
    expect(equation._type).toBe("notionEquation");
    expect(equation.expression).toBe("a^2 + b^2 = c^2");
  });

  it("video/audio を emdash 標準の embed 形状（provider 指定）に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("v", "video", { type: "external", external: { url: "https://e.com/v.mp4" } }),
      block("a", "audio", { type: "external", external: { url: "https://e.com/a.mp3" } }),
    ]);
    expect(blocks[0]).toMatchObject({
      _type: "embed",
      url: "https://e.com/v.mp4",
      provider: "video",
    });
    expect(blocks[1]).toMatchObject({
      _type: "embed",
      url: "https://e.com/a.mp3",
      provider: "audio",
    });
  });

  it("file（resolveFile あり）を emdash 標準の file 形状に、URL を永続化して変換する", async () => {
    const { blocks } = await notionBlocksToPortableText(
      [
        block("f", "file", {
          type: "file",
          file: { url: "https://files/doc.pdf", name: "doc.pdf" },
        }),
      ],
      { resolveFile: async () => ({ ref: "media_1", url: "https://cdn/doc.pdf" }) },
    );
    const file = blocks[0] as PortableTextFileBlock;
    expect(file._type).toBe("file");
    expect(file.url).toBe("https://cdn/doc.pdf");
    expect(file.filename).toBe("doc.pdf");
  });

  it("file（resolveFile 未指定）は元 URL のまま変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("f", "file", { type: "file", file: { url: "https://files/doc.pdf" } }),
    ]);
    expect((blocks[0] as PortableTextFileBlock).url).toBe("https://files/doc.pdf");
  });

  it("pdf を emdash 標準の file 形状に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("p", "pdf", { type: "external", external: { url: "https://e.com/x.pdf" } }),
    ]);
    expect(blocks[0]).toMatchObject({ _type: "file", url: "https://e.com/x.pdf" });
  });

  it("embed（Notion の任意 URL）を emdash 標準の embed 形状に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("e", "embed", { url: "https://youtu.be/dQw4w9WgXcQ", caption: [rt("caption")] }),
    ]);
    const embed = blocks[0] as PortableTextEmbedBlock;
    expect(embed._type).toBe("embed");
    expect(embed.url).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(embed.provider).toBeUndefined();
    expect(embed.caption).toBe("caption");
  });

  it("bookmark を fetchOgp の結果付きで notionBookmark に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText(
      [block("b", "bookmark", { url: "https://e.com", caption: [rt("cap")] })],
      {
        fetchOgp: async () => ({
          title: "Example",
          description: "desc",
          image: "https://e.com/og.png",
        }),
      },
    );
    const bookmark = blocks[0] as NotionBookmarkBlock;
    expect(bookmark._type).toBe("notionBookmark");
    expect(bookmark.kind).toBe("bookmark");
    expect(bookmark.og).toEqual({
      title: "Example",
      description: "desc",
      image: "https://e.com/og.png",
    });
    expect(bookmark.caption?.[0]!.text).toBe("cap");
  });

  it("bookmark は fetchOgp 未指定・失敗時は og が undefined のまま変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("b", "bookmark", { url: "https://e.com" }),
    ]);
    expect((blocks[0] as NotionBookmarkBlock).og).toBeUndefined();

    const { blocks: failed } = await notionBlocksToPortableText(
      [block("b2", "bookmark", { url: "https://e.com" })],
      {
        fetchOgp: async () => {
          throw new Error("network error");
        },
      },
    );
    expect((failed[0] as NotionBookmarkBlock).og).toBeUndefined();
  });

  it("link_preview も kind: link_preview で notionBookmark に変換する", async () => {
    const { blocks } = await notionBlocksToPortableText([
      block("lp", "link_preview", { url: "https://e.com" }),
    ]);
    expect((blocks[0] as NotionBookmarkBlock).kind).toBe("link_preview");
  });
});
