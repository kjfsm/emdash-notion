import { blocks, elements } from "@emdash-cms/blocks/server";
import type {
  Block,
  BlockInteraction,
  BlockResponse,
  SelectElement,
} from "@emdash-cms/blocks/server";
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
  STATE_KEYS,
} from "../config.js";
import {
  getMessages,
  isLocale,
  type Locale,
  LOCALE_CONFIG_KEY,
  type Messages,
  resolveLocale,
} from "../i18n/index.js";
import { type BulkSyncResult, syncAll } from "../sync/bulk.js";

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
function dynamicSelect(
  actionId: string,
  label: string,
  optionsRoute: string,
  initialValue?: string,
): SelectElement {
  return { ...elements.select(actionId, label, [], { initialValue }), optionsRoute };
}

function connectionFormBlock(
  config: Awaited<ReturnType<typeof loadConfig>>,
  m: Messages,
  locale: Locale,
): Block {
  return blocks.form({
    blockId: "connection",
    fields: [
      elements.select(
        "locale",
        m.languageLabel,
        [
          { label: "English", value: "en" },
          { label: "日本語", value: "ja" },
        ],
        { initialValue: locale },
      ),
      elements.secretInput("notionToken", m.notionTokenLabel, {
        placeholder: config.notionToken ? m.notionTokenSetPlaceholder : m.notionTokenNewPlaceholder,
      }),
      elements.secretInput("webhookToken", m.webhookTokenLabel, {
        placeholder: config.webhookToken
          ? m.webhookTokenSetPlaceholder
          : m.webhookTokenNewPlaceholder,
      }),
    ],
    submit: { label: m.saveConnection, actionId: SAVE_CONNECTION_ACTION_ID },
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
function mappingFields(mapping: Partial<NotionMapping>, m: Messages) {
  return [
    elements.textInput("collection", m.collectionLabel, {
      placeholder: m.collectionPlaceholder,
      initialValue: mapping.collection || undefined,
    }),
    dynamicSelect("databaseId", m.databaseLabel, "list-databases", mapping.databaseId || undefined),
    dynamicSelect(
      "authorProperty",
      m.authorPropertyLabel,
      "list-properties",
      mapping.authorProperty || DEFAULT_AUTHOR_PROPERTY,
    ),
    dynamicSelect(
      "authorField",
      m.authorFieldLabel,
      "list-fields",
      mapping.authorField ?? DEFAULT_AUTHOR_FIELD,
    ),
    dynamicSelect(
      "slugProperty",
      m.slugPropertyLabel,
      "list-properties",
      mapping.slugProperty || DEFAULT_SLUG_PROPERTY,
    ),
    dynamicSelect(
      "slugField",
      m.slugFieldLabel,
      "list-fields",
      mapping.slugField ?? DEFAULT_SLUG_FIELD,
    ),
    dynamicSelect(
      "titleField",
      m.titleFieldLabel,
      "list-fields",
      mapping.titleField || DEFAULT_TITLE_FIELD,
    ),
    dynamicSelect(
      "bodyField",
      m.bodyFieldLabel,
      "list-fields",
      mapping.bodyField || DEFAULT_BODY_FIELD,
    ),
  ];
}

/** 1 件の対応関係を表す form ブロック（+既存分には削除ボタンの actions ブロック）を返す。 */
function mappingFormBlocks(
  mapping: Partial<NotionMapping> | undefined,
  key: number | typeof NEW_MAPPING_KEY,
  m: Messages,
): Block[] {
  const result: Block[] = [
    blocks.form({
      blockId: `mapping-${key}`,
      fields: mappingFields(mapping ?? {}, m),
      submit: {
        label: key === NEW_MAPPING_KEY ? m.addMapping : m.saveMapping,
        actionId: `${SAVE_MAPPING_PREFIX}${key}`,
      },
    }),
  ];

  if (key !== NEW_MAPPING_KEY) {
    result.push(
      blocks.actions([
        elements.button(`${DELETE_MAPPING_PREFIX}${key}`, m.deleteMapping, { style: "danger" }),
      ]),
    );
  }

  return result;
}

function mappingsSection(mappings: NotionMapping[], m: Messages): Block[] {
  const result: Block[] = [blocks.header(m.mappingsHeader), blocks.context(m.mappingsHelp)];

  mappings.forEach((mapping, index) => {
    result.push(blocks.context(m.mappingLabel(index, mapping.collection)));
    result.push(...mappingFormBlocks(mapping, index, m));
    result.push(blocks.divider());
  });

  result.push(blocks.context(m.addNewMapping));
  result.push(...mappingFormBlocks(undefined, NEW_MAPPING_KEY, m));

  return result;
}

function syncResultBanner(result: BulkSyncResult, m: Messages): Block {
  if (result.errors.length > 0 && result.total === 0) {
    return blocks.banner({
      title: m.syncFailedTitle,
      description: result.errors.join(" / "),
      variant: "error",
    });
  }
  const summary = m.syncSummary(result);
  return blocks.banner({
    title: m.syncDoneTitle,
    description:
      result.failed > 0 ? summary + m.syncFailuresSuffix(result.errors.slice(0, 3)) : summary,
    variant: result.failed > 0 ? "alert" : "default",
  });
}

async function buildBlocks(
  ctx: PluginContext,
  m: Messages,
  locale: Locale,
  syncResult?: BulkSyncResult,
): Promise<Block[]> {
  const config = await loadConfig(ctx);
  const verificationToken = await ctx.kv.get<string>(STATE_KEYS.verificationToken);

  const result: Block[] = [blocks.header(m.pageTitle), blocks.context(m.pageIntro)];

  // Notion の購読作成ハンドシェイクで届いたトークンを表示し、Notion 側への貼り戻しを促す。
  if (verificationToken) {
    result.push(
      blocks.banner({
        title: m.verificationReceivedTitle,
        description: m.verificationReceivedDescription,
        variant: "alert",
      }),
      blocks.code({ code: verificationToken }),
    );
  }

  result.push(
    connectionFormBlock(config, m, locale),
    blocks.divider(),
    ...mappingsSection(config.mappings, m),
    blocks.divider(),
    blocks.section(m.manualSyncSection, {
      accessory: elements.button(MANUAL_SYNC_ACTION_ID, m.manualSync, { style: "primary" }),
    }),
  );

  if (syncResult) result.push(syncResultBanner(syncResult, m));

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
 * - `connection` フォーム: 表示言語とトークンを保存（保存後、`list-databases`/`list-properties`/`list-fields`
 *   の optionsRoute が最新の設定で Notion/emdash を検索し、下のセレクトを埋める）
 * - 対応ごとの `mapping-<index>` フォーム: 既存の対応関係を編集・削除
 * - `mapping-new` フォーム: 新しい対応関係を追加
 * - 手動取得ボタン: 保存済みの全対応関係を一括同期
 */
export async function handleAdmin(ctx: AdminRouteContext): Promise<BlockResponse> {
  const interaction = ctx.input as BlockInteraction;
  let locale = await resolveLocale(ctx);
  let m = getMessages(locale);

  if (interaction?.type === "form_submit" && interaction.action_id === SAVE_CONNECTION_ACTION_ID) {
    const notionToken = interaction.values.notionToken;
    const webhookToken = interaction.values.webhookToken;
    const selectedLocale = interaction.values.locale;
    // 表示言語は選択されていれば保存し、応答ブロックも新しい言語で描画する。
    if (isLocale(selectedLocale) && selectedLocale !== locale) {
      await ctx.kv.set(LOCALE_CONFIG_KEY, selectedLocale);
      locale = selectedLocale;
      m = getMessages(locale);
    }
    // 空欄は「変更しない」として扱い、既存値を保持する。
    if (typeof notionToken === "string" && notionToken !== "")
      await ctx.kv.set(CONFIG_KEYS.notionToken, notionToken);
    if (typeof webhookToken === "string" && webhookToken !== "")
      await ctx.kv.set(CONFIG_KEYS.webhookToken, webhookToken);
    return {
      blocks: await buildBlocks(ctx, m, locale),
      toast: { message: m.tokenSaved, type: "success" },
    };
  }

  if (
    interaction?.type === "form_submit" &&
    interaction.action_id.startsWith(SAVE_MAPPING_PREFIX)
  ) {
    const key = interaction.action_id.slice(SAVE_MAPPING_PREFIX.length);
    const config = await loadConfig(ctx);
    const mapping = sanitizeMapping(interaction.values);
    const mappings = [...config.mappings];

    if (key === NEW_MAPPING_KEY) {
      mappings.push(mapping);
    } else {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < mappings.length)
        mappings[index] = mapping;
    }

    await ctx.kv.set(CONFIG_KEYS.mappings, mappings);
    return {
      blocks: await buildBlocks(ctx, m, locale),
      toast: {
        message: key === NEW_MAPPING_KEY ? m.mappingAdded : m.mappingSaved,
        type: "success",
      },
    };
  }

  if (
    interaction?.type === "block_action" &&
    interaction.action_id.startsWith(DELETE_MAPPING_PREFIX)
  ) {
    const index = Number(interaction.action_id.slice(DELETE_MAPPING_PREFIX.length));
    const config = await loadConfig(ctx);
    const mappings = config.mappings.filter((_, i) => i !== index);
    await ctx.kv.set(CONFIG_KEYS.mappings, mappings);
    return {
      blocks: await buildBlocks(ctx, m, locale),
      toast: { message: m.mappingDeleted, type: "success" },
    };
  }

  if (interaction?.type === "block_action" && interaction.action_id === MANUAL_SYNC_ACTION_ID) {
    const result = await syncAll(ctx, m);
    return {
      blocks: await buildBlocks(ctx, m, locale, result),
      toast:
        result.failed > 0 || (result.total === 0 && result.errors.length > 0)
          ? { message: m.syncPartialFailToast, type: "error" }
          : { message: m.syncDoneToast, type: "success" },
    };
  }

  return { blocks: await buildBlocks(ctx, m, locale) };
}
