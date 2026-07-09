import tsParser from "@typescript-eslint/parser";
import astro from "eslint-plugin-astro";
import oxlint from "eslint-plugin-oxlint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    // ESLint の flat config は .gitignore を自動参照しないため、生成物は明示的に除外する
    ignores: ["**/dist/**", "**/coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
  },
  // WHY: oxlint/oxfmt は .astro 構文を解釈できない（templates/* 配下のみで発生）。
  // .astro の lint は eslint-plugin-astro に委譲する（format は prettier-plugin-astro）。
  ...astro.configs.recommended,
  // oxlint が担当するルールを ESLint 側で無効化し、二重指摘を避ける
  ...oxlint.buildFromOxlintConfigFile("./.oxlintrc.json"),
]);
