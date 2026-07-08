import type { PluginContext, StorageCollection } from "emdash";

/** Notion pageId ごとの同期状態。storage id には notionId をそのまま使う。 */
export interface SyncRecord {
  /** 対応する emdash コンテンツ id。予約中（`pending`）は空文字。 */
  emdashId: string;
  /** 最終同期時刻（ISO8601）。 */
  updatedAt: string;
  /** 最後に emdash へ書いた内容のハッシュ（無変更スキップ／ループ防止用）。 */
  hash: string;
  /** そのとき取り込んだ Notion 側 last_edited_time。 */
  notionLastEdited: string;
  /** そのとき本文がリクエスト予算超過で欠落していたか。unchanged 判定でも保持し続ける必要がある。 */
  truncated?: boolean;
  /**
   * 新規作成の予約中フラグ。true の間は他リクエストからは「未取り込み」として扱われず、
   * 二重作成を避けるため取り込みを中断する（`ingest.ts` の冪等性ガード参照）。
   */
  pending?: boolean;
  /** 予約の所有者を識別するランダム値。再読込時に自分の予約がまだ有効か確認するために使う。 */
  claimId?: string;
}

function collection(ctx: PluginContext): StorageCollection<SyncRecord> {
  return ctx.storage.syncMap as StorageCollection<SyncRecord>;
}

export function getMapping(ctx: PluginContext, notionId: string): Promise<SyncRecord | null> {
  return collection(ctx).get(notionId);
}

export function putMapping(
  ctx: PluginContext,
  notionId: string,
  record: SyncRecord,
): Promise<void> {
  return collection(ctx).put(notionId, record);
}

/** 予約（`pending`）が失敗に終わった場合に、次回やり直せるようレコードごと消す。 */
export function deleteMapping(ctx: PluginContext, notionId: string): Promise<boolean> {
  return collection(ctx).delete(notionId);
}
