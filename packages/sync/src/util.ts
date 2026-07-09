/** 例外を表示用メッセージへ変換する。Error なら message、それ以外は String() 化する。 */
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
