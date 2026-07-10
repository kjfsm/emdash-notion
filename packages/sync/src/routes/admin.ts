import { blocks, elements } from "@emdash-cms/blocks/server";
import type {
  Block,
  BlockInteraction,
  BlockResponse,
  SelectElement,
} from "@emdash-cms/blocks/server";
import type { PluginContext } from "emdash";
import type { SandboxedRouteContext } from "emdash/plugin";

import {
  applyMappingDefaults,
  CONFIG_KEYS,
  DEFAULT_AUTHOR_FIELD,
  DEFAULT_AUTHOR_PROPERTY,
  DEFAULT_BODY_FIELD,
  DEFAULT_SLUG_FIELD,
  DEFAULT_SLUG_PROPERTY,
  DEFAULT_TITLE_FIELD,
  loadConfig,
  type NotionMapping,
  type OptionItem,
} from "../config.js";
import {
  getMessages,
  isLocale,
  type Locale,
  LOCALE_CONFIG_KEY,
  type Messages,
  resolveLocale,
} from "../i18n/index.js";
import { generateWebhookToken } from "../notion/signature.js";
import { type BulkSyncResult, syncAll } from "../sync/bulk.js";
import { fetchNotionStructure, type NotionStructure } from "./notion-options.js";

/**
 * `admin.settingsSchema` は emdash@0.27.0 では実行時 UI を自動生成しない
 * （マニフェストに載るだけで消費されない）ため、Block Kit で設定フォームを自前描画する。
 * サイドバー/歯車アイコンの表示は `admin.pages` の有無で決まる（settingsSchema は無関係）。
 * ブロック/要素の組み立てには `@emdash-cms/blocks/server` のビルダー（`blocks`/`elements`）を使う
 * （React 等重い依存を含まない、プラグイン向けサーバーサイド専用サブパス）。
 */

const SAVE_CONNECTION_ACTION_ID = "save_connection";
const SAVE_WEBHOOK_ACTION_ID = "save_webhook";
const GENERATE_TOKEN_ACTION_ID = "generate_webhook_token";
const FETCH_STRUCTURE_ACTION_ID = "fetch_structure";
const MANUAL_SYNC_ACTION_ID = "manual_sync";
const SAVE_MAPPING_PREFIX = "save_mapping_";
const DELETE_MAPPING_PREFIX = "delete_mapping_";
const NEW_MAPPING_KEY = "new";

/** `emdash-plugin.jsonc` の `slug: "notion-sync"` と同じ値。webhook ルートの絶対 URL を組み立てる。 */
function buildWebhookUrl(ctx: PluginContext, token: string): string {
  return `${ctx.url("/_emdash/api/plugins/notion-sync/webhook")}?token=${encodeURIComponent(token)}`;
}

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
    ],
    submit: { label: m.saveConnection, actionId: SAVE_CONNECTION_ACTION_ID },
  });
}

/** Webhook トークンだけを扱う独立フォーム。任意設定であることが分かるよう接続フォームから分離する。 */
function webhookFormBlock(config: Awaited<ReturnType<typeof loadConfig>>, m: Messages): Block {
  return blocks.form({
    blockId: "webhook",
    fields: [
      elements.secretInput("webhookToken", m.webhookTokenLabel, {
        placeholder: config.webhookToken
          ? m.webhookTokenSetPlaceholder
          : m.webhookTokenNewPlaceholder,
      }),
    ],
    submit: { label: m.saveWebhook, actionId: SAVE_WEBHOOK_ACTION_ID },
  });
}

/** 生成直後だけ表示する、Webhook URL 案内の banner + context。 */
function tokenGeneratedBlocks(webhookUrl: string, m: Messages): Block[] {
  return [
    blocks.banner({ title: m.tokenGeneratedTitle, description: webhookUrl, variant: "default" }),
    blocks.context(m.tokenGeneratedInstruction),
  ];
}

/** `OptionItem[]` を `elements.select()` の options 形式へ変換する。 */
function toSelectOptions(items: OptionItem[]): Array<{ label: string; value: string }> {
  return items.map((item) => ({ label: item.name, value: item.id }));
}

/**
 * 選択済みデータベースの表示名を「DB名のみ」に解決する（一覧の select 自体は
 * 同名DBを区別するため引き続き `"DB名 (id)"` 形式のままにする — 見出し・概要表示側で解決する）。
 */
