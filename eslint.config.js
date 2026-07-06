import tsParser from "@typescript-eslint/parser";
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
  // oxlint が担当するルールを ESLint 側で無効化し、二重指摘を避ける
  ...oxlint.buildFromOxlintConfigFile("./.oxlintrc.json"),
]);
