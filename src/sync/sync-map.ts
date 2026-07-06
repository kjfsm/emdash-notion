import type { PluginContext, StorageCollection } from "emdash";

/** Notion pageId ごとの同期状態。storage id には notionId をそのまま使う。 */
export interface SyncRecord {
	/** 対応する emdash コンテンツ id。 */
	emdashId: string;
	/** 最終同期時刻（ISO8601）。 */
	updatedAt: string;
	/** 最後に emdash へ書いた内容のハッシュ（無変更スキップ／ループ防止用）。 */
	hash: string;
	/** そのとき取り込んだ Notion 側 last_edited_time。 */
	notionLastEdited: string;
}

function collection(ctx: PluginContext): StorageCollection<SyncRecord> {
	return ctx.storage.syncMap as StorageCollection<SyncRecord>;
}

export function getMapping(ctx: PluginContext, notionId: string): Promise<SyncRecord | null> {
	return collection(ctx).get(notionId);
}

export function putMapping(ctx: PluginContext, notionId: string, record: SyncRecord): Promise<void> {
	return collection(ctx).put(notionId, record);
}
