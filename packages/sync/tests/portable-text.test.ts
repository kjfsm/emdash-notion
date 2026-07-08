import { describe, expect, it } from "vitest";

import type { NotionBlock, NotionRichText } from "../src/notion/types.js";
import { notionBlocksToPortableText } from "../src/portable-text/from-notion.js";
import type {
  NotionCalloutBlock,
  NotionTodoBlock,
  NotionToggleBlock,
  PortableTextBlock,
  PortableTextImage,
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

  it("未対応ブロックは unsupported に記録する", async () => {
    const { blocks, unsupported } = await notionBlocksToPortableText([
      block("u", "table_of_contents", {}),
    ]);
    expect(blocks).toHaveLength(0);
    expect(unsupported).toContain("table_of_contents");
  });
});
