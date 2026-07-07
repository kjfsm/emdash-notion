import type { Locale } from "./index.js";

export interface SyncCounts {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

/**
 * 管理画面（Block Kit）に表示する文字列束。ログや throw する Error 等の
 * 開発者向けメッセージは英語のまま別扱いとし、ここには利用者向け UI 文字列のみを置く。
 */
export interface Messages {
  pageTitle: string;
  pageIntro: string;
  languageLabel: string;

  notionTokenLabel: string;
  notionTokenSetPlaceholder: string;
  notionTokenNewPlaceholder: string;
  webhookTokenLabel: string;
  webhookTokenSetPlaceholder: string;
  webhookTokenNewPlaceholder: string;
  saveConnection: string;

  collectionLabel: string;
  collectionPlaceholder: string;
  databaseLabel: string;
  authorPropertyLabel: string;
  authorFieldLabel: string;
  slugPropertyLabel: string;
  slugFieldLabel: string;
  titleFieldLabel: string;
  bodyFieldLabel: string;

  addMapping: string;
  saveMapping: string;
  deleteMapping: string;

  mappingsHeader: string;
  mappingsHelp: string;
  mappingLabel: (index: number, collection: string) => string;
  addNewMapping: string;

  manualSyncSection: string;
  manualSync: string;

  syncFailedTitle: string;
  syncDoneTitle: string;
  syncSummary: (counts: SyncCounts) => string;
  syncFailuresSuffix: (errors: string[]) => string;

  tokenSaved: string;
  mappingAdded: string;
  mappingSaved: string;
  mappingDeleted: string;
  syncDoneToast: string;
  syncPartialFailToast: string;

  configMissing: string;
}

const en: Messages = {
  pageTitle: "ndash — Notion sync settings",
  pageIntro: "Follow the steps: ① Save tokens → ② Add/edit mappings → ③ Try a manual fetch.",
  languageLabel: "Language",

  notionTokenLabel: "Notion integration token",
  notionTokenSetPlaceholder: "Saved (leave blank to keep unchanged)",
  notionTokenNewPlaceholder: "secret_...",
  webhookTokenLabel: "Webhook URL token",
  webhookTokenSetPlaceholder: "Saved (leave blank to keep unchanged)",
  webhookTokenNewPlaceholder: "Any shared secret",
  saveConnection: "Save tokens",

  collectionLabel: "EmDash Collection",
  collectionPlaceholder: "posts",
  databaseLabel: "Notion Database",
  authorPropertyLabel: "Author property (Notion side)",
  authorFieldLabel: "Author field slug (emdash side — leave unset to skip)",
  slugPropertyLabel: "Slug property (Notion side)",
  slugFieldLabel: "Slug field slug (emdash side — leave unset to skip)",
  titleFieldLabel: "Title field slug (emdash side)",
  bodyFieldLabel: "Body (Portable Text) field slug (emdash side)",

  addMapping: "Add mapping",
  saveMapping: "Save this mapping",
  deleteMapping: "Delete this mapping",

  mappingsHeader: "Collection ⇔ Notion database mappings",
  mappingsHelp:
    "You can find the emdash collection slug under “Content types” in the admin. Title/body/author/slug field slugs can be picked from candidates once the collection already has content.",
  mappingLabel: (index, collection) => `Mapping ${index + 1}: ${collection || "(unset)"}`,
  addNewMapping: "Add a new mapping",

  manualSyncSection:
    "Fetch the latest changes from Notion now and reflect them into emdash (targets every configured mapping).",
  manualSync: "Manual fetch",

  syncFailedTitle: "Manual fetch failed",
  syncDoneTitle: "Manual fetch complete",
  syncSummary: (c) =>
    `${c.total} target(s) — created ${c.created} / updated ${c.updated} / ` +
    `unchanged ${c.unchanged} / skipped ${c.skipped} / failed ${c.failed}`,
  syncFailuresSuffix: (errors) => ` (failed: ${errors.join(" / ")})`,

  tokenSaved: "Tokens saved",
  mappingAdded: "Mapping added",
  mappingSaved: "Mapping saved",
  mappingDeleted: "Mapping deleted",
  syncDoneToast: "Manual fetch complete",
  syncPartialFailToast: "Some pages failed",

  configMissing:
    "Plugin not configured (enter the Notion token and at least one collection ⇔ database mapping)",
};

const ja: Messages = {
  pageTitle: "ndash — Notion 同期設定",
  pageIntro: "① トークンを保存 → ② 対応を追加/編集 → ③ 手動取得で試す、の順に進めてください。",
  languageLabel: "言語 / Language",

  notionTokenLabel: "Notion インテグレーショントークン",
  notionTokenSetPlaceholder: "設定済み（空欄のままなら変更しない）",
  notionTokenNewPlaceholder: "secret_...",
  webhookTokenLabel: "Webhook URL トークン",
  webhookTokenSetPlaceholder: "設定済み（空欄のままなら変更しない）",
  webhookTokenNewPlaceholder: "任意の共有シークレット",
  saveConnection: "トークンを保存",

  collectionLabel: "EmDash Collection",
  collectionPlaceholder: "posts",
  databaseLabel: "Notion Database",
  authorPropertyLabel: "著者プロパティ（Notion 側）",
  authorFieldLabel: "著者フィールド Slug（emdash 側・未選択なら同期しない）",
  slugPropertyLabel: "slug プロパティ（Notion 側）",
  slugFieldLabel: "slug フィールド Slug（emdash 側・未選択なら同期しない）",
  titleFieldLabel: "タイトルフィールド Slug（emdash 側）",
  bodyFieldLabel: "本文（Portable Text）フィールド Slug（emdash 側）",

  addMapping: "対応を追加",
  saveMapping: "この対応を保存",
  deleteMapping: "この対応を削除",

  mappingsHeader: "コレクション ⇔ Notion データベースの対応",
  mappingsHelp:
    "emdash コレクション Slug は管理画面の「コンテンツタイプ」で確認できます。タイトル/本文/著者/slug のフィールド Slug は、既にコンテンツがあるコレクションなら候補から選べます。",
  mappingLabel: (index, collection) => `対応 ${index + 1}: ${collection || "(未設定)"}`,
  addNewMapping: "新しい対応を追加",

  manualSyncSection:
    "Notion 側の変更を今すぐ取得して emdash へ反映します（設定済みの対応関係すべてが対象）。",
  manualSync: "手動取得",

  syncFailedTitle: "手動取得に失敗しました",
  syncDoneTitle: "手動取得が完了しました",
  syncSummary: (c) =>
    `対象 ${c.total} 件中 — 新規作成 ${c.created} / 更新 ${c.updated} / ` +
    `変更なし ${c.unchanged} / スキップ ${c.skipped} / 失敗 ${c.failed}`,
  syncFailuresSuffix: (errors) => `（失敗: ${errors.join(" / ")}）`,

  tokenSaved: "トークンを保存しました",
  mappingAdded: "対応を追加しました",
  mappingSaved: "対応を保存しました",
  mappingDeleted: "対応を削除しました",
  syncDoneToast: "手動取得が完了しました",
  syncPartialFailToast: "一部のページで失敗しました",

  configMissing:
    "プラグイン未設定（Notion トークン / コレクションとデータベースの対応を入力してください）",
};

export const messages: Record<Locale, Messages> = { en, ja };