function resolveDatabaseName(
  databaseId: string,
  notionDatabases: OptionItem[],
  m: Messages,
): string {
  if (!databaseId) return m.mappingDatabaseUnset;
  const match = notionDatabases.find((item) => item.id === databaseId);
  if (!match) return databaseId;
  const suffix = ` (${databaseId})`;
  return match.name.endsWith(suffix) ? match.name.slice(0, -suffix.length) : match.name;
}

/**
 * 1 つの対応関係の入力フィールド。
 * WHY: `repeater` Block Kit 要素は emdash@0.27.0 の管理画面バンドルで描画されない不具合が
 * あったため、既存動作確認済みの `form`/`select`/`text_input` のみで組む（対応ごとに独立した
 * form を並べ、末尾に空欄の追加用 form を 1 つ足す構成）。
 *
 * Notion 側（databaseId/authorProperty/slugProperty）の選択肢は「Notionの構造を取得する」
 * ボタン押下時に取得して kv に保存した静的な候補（`config.notionDatabases`/`notionProperties`）
 * を使う。vendor 側の `optionsRoute` 自動 fetch は失敗が画面に見えないため使わない。
 *
 * emdash 側フィールド（title/body/author/slug）は本来 select にできない（プラグインにスキーマ
 * 照会 API が無い）が、`list-fields` ルートが「設定済みの対応関係が指すコレクションの既存
 * コンテンツ」から実際のフィールド Slug を逆引きして選択肢にする（`emdash-options.ts`）。
 * そのコレクションにまだコンテンツが無い場合は候補が出ないため、自由入力の余地を残したい
 * ときは combobox 的な代替が無く、select の空欄選択（同期しない/未指定）で妥協する。
 */
