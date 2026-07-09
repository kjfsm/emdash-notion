import type { Locale } from "./index.js";

export interface SyncCounts {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  /** 予算超過で本文末尾が欠落したまま保存されたページ数。 */
  truncated: number;
  /** Notion 側で削除・アーカイブされ、emdash 側をゴミ箱へ移したページ数。 */
  deleted: number;
}

/**
 * 管理画面（Block Kit）に表示する文字列束。ログや throw する Error 等の
 * 開発者向けメッセージは英語のまま別扱いとし、ここには利用者向け UI 文字列のみを置く。
 */
export interface Messages {
  pageTitle: string;
  pageIntro: string;
  languageLabel: string;

  connectionHeader: string;

  notionTokenLabel: string;
  notionTokenSetPlaceholder: string;
  notionTokenNewPlaceholder: string;
  saveConnection: string;

  webhookHeader: string;
  webhookExplain: string;
  webhookTokenLabel: string;
  webhookTokenSetPlaceholder: string;
  webhookTokenNewPlaceholder: string;
  webhookTokenHelp: string;
  saveWebhook: string;
  webhookSaved: string;

  generateTokenButton: string;
  generateTokenHelp: string;
  tokenGeneratedTitle: string;
  tokenGeneratedInstruction: string;

  fetchStructureButton: string;
  fetchStructureHelp: string;
  structureNotFetchedHint: string;
  structureFetchNoTokenTitle: string;
  structureFetchNoTokenBody: string;
  structureFetchedTitle: string;
  structureFetchedBody: (databases: number, properties: number) => string;
  structureFetchedToast: string;
  structureFetchPartialTitle: string;
  structureFetchPartialSuffix: (errors: string[]) => string;

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
  mappingSummary: (collection: string, databaseName: string) => string;
  mappingCollectionUnset: string;
  mappingDatabaseUnset: string;
  addNewMapping: string;

  manualSyncSection: string;
  manualSync: string;

  syncFailedTitle: string;
  syncDoneTitle: string;
  syncSummary: (counts: SyncCounts) => string;
  syncFailuresSuffix: (errors: string[]) => string;
  /** 予算超過で本文が欠落したページがあるときの注意書き。 */
  syncTruncatedSuffix: (truncated: number) => string;

  networkUnavailable: string;

  tokenSaved: string;
  mappingAdded: string;
  mappingSaved: string;
  mappingDeleted: string;
  syncDoneToast: string;
  syncPartialFailToast: string;
  tokenGeneratedToast: string;

  configMissing: string;
}

const en: Messages = {
  pageTitle: "notion-sync — Notion sync settings",
  pageIntro:
    "Follow the steps: ① Save the Notion token → ② (optional) set up the webhook for automatic sync → ③ fetch the Notion structure → ④ try a manual fetch → ⑤ add mappings.",
  languageLabel: "Language",

  connectionHeader: "Connection",

  notionTokenLabel: "Notion integration token",
  notionTokenSetPlaceholder: "Saved (leave blank to keep unchanged)",
  notionTokenNewPlaceholder: "secret_...",
  saveConnection: "Save token",

  webhookHeader: "Webhook (optional — automatic sync)",
  webhookExplain:
    "The webhook is optional. Set a token here and register the URL below in Notion to sync automatically whenever pages change. If you leave it unset, use the “Manual fetch” button instead to sync on demand.",
  webhookTokenLabel: "Webhook URL token",
  webhookTokenSetPlaceholder: "Saved (leave blank to keep unchanged)",
  webhookTokenNewPlaceholder: "Any shared secret",
  webhookTokenHelp:
    "This is a shared secret embedded in the webhook URL's `?token=` query — unrelated to the `verification_token` Notion sends once when you create the subscription.",
  saveWebhook: "Save webhook token",
  webhookSaved: "Webhook token saved",

  generateTokenButton: "Generate EmDash token",
  generateTokenHelp:
    "Generates a random shared secret, saves it as the Webhook URL token above, and shows the full webhook URL to register in Notion.",
  tokenGeneratedTitle: "EmDash token generated",
  tokenGeneratedInstruction: "Register this URL as the webhook endpoint in Notion.",

  fetchStructureButton: "Fetch Notion structure",
  fetchStructureHelp:
    "After saving your token, click this to fetch your Notion databases and property names below.",
  structureNotFetchedHint:
    "Notion structure hasn't been fetched yet. Click “Fetch Notion structure” above first.",
  structureFetchNoTokenTitle: "Can't fetch — no Notion token saved",
  structureFetchNoTokenBody: "Save your Notion integration token above, then try again.",
  structureFetchedTitle: "Notion structure fetched",
  structureFetchedBody: (databases, properties) =>
    `${databases} database(s), ${properties} property name(s) found.`,
  structureFetchedToast: "Notion structure fetched",
  structureFetchPartialTitle: "Notion structure fetched with some errors",
  structureFetchPartialSuffix: (errors) => ` (failed: ${errors.join(" / ")})`,

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
  mappingSummary: (collection, databaseName) => `${collection} ⇔ ${databaseName}`,
  mappingCollectionUnset: "(collection unset)",
  mappingDatabaseUnset: "(database unset)",
  addNewMapping: "Add a new mapping",

  manualSyncSection:
    "Fetch the latest changes from Notion now and reflect them into emdash (targets every configured mapping).",
  manualSync: "Manual fetch",

  syncFailedTitle: "Manual fetch failed",
  syncDoneTitle: "Manual fetch complete",
  syncSummary: (c) =>
    `${c.total} target(s) — created ${c.created} / updated ${c.updated} / ` +
    `unchanged ${c.unchanged} / deleted ${c.deleted} / skipped ${c.skipped} / failed ${c.failed}`,
  syncFailuresSuffix: (errors) => ` (failed: ${errors.join(" / ")})`,
  syncTruncatedSuffix: (truncated) =>
    ` (⚠ ${truncated} page(s) exceeded the request budget and were saved with the tail of the body missing; they will be repaired on the next full sync)`,

  networkUnavailable: "Network capability is unavailable (network:request not granted)",

  tokenSaved: "Tokens saved",
  mappingAdded: "Mapping added",
  mappingSaved: "Mapping saved",
  mappingDeleted: "Mapping deleted",
  syncDoneToast: "Manual fetch complete",
  syncPartialFailToast: "Some pages failed",
  tokenGeneratedToast: "EmDash token generated and saved",

  configMissing:
    "Plugin not configured (enter the Notion token and at least one collection ⇔ database mapping)",
};

