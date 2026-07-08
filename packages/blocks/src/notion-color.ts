/**
 * Notion の色名 → CSS 色値のテーブル。`*_background` はブロックの背景色、
 * それ以外はテキスト色として使う。値は CSS カスタムプロパティ経由で上書き可能にする。
 */
const NOTION_ACCENT: Record<string, string> = {
  gray: "#787774",
  brown: "#9f6b53",
  orange: "#d9730d",
  yellow: "#cb912f",
  green: "#448361",
  blue: "#337ea9",
  purple: "#9065b0",
  pink: "#c14c8a",
  red: "#d44c47",
};

const NOTION_BACKGROUND: Record<string, string> = {
  gray_background: "#f1f1ef",
  brown_background: "#f4eeee",
  orange_background: "#fbecdd",
  yellow_background: "#fbf3db",
  green_background: "#edf3ec",
  blue_background: "#e7f3f8",
  purple_background: "#f6f3f9",
  pink_background: "#faf1f5",
  red_background: "#fdebec",
};

/** callout/toggle の背景色（CSS カスタムプロパティ `--notion-block-accent`/`--notion-block-bg`）。 */
export function notionBlockColorVars(color?: string): { accent: string; background: string } {
  if (!color || color === "default") {
    return { accent: "#787774", background: "#f1f1ef" };
  }
  if (color in NOTION_BACKGROUND) {
    const base = color.replace("_background", "");
    return { accent: NOTION_ACCENT[base] ?? "#787774", background: NOTION_BACKGROUND[color]! };
  }
  const accent = NOTION_ACCENT[color] ?? "#787774";
  return { accent, background: "transparent" };
}
