import type {
  NotionBookmarkBlock,
  NotionCalloutBlock,
  NotionEquationBlock,
  NotionTodoBlock,
  NotionToggleBlock,
} from "@emdash-notion/sync/portable-text";
import { expect, it } from "vitest";

/**
 * notion-blocks の各 Astro コンポーネントは Props をインラインで手書きしている（生ソース配布のため）。
 * その形状が notion-sync の出力型（単一情報源）とズレないことを型レベルで検証する。
 * ここでズレると `pnpm typecheck` が落ちる。ランタイムには影響しない（`import type` のみ）。
 *
 * 各 Astro の `Props["node"]` に相当する形をローカルに再掲し、sync の正準型が代入可能か確かめる。
 */
type CalloutNode = {
  _key: string;
  children: unknown[];
  markDefs: unknown[];
  icon?: { type: "emoji" | "external" | "file"; emoji?: string; url?: string };
  color?: string;
};
type TodoNode = { _key: string; children: unknown[]; markDefs: unknown[]; checked: boolean };
type ToggleNode = { _key: string; children: unknown[]; markDefs: unknown[]; content: unknown[] };
type EquationNode = { _key: string; expression: string };
type BookmarkNode = {
  _key: string;
  kind: "bookmark" | "link_preview";
  url: string;
  caption?: unknown[];
  markDefs?: unknown[];
  og?: { title?: string; description?: string; image?: string; siteName?: string };
};

type AssignableTo<Sub, Super> = Sub extends Super
  ? true
  : { readonly __error: "notion-blocks の Props が sync の出力型からズレています"; sub: Sub };

// sync の正準型 → blocks の Props node 形状 への代入可能性（描画側が読むフィールドを網羅している）。
const _callout: AssignableTo<NotionCalloutBlock, CalloutNode> = true;
const _todo: AssignableTo<NotionTodoBlock, TodoNode> = true;
const _toggle: AssignableTo<NotionToggleBlock, ToggleNode> = true;
const _equation: AssignableTo<NotionEquationBlock, EquationNode> = true;
const _bookmark: AssignableTo<NotionBookmarkBlock, BookmarkNode> = true;

it("notion-blocks の Props は notion-sync の出力型と構造一致する", () => {
  expect([_callout, _todo, _toggle, _equation, _bookmark]).toEqual([true, true, true, true, true]);
});
