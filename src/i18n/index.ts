import type { PluginContext } from "emdash";

import { type Messages, messages } from "./messages.js";

export type { Messages } from "./messages.js";

export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * 既定表示言語。EmDash の PluginContext は管理ユーザーの UI 言語を露出しないため
 * （Block Kit もプラグイン文字列を翻訳しない）、自動判定はできず既定値＋設定切替で対応する。
 */
export const defaultLocale: Locale = "en";

/** 表示言語の保存先 kv キー（`settings:` 名前空間は設定値の慣例プレフィックス）。 */
export const LOCALE_CONFIG_KEY = "settings:locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 管理画面で選択・保存された表示言語を kv から解決する（未設定/不正値なら既定言語）。 */
export async function resolveLocale(ctx: PluginContext): Promise<Locale> {
  const stored = await ctx.kv.get<string>(LOCALE_CONFIG_KEY);
  return isLocale(stored) ? stored : defaultLocale;
}

/** 指定ロケールのメッセージ束を返す。未知のロケールは既定言語にフォールバックする。 */
export function getMessages(locale: Locale): Messages {
  return messages[locale] ?? messages[defaultLocale];
}
