import { blocks, elements } from "@emdash-cms/blocks/server";
import type { Block, BlockInteraction, BlockResponse, SelectElement } from "@emdash-cms/blocks/server";
import type { PluginContext } from "emdash";
import {
	CONFIG_KEYS,
	DEFAULT_AUTHOR_FIELD,
	DEFAULT_AUTHOR_PROPERTY,
	DEFAULT_BODY_FIELD,
	DEFAULT_SLUG_FIELD,
	DEFAULT_SLUG_PROPERTY,
	DEFAULT_TITLE_FIELD,
	loadConfig,
	type NotionMapping,
} from "../config.js";
import { syncAll, type BulkSyncResult } from "../sync/bulk.js";

/**
 * `admin.settingsSchema` は emdash@0.27.0 では実行時 UI を自動生成しない
 * （マニフェストに載るだけで消費されない）ため、Block Kit で設定フォームを自前描画する。
 * サイドバー/歯車アイコンの表示は `admin.pages` の有無で決まる（settingsSchema は無関係）。
 * ブロック/要素の組み立てには `@emdash-cms/blocks/server` のビルダー（`blocks`/`elements`）を使う
 * （React 等重い依存を含まない、プラグイン向けサーバーサイド専用サブパス）。
 */
export interface AdminRouteContext extends PluginContext {
	input: unknown;
}

const SAVE_CONNECTION_ACTION_ID = "save_connection";
const MANUAL_SYNC_ACTION_ID = "manual_sync";
const SAVE_MAPPING_PREFIX = "save_mapping_";
const DELETE_MAPPING_PREFIX = "delete_mapping_";
const NEW_MAPPING_KEY = "new";

/** `elements.select()` は `optionsRoute` を受け付けないため、戻り値にスプレッドで追加する。 */
function dynamicSelect(actionId: string, label: string, optionsRoute: string, initialValue?: string): SelectElement {
	return { ...elements.select(actionId, label, [], { initialValue }), optionsRoute };
}

function connectionFormBlock(config: Awaited<ReturnType<typeof loadConfig>>): Block {
	return blocks.form({
		blockId: "connection",
		fields: [
			elements.secretInput("notionToken", "Notion インテグレーショントークン", {
				placeholder: config.notionToken ? "設定済み（空欄のままなら変更しない）" : "secret_...",
			}),
			elements.secretInput("webhookToken", "Webhook URL トークン", {
				placeholder: config.webhookToken ? "設定済み（空欄のままなら変更しない）" : "任意の共有シークレット",
			}),
		],
		submit: { label: "トークンを保存", actionId: SAVE_CONNECTION_ACTION_ID },
	});
}

/**
 * 1 つの対応関係の入力フィールド。
 * WHY: `repeater` Block Kit 要素は emdash@0.27.0 の管理画面バンドルで描画されない不具合が
 * あったため、既存動作確認済みの `form`/`select`/`text_input` のみで組む（対応ごとに独立した
 * form を並べ、末尾に空欄の追加用 form を 1 つ足す構成）。
 *
 * emdash 側フィールド（title/body/author/slug）は本来 select にできない（プラグインにスキーマ
 * 照会 API が無い）が、`list-fields` ルートが「設定済みの対応関係が指すコレクションの既存
 * コンテンツ」から実際のフィールド Slug を逆引きして選択肢にする（`emdash-options.ts`）。
 * そのコレクションにまだコンテンツが無い場合は候補が出ないため、自由入力の余地を残したい
 * ときは combobox 的な代替が無く、select の空欄選択（同期しない/未指定）で妥協する。
 */
