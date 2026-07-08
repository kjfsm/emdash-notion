import { describe, expect, it } from "vitest";

import { createPlugin, notionBlocksPlugin } from "../src/index.js";

describe("notionBlocksPlugin() descriptor", () => {
  it("returns a valid PluginDescriptor", () => {
    const descriptor = notionBlocksPlugin();
    expect(descriptor.id).toBe("notion-blocks");
    expect(descriptor.version).toBe("0.1.0");
    expect(descriptor.format).toBe("native");
    expect(descriptor.entrypoint).toBe("@emdash-notion/blocks");
  });

  it("declares componentsEntry pointing to ./astro export", () => {
    const descriptor = notionBlocksPlugin();
    expect(descriptor.componentsEntry).toBe("@emdash-notion/blocks/astro");
  });

  it("declares no capabilities", () => {
    const descriptor = notionBlocksPlugin();
    expect(descriptor.capabilities).toEqual([]);
  });
});

describe("createPlugin() native definition", () => {
  it("returns a definition with id and version", () => {
    const definition = createPlugin();
    expect(definition.id).toBe("notion-blocks");
    expect(definition.version).toBe("0.1.0");
  });

  it("returns a fully normalized ResolvedPlugin shape", () => {
    const definition = createPlugin();
    expect(definition.capabilities).toEqual([]);
    expect(definition.allowedHosts).toEqual([]);
    expect(definition.storage).toEqual({});
    expect(definition.routes).toEqual({});
  });

  it("declares one portableTextBlocks entry per notion-sync カスタムブロック型", () => {
    const definition = createPlugin();
    const blocks = definition.admin?.portableTextBlocks;
    expect(blocks).toBeDefined();
    expect(blocks!.map((b) => b.type)).toEqual([
      "notionCallout",
      "notionTodo",
      "notionToggle",
      "notionEquation",
      "notionBookmark",
    ]);
  });

  it("各ブロックはラベルとアイコンのみを宣言する（手動編集は非対応）", () => {
    const definition = createPlugin();
    for (const block of definition.admin!.portableTextBlocks!) {
      expect(typeof block.label).toBe("string");
      expect(typeof block.icon).toBe("string");
      expect(block.fields).toBeUndefined();
    }
  });
});

describe("descriptor and definition consistency", () => {
  it("descriptor and definition share the same id", () => {
    const descriptor = notionBlocksPlugin();
    const definition = createPlugin();
    expect(descriptor.id).toBe(definition.id);
  });

  it("descriptor and definition share the same version", () => {
    const descriptor = notionBlocksPlugin();
    const definition = createPlugin();
    expect(descriptor.version).toBe(definition.version);
  });
});
