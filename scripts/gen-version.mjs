// パッケージの package.json から version を読み、src/version.ts を生成する。
// プラグイン記述子（PluginDescriptor.version）が package.json と乖離しないよう、
// version を単一情報源（package.json）に固定するための codegen。
// 各パッケージの prebuild で（cwd = パッケージルートで）実行される。
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const out = `// このファイルは scripts/gen-version.mjs が package.json から自動生成する。手編集しない。
export const VERSION = "${pkg.version}";
`;
writeFileSync("src/version.ts", out);