function mappingFields(mapping: Partial<NotionMapping>) {
	return [
		elements.textInput("collection", "emdash コレクション Slug", {
			placeholder: "posts",
			initialValue: mapping.collection || undefined,
		}),
		dynamicSelect("databaseId", "Notion データベース", "list-databases", mapping.databaseId || undefined),
		dynamicSelect("authorProperty", "著者プロパティ（Notion 側）", "list-properties", mapping.authorProperty || DEFAULT_AUTHOR_PROPERTY),
		dynamicSelect("authorField", "著者フィールド Slug（emdash 側・未選択なら同期しない）", "list-fields", mapping.authorField ?? DEFAULT_AUTHOR_FIELD),
		dynamicSelect("slugProperty", "slug プロパティ（Notion 側）", "list-properties", mapping.slugProperty || DEFAULT_SLUG_PROPERTY),
		dynamicSelect("slugField", "slug フィールド Slug（emdash 側・未選択なら同期しない）", "list-fields", mapping.slugField ?? DEFAULT_SLUG_FIELD),
		dynamicSelect("titleField", "タイトルフィールド Slug（emdash 側）", "list-fields", mapping.titleField || DEFAULT_TITLE_FIELD),
		dynamicSelect("bodyField", "本文（Portable Text）フィールド Slug（emdash 側）", "list-fields", mapping.bodyField || DEFAULT_BODY_FIELD),
	];
}

/** 1 件の対応関係を表す form ブロック（+既存分には削除ボタンの actions ブロック）を返す。 */
function mappingFormBlocks(mapping: Partial<NotionMapping> | undefined, key: number | typeof NEW_MAPPING_KEY): Block[] {
	const result: Block[] = [
		blocks.form({
			blockId: `mapping-${key}`,
			fields: mappingFields(mapping ?? {}),
			submit: {
				label: key === NEW_MAPPING_KEY ? "対応を追加" : "この対応を保存",
				actionId: `${SAVE_MAPPING_PREFIX}${key}`,
			},
		}),
	];

	if (key !== NEW_MAPPING_KEY) {
		result.push(blocks.actions([elements.button(`${DELETE_MAPPING_PREFIX}${key}`, "この対応を削除", { style: "danger" })]));
	}

	return result;
}

function mappingsSection(mappings: NotionMapping[]): Block[] {
	const result: Block[] = [
		blocks.header("コレクション ⇔ Notion データベースの対応"),
		blocks.context(
			"emdash コレクション Slug は管理画面の「コンテンツタイプ」で確認できます。タイトル/本文/著者/slug のフィールド Slug は、既にコンテンツがあるコレクションなら候補から選べます。",
		),
	];

	mappings.forEach((mapping, index) => {
		result.push(blocks.context(`対応 ${index + 1}: ${mapping.collection || "(未設定)"}`));
		result.push(...mappingFormBlocks(mapping, index));
		result.push(blocks.divider());
	});

	result.push(blocks.context("新しい対応を追加"));
	result.push(...mappingFormBlocks(undefined, NEW_MAPPING_KEY));

	return result;
}

function syncResultBanner(result: BulkSyncResult): Block {
	if (result.errors.length > 0 && result.total === 0) {
		return blocks.banner({ title: "手動取得に失敗しました", description: result.errors.join(" / "), variant: "error" });
	}
	const description =
		`対象 ${result.total} 件中 — 新規作成 ${result.created} / 更新 ${result.updated} / ` +
		`変更なし ${result.unchanged} / スキップ ${result.skipped} / 失敗 ${result.failed}`;
	return blocks.banner({
		title: "手動取得が完了しました",
		description: result.failed > 0 ? `${description}（失敗: ${result.errors.slice(0, 3).join(" / ")}）` : description,
		variant: result.failed > 0 ? "alert" : "default",
	});
}

async function buildBlocks(ctx: PluginContext, syncResult?: BulkSyncResult): Promise<Block[]> {
	const config = await loadConfig(ctx);

	const result: Block[] = [
		blocks.header("ndash — Notion 同期設定"),
		blocks.context("① トークンを保存 → ② 対応を追加/編集 → ③ 手動取得で試す、の順に進めてください。"),
		connectionFormBlock(config),
		blocks.divider(),
		...mappingsSection(config.mappings),
		blocks.divider(),
		blocks.section("Notion 側の変更を今すぐ取得して emdash へ反映します（設定済みの対応関係すべてが対象）。", {
			accessory: elements.button(MANUAL_SYNC_ACTION_ID, "手動取得", { style: "primary" }),
		}),
	];

	if (syncResult) result.push(syncResultBanner(syncResult));

	return result;
}

