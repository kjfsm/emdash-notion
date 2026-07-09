/**
 * Notion のページング応答から次カーソルを取り出す。続きが無ければ undefined を返し、
 * `do { ... } while (cursor)` ループの終了条件に使う。
 */
export function nextCursor(res: {
  has_more: boolean;
  next_cursor: string | null;
}): string | undefined {
  return res.has_more && res.next_cursor ? res.next_cursor : undefined;
}
