import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { expect, it } from "vitest";

import type {
  NotionBlock,
  NotionDatabase,
  NotionPage,
  NotionRichText,
} from "../src/notion/types.js";

/**
 * notion/types.ts は Notion レスポンスの「読む部分だけ」を写した緩い最小型。
 * 実 API とのドリフトを検知するため、公式 `@notionhq/client` の厳密なレスポンス型が
 * 本ファイルの最小型へ**代入可能**であること（= 我々が読むフィールドが公式型にも存在し
 * 形が食い違わないこと）を型レベルで検証する。公式型が変わって食い違えば `pnpm typecheck`
 * が落ちる。ランタイムには一切影響しない（`import type` のみ）。
 */
type AssignableTo<Sub, Super> = Sub extends Super
  ? true
  : { readonly __error: "not assignable"; sub: Sub; super: Super };

// 各代入が型エラーにならなければ、公式レスポンス型 → 最小型の構造互換が保たれている。
const _pageParity: AssignableTo<PageObjectResponse, NotionPage> = true;
const _blockParity: AssignableTo<BlockObjectResponse, NotionBlock> = true;
const _richTextParity: AssignableTo<RichTextItemResponse, NotionRichText> = true;
const _databaseParity: AssignableTo<DatabaseObjectResponse, NotionDatabase> = true;

it("公式 Notion レスポンス型が notion/types.ts の最小型へ代入可能である", () => {
  // 実体は上の型レベル代入（`pnpm typecheck` で検証）。ここでは代入が成立した事実だけ確認する。
  expect([_pageParity, _blockParity, _richTextParity, _databaseParity]).toEqual([
    true,
    true,
    true,
    true,
  ]);
});