function sanitizeMapping(raw: Record<string, unknown>): NotionMapping {
	const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).trim() : "");
	return {
		collection: str("collection"),
		databaseId: str("databaseId"),
		titleField: str("titleField") || DEFAULT_TITLE_FIELD,
		bodyField: str("bodyField") || DEFAULT_BODY_FIELD,
		authorProperty: str("authorProperty") || DEFAULT_AUTHOR_PROPERTY,
		authorField: str("authorField"),
		slugProperty: str("slugProperty") || DEFAULT_SLUG_PROPERTY,
		slugField: str("slugField"),
	};
}

/**
 * Block Kit の設定ページ。
 * - `connection` フォーム: トークンを保存（保存後、`list-databases`/`list-properties`/`list-fields` の
 *   optionsRoute が最新の設定で Notion/emdash を検索し、下のセレクトを埋める）
 * - 対応ごとの `mapping-<index>` フォーム: 既存の対応関係を編集・削除
 * - `mapping-new` フォーム: 新しい対応関係を追加
 * - 手動取得ボタン: 保存済みの全対応関係を一括同期
 */
export async function handleAdmin(ctx: AdminRouteContext): Promise<BlockResponse> {
	const interaction = ctx.input as BlockInteraction;

	if (interaction?.type === "form_submit" && interaction.action_id === SAVE_CONNECTION_ACTION_ID) {
		const notionToken = interaction.values.notionToken;
		const webhookToken = interaction.values.webhookToken;
		// 空欄は「変更しない」として扱い、既存値を保持する。
		if (typeof notionToken === "string" && notionToken !== "") await ctx.kv.set(CONFIG_KEYS.notionToken, notionToken);
		if (typeof webhookToken === "string" && webhookToken !== "") await ctx.kv.set(CONFIG_KEYS.webhookToken, webhookToken);
		return {
			blocks: await buildBlocks(ctx),
			toast: { message: "トークンを保存しました", type: "success" },
		};
	}

	if (interaction?.type === "form_submit" && interaction.action_id.startsWith(SAVE_MAPPING_PREFIX)) {
		const key = interaction.action_id.slice(SAVE_MAPPING_PREFIX.length);
		const config = await loadConfig(ctx);
		const mapping = sanitizeMapping(interaction.values);
		const mappings = [...config.mappings];

		if (key === NEW_MAPPING_KEY) {
			mappings.push(mapping);
		} else {
			const index = Number(key);
			if (Number.isInteger(index) && index >= 0 && index < mappings.length) mappings[index] = mapping;
		}

		await ctx.kv.set(CONFIG_KEYS.mappings, mappings);
		return {
			blocks: await buildBlocks(ctx),
			toast: { message: key === NEW_MAPPING_KEY ? "対応を追加しました" : "対応を保存しました", type: "success" },
		};
	}

	if (interaction?.type === "block_action" && interaction.action_id.startsWith(DELETE_MAPPING_PREFIX)) {
		const index = Number(interaction.action_id.slice(DELETE_MAPPING_PREFIX.length));
		const config = await loadConfig(ctx);
		const mappings = config.mappings.filter((_, i) => i !== index);
		await ctx.kv.set(CONFIG_KEYS.mappings, mappings);
		return {
			blocks: await buildBlocks(ctx),
			toast: { message: "対応を削除しました", type: "success" },
		};
	}

	if (interaction?.type === "block_action" && interaction.action_id === MANUAL_SYNC_ACTION_ID) {
		const result = await syncAll(ctx);
		return {
			blocks: await buildBlocks(ctx, result),
			toast:
				result.failed > 0 || (result.total === 0 && result.errors.length > 0)
					? { message: "一部のページで失敗しました", type: "error" }
					: { message: "手動取得が完了しました", type: "success" },
		};
	}

	return { blocks: await buildBlocks(ctx) };
}