function mappingFields(
  mapping: Partial<NotionMapping>,
  m: Messages,
  notionDatabases: OptionItem[],
  notionProperties: OptionItem[],
) {
  return [
    elements.textInput("collection", m.collectionLabel, {
      placeholder: m.collectionPlaceholder,
      initialValue: mapping.collection || undefined,
    }),
    elements.select("databaseId", m.databaseLabel, toSelectOptions(notionDatabases), {
      initialValue: mapping.databaseId || undefined,
    }),
    elements.select("authorProperty", m.authorPropertyLabel, toSelectOptions(notionProperties), {
      initialValue: mapping.authorProperty || DEFAULT_AUTHOR_PROPERTY,
    }),
    dynamicSelect(
      "authorField",
      m.authorFieldLabel,
      "list-fields",
      mapping.authorField ?? DEFAULT_AUTHOR_FIELD,
    ),
    elements.select("slugProperty", m.slugPropertyLabel, toSelectOptions(notionProperties), {
      initialValue: mapping.slugProperty || DEFAULT_SLUG_PROPERTY,
    }),
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
  notionDatabases: OptionItem[],
  notionProperties: OptionItem[],
): Block[] {
  const result: Block[] = [
    blocks.form({
      blockId: `mapping-${key}`,
      fields: mappingFields(mapping ?? {}, m, notionDatabases, notionProperties),
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

function mappingSummaryLabel(
  mapping: NotionMapping,
  m: Messages,
  notionDatabases: OptionItem[],
): string {
  return m.mappingSummary(
    mapping.collection || m.mappingCollectionUnset,
    resolveDatabaseName(mapping.databaseId, notionDatabases, m),
  );
}

/**
 * 既存の対応は折りたたみ（`accordion`）にまとめ、新規追加用フォームもクリックするまで
 * 空欄を表示しない `accordion` にする。`accordion` の開閉はクライアント側のみで完結する
 * （ラウンドトリップ不要）ため、`page_load` では常に全て閉じた状態から始まる。
 * `openMappingKey` は `save_mapping_*` 成功直後の再描画でのみ渡され、保存したばかりの
 * 対応だけ開いたままにする（渡さなければ全て閉じる）。
 */
function mappingsSection(
  mappings: NotionMapping[],
  m: Messages,
  notionDatabases: OptionItem[],
  notionProperties: OptionItem[],
  openMappingKey?: number | typeof NEW_MAPPING_KEY,
): Block[] {
  const result: Block[] = [blocks.header(m.mappingsHeader), blocks.context(m.mappingsHelp)];

  if (notionDatabases.length === 0) result.push(blocks.context(m.structureNotFetchedHint));

  if (mappings.length > 0) {
    result.push(
      blocks.fields(
        mappings.map((mapping) => ({
          label: mapping.collection || m.mappingCollectionUnset,
          value: resolveDatabaseName(mapping.databaseId, notionDatabases, m),
        })),
      ),
    );
  }

  mappings.forEach((mapping, index) => {
    result.push(
      blocks.accordion({
        label: mappingSummaryLabel(mapping, m, notionDatabases),
        blocks: mappingFormBlocks(mapping, index, m, notionDatabases, notionProperties),
        defaultOpen: openMappingKey === index,
      }),
    );
  });

  result.push(
    blocks.accordion({
      label: m.addNewMapping,
      blocks: mappingFormBlocks(undefined, NEW_MAPPING_KEY, m, notionDatabases, notionProperties),
      defaultOpen: openMappingKey === NEW_MAPPING_KEY,
    }),
  );

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
  let summary = m.syncSummary(result);
  if (result.failed > 0) summary += m.syncFailuresSuffix(result.errors.slice(0, 3));
  if (result.truncated > 0) summary += m.syncTruncatedSuffix(result.truncated);
  // WHY: truncated は「次回の全量同期で自己修復される」良性の状態で、実際の失敗（failed）とは
  // 深刻度が異なる。同じ "alert" にまとめると運用者が本物の失敗と誤認しかねないため、
  // failed が無ければ truncated があっても "alert"（要注意）に留め、"error"（要対応）にはしない。
  const variant = result.failed > 0 ? "error" : result.truncated > 0 ? "alert" : "default";
  return blocks.banner({
    title: m.syncDoneTitle,
    description: summary,
    variant,
  });
}

/** 「Notionの構造を取得する」の結果を banner にする。失敗を必ず画面に見える形で出す。 */
function structureFetchBanner(structure: NotionStructure, m: Messages): Block {
  if (structure.errors.length === 0) {
    return blocks.banner({
      title: m.structureFetchedTitle,
      description: m.structureFetchedBody(structure.databases.length, structure.properties.length),
      variant: "default",
    });
  }
  return blocks.banner({
    title: m.structureFetchPartialTitle,
    description:
      m.structureFetchedBody(structure.databases.length, structure.properties.length) +
      m.structureFetchPartialSuffix(structure.errors.slice(0, 3)),
    variant: structure.databases.length === 0 ? "error" : "alert",
  });
}

async function buildBlocks(
  ctx: PluginContext,
  m: Messages,
  locale: Locale,
  syncResult?: BulkSyncResult,
  structureBanner?: Block,
  tokenGeneratedUrl?: string,
  openMappingKey?: number | typeof NEW_MAPPING_KEY,
): Promise<Block[]> {
  const config = await loadConfig(ctx);

  const result: Block[] = [
    blocks.header(m.pageTitle),
    blocks.context(m.pageIntro),

    blocks.header(m.connectionHeader),
    connectionFormBlock(config, m, locale),
    blocks.divider(),

    blocks.header(m.webhookHeader),
    blocks.context(m.webhookExplain),
    webhookFormBlock(config, m),
    blocks.context(m.webhookTokenHelp),
    blocks.actions([elements.button(GENERATE_TOKEN_ACTION_ID, m.generateTokenButton)]),
    blocks.context(m.generateTokenHelp),
    ...(tokenGeneratedUrl ? tokenGeneratedBlocks(tokenGeneratedUrl, m) : []),
    blocks.divider(),

    blocks.actions([elements.button(FETCH_STRUCTURE_ACTION_ID, m.fetchStructureButton)]),
    blocks.context(m.fetchStructureHelp),
    ...(structureBanner ? [structureBanner] : []),
    blocks.divider(),

    blocks.section(m.manualSyncSection, {
      accessory: elements.button(MANUAL_SYNC_ACTION_ID, m.manualSync, { style: "primary" }),
    }),
    ...(syncResult ? [syncResultBanner(syncResult, m)] : []),
    blocks.divider(),

    ...mappingsSection(
      config.mappings,
      m,
      config.notionDatabases,
      config.notionProperties,
      openMappingKey,
    ),
  ];

  return result;
}

function sanitizeMapping(raw: Record<string, unknown>): NotionMapping {
  return applyMappingDefaults((key) =>
    typeof raw[key] === "string" ? (raw[key] as string).trim() : "",
  );
}

/**
 * Block Kit の設定ページ。
 * - `connection` フォーム: 表示言語と Notion トークンを保存
 * - `webhook` フォーム: Webhook トークン（任意・自動同期用）を保存。生成ボタンでランダム値を発行できる
 * - Notionの構造を取得するボタン: Notion 側のデータベース/プロパティを取得して kv に保存し、
 *   `databaseId`/`authorProperty`/`slugProperty` の選択肢を更新する（結果は banner で必ず表示）
 * - 手動取得ボタン: 保存済みの全対応関係を一括同期（マッピングセクションより上に配置）
 * - 対応ごとの `mapping-<index>` フォーム: `accordion` で折りたたみ、既存の対応関係を編集・削除
 * - `mapping-new` フォーム: 同じく `accordion`（既定で閉じる）に包み、クリックするまで空欄を出さない
 */
export async function handleAdmin(
  routeCtx: SandboxedRouteContext,
  ctx: PluginContext,
): Promise<BlockResponse> {
  const interaction = routeCtx.input as BlockInteraction;
  let locale = await resolveLocale(ctx);
  let m = getMessages(locale);

  if (interaction?.type === "form_submit" && interaction.action_id === SAVE_CONNECTION_ACTION_ID) {
    const notionToken = interaction.values.notionToken;
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
    return {
      blocks: await buildBlocks(ctx, m, locale),
      toast: { message: m.tokenSaved, type: "success" },
    };
  }

  if (interaction?.type === "form_submit" && interaction.action_id === SAVE_WEBHOOK_ACTION_ID) {
    const webhookToken = interaction.values.webhookToken;
    // 空欄は「変更しない」として扱い、既存値を保持する。
    if (typeof webhookToken === "string" && webhookToken !== "")
      await ctx.kv.set(CONFIG_KEYS.webhookToken, webhookToken);
    return {
      blocks: await buildBlocks(ctx, m, locale),
      toast: { message: m.webhookSaved, type: "success" },
    };
  }

  if (interaction?.type === "block_action" && interaction.action_id === GENERATE_TOKEN_ACTION_ID) {
    const token = generateWebhookToken();
    await ctx.kv.set(CONFIG_KEYS.webhookToken, token);
    return {
      blocks: await buildBlocks(ctx, m, locale, undefined, undefined, buildWebhookUrl(ctx, token)),
      toast: { message: m.tokenGeneratedToast, type: "success" },
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
    // 保存直後の再描画で、保存したばかりの対応のアコーディオンだけ開いたままにする。
    let openMappingKey: number | typeof NEW_MAPPING_KEY = NEW_MAPPING_KEY;

    if (key === NEW_MAPPING_KEY) {
      mappings.push(mapping);
      openMappingKey = mappings.length - 1;
    } else {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < mappings.length) {
        mappings[index] = mapping;
        openMappingKey = index;
      }
    }

    await ctx.kv.set(CONFIG_KEYS.mappings, mappings);
    return {
      blocks: await buildBlocks(ctx, m, locale, undefined, undefined, undefined, openMappingKey),
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

  if (interaction?.type === "block_action" && interaction.action_id === FETCH_STRUCTURE_ACTION_ID) {
    const config = await loadConfig(ctx);
    if (!config.notionToken) {
      return {
        blocks: await buildBlocks(
          ctx,
          m,
          locale,
          undefined,
          blocks.banner({
            title: m.structureFetchNoTokenTitle,
            description: m.structureFetchNoTokenBody,
            variant: "error",
          }),
        ),
        toast: { message: m.structureFetchNoTokenTitle, type: "error" },
      };
    }

    const structure = await fetchNotionStructure(ctx);
    await ctx.kv.set(CONFIG_KEYS.notionDatabases, structure.databases);
    await ctx.kv.set(CONFIG_KEYS.notionProperties, structure.properties);
    return {
      blocks: await buildBlocks(ctx, m, locale, undefined, structureFetchBanner(structure, m)),
      toast:
        structure.errors.length > 0
          ? { message: m.structureFetchPartialTitle, type: "error" }
          : { message: m.structureFetchedToast, type: "success" },
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
