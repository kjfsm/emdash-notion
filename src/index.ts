import { definePlugin } from "emdash";
import type { PluginDescriptor } from "emdash";
import { handleWebhook } from "./routes/webhook.js";

export interface NdashOptions {
	/** 既定書き込み先コレクション（未設定なら管理 UI の設定値を使う）。 */
	collection?: string;
}

/**
 * プラグイン記述子。`astro.config.mjs` の `plugins: []`（in-process、native 専用）で読み込む。
 * ネイティブ形式のため descriptor とランタイム（`createPlugin`）は同一ファイルに同居できる
 * （sandboxed と異なり実行環境が分かれないため）。
 */
export function ndashPlugin(options: NdashOptions = {}): PluginDescriptor<NdashOptions> {
	return {
		id: "ndash",
		version: "0.1.0",
		format: "native",
		entrypoint: "ndash",
		options,
	};
}

/**
 * ランタイム本体。Notion Webhook を受け取り、ページを Portable Text に変換して
 * emdash のコンテンツへ保存する（Notion → emdash 一方向。逆方向は未実装）。
 *
 * 設定（Notion トークン・Webhook 検証トークン・対象コレクション等）は
 * `admin.settingsSchema` の自動生成フォームで入力し、`ctx.kv` の `settings:` 名前空間へ
 * 自動保存される（`src/config.ts` が同じキー名で読み出す）。
 */
export function createPlugin(_options: NdashOptions = {}) {
	return definePlugin({
		id: "ndash",
		version: "0.1.0",

		capabilities: ["content:read", "content:write", "media:read", "media:write", "network:request"],
		allowedHosts: ["api.notion.com", "*.notion.so", "*.amazonaws.com", "*.notion-static.com"],

		storage: {
			// Notion pageId ↔ emdash contentId のマッピングと同期ハッシュ。
			syncMap: { indexes: ["emdashId", "updatedAt"] },
		},

		admin: {
			settingsSchema: {
				notionToken: { type: "secret", label: "Notion Integration Token" },
				webhookToken: {
					type: "secret",
					label: "Webhook URL Token",
					description: "Notion 購読 URL の ?token= に載せる共有シークレット",
				},
				databaseId: { type: "string", label: "Notion Database ID (optional)" },
				collection: { type: "string", label: "Target Collection Slug" },
				titleField: { type: "string", label: "Title Field Slug", default: "title" },
				bodyField: { type: "string", label: "Body (Portable Text) Field Slug", default: "body" },
			},
		},

		routes: {
			webhook: {
				public: true,
				handler: handleWebhook,
			},
		},
	});
}

export default createPlugin;
