import type { PluginContext } from "emdash";

/**
 * プラグイン設定。Block Kit の設定ページ（`routes/admin.ts`）が `settings:` プレフィックスで
 * kv に保存する。action_id とキー名を 1 対 1 対応させている。
 */
export interface NdashConfig {
	/** Notion internal integration token（`secret_...`）。 */
	notionToken: string;
	/** Notion 購読 URL の `?token=` に載せる共有シークレット（Webhook 検証用）。 */
	webhookToken: string;
	/** 監視対象の Notion データベース（data source）id。空なら全 page を受け付ける。 */
	databaseId: string;
	/** 書き込み先の emdash コレクション slug。 */
	collection: string;
	/** タイトルを書き込むフィールド slug。 */
	titleField: string;
	/** Portable Text 本文を書き込むフィールド slug。 */
	bodyField: string;
}

export const CONFIG_KEYS = {
	notionToken: "settings:notionToken",
	webhookToken: "settings:webhookToken",
	databaseId: "settings:databaseId",
	collection: "settings:collection",
	titleField: "settings:titleField",
	bodyField: "settings:bodyField",
} as const;

const DEFAULT_TITLE_FIELD = "title";
const DEFAULT_BODY_FIELD = "body";

/** kv から設定を読み出す。未設定フィールドは既定値または空文字で埋める。 */
export async function loadConfig(ctx: PluginContext): Promise<NdashConfig> {
	const [notionToken, webhookToken, databaseId, collection, titleField, bodyField] =
		await Promise.all([
			ctx.kv.get<string>(CONFIG_KEYS.notionToken),
			ctx.kv.get<string>(CONFIG_KEYS.webhookToken),
			ctx.kv.get<string>(CONFIG_KEYS.databaseId),
			ctx.kv.get<string>(CONFIG_KEYS.collection),
			ctx.kv.get<string>(CONFIG_KEYS.titleField),
			ctx.kv.get<string>(CONFIG_KEYS.bodyField),
		]);

	return {
		notionToken: notionToken ?? "",
		webhookToken: webhookToken ?? "",
		databaseId: databaseId ?? "",
		collection: collection ?? "",
		titleField: titleField ?? DEFAULT_TITLE_FIELD,
		bodyField: bodyField ?? DEFAULT_BODY_FIELD,
	};
}

/** 同期に最低限必要な設定が揃っているか。 */
export function isConfigReady(config: NdashConfig): boolean {
	return config.notionToken !== "" && config.collection !== "";
}