const ja: Messages = {
  pageTitle: "notion-sync — Notion 同期設定",
  pageIntro:
    "① Notion トークンを保存 → ②（任意）Webhook を設定して自動同期 → ③ Notion の構造を取得 → ④ 手動取得で試す → ⑤ マッピングを追加、の順に進めてください。",
  languageLabel: "言語 / Language",

  connectionHeader: "接続",

  notionTokenLabel: "Notion インテグレーショントークン",
  notionTokenSetPlaceholder: "設定済み（空欄のままなら変更しない）",
  notionTokenNewPlaceholder: "secret_...",
  saveConnection: "トークンを保存",

  webhookHeader: "Webhook（任意・自動同期）",
  webhookExplain:
    "Webhook はオプションです。ここでトークンを設定し、下の URL を Notion 側に登録すると、ページが変更されるたびに自動で同期されます。設定しない場合は、下の「手動取得」ボタンで必要なときに同期してください。",
  webhookTokenLabel: "Webhook URL トークン",
  webhookTokenSetPlaceholder: "設定済み（空欄のままなら変更しない）",
  webhookTokenNewPlaceholder: "任意の共有シークレット",
  webhookTokenHelp:
    "これは Webhook URL の `?token=` に埋め込む共有シークレットです。Notion が購読作成時に一度だけ送ってくる `verification_token` とは別物です。",
  saveWebhook: "Webhook トークンを保存",
  webhookSaved: "Webhook トークンを保存しました",

  generateTokenButton: "EmDash token を生成",
  generateTokenHelp:
    "ランダムな共有シークレットを生成し、上の Webhook URL トークンとして保存します。生成後、Notion に登録する Webhook URL を表示します。",
  tokenGeneratedTitle: "EmDash token を生成しました",
  tokenGeneratedInstruction: "これを Notion の Webhook URL に登録してください。",

  fetchStructureButton: "Notionの構造を取得する",
  fetchStructureHelp:
    "トークンを保存した後にこれを押すと、Notion のデータベース一覧とプロパティ名を取得して下のセレクトに反映します。",
  structureNotFetchedHint:
    "まだ Notion の構造を取得していません。上の「Notionの構造を取得する」ボタンを押してください。",
  structureFetchNoTokenTitle: "取得できません（Notion トークン未保存）",
  structureFetchNoTokenBody:
    "上で Notion インテグレーショントークンを保存してから、もう一度お試しください。",
  structureFetchedTitle: "Notion の構造を取得しました",
  structureFetchedBody: (databases, properties) =>
    `データベース ${databases} 件、プロパティ名 ${properties} 件が見つかりました。`,
  structureFetchedToast: "Notion の構造を取得しました",
  structureFetchPartialTitle: "一部エラーがありましたが取得しました",
  structureFetchPartialSuffix: (errors) => `（失敗: ${errors.join(" / ")}）`,

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
  mappingSummary: (collection, databaseName) => `${collection} ⇔ ${databaseName}`,
  mappingCollectionUnset: "(コレクション未設定)",
  mappingDatabaseUnset: "(データベース未設定)",
  addNewMapping: "新しい対応を追加",

  manualSyncSection:
    "Notion 側の変更を今すぐ取得して emdash へ反映します（設定済みの対応関係すべてが対象）。",
  manualSync: "手動取得",

  syncFailedTitle: "手動取得に失敗しました",
  syncDoneTitle: "手動取得が完了しました",
  syncSummary: (c) =>
    `対象 ${c.total} 件中 — 新規作成 ${c.created} / 更新 ${c.updated} / ` +
    `変更なし ${c.unchanged} / 削除 ${c.deleted} / スキップ ${c.skipped} / 失敗 ${c.failed}`,
  syncFailuresSuffix: (errors) => `（失敗: ${errors.join(" / ")}）`,
  syncTruncatedSuffix: (truncated) =>
    `（⚠ ${truncated} 件がリクエスト予算を超過し、本文末尾が欠落したまま保存されました。次回の全量同期で修復されます）`,

  networkUnavailable: "ネットワーク機能が利用できません（network:request が未付与）",

  tokenSaved: "トークンを保存しました",
  mappingAdded: "対応を追加しました",
  mappingSaved: "対応を保存しました",
  mappingDeleted: "対応を削除しました",
  syncDoneToast: "手動取得が完了しました",
  syncPartialFailToast: "一部のページで失敗しました",
  tokenGeneratedToast: "EmDash token を生成して保存しました",

  configMissing:
    "プラグイン未設定（Notion トークン / コレクションとデータベースの対応を入力してください）",
};

export const messages: Record<Locale, Messages> = { en, ja };
