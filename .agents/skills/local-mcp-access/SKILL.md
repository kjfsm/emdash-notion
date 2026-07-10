---
name: local-mcp-access
description: ローカルのEmDash devサーバーのMCPエンドポイント(/_emdash/api/mcp)をブラウザなしで叩く(dev-bypass経由でPATを発行、Bearer専用)。`emdash-site-local`コネクタが401/未認証のときの復旧もこれ。プラグイン自身の管理設定(例: notion-sync)をBlock Kitの`form_submit`/`block_action`経由で読み書きする方法、および`wrangler d1 execute`(ローカル/`--remote`)でMCPが公開していない情報を直接SQLで読む方法もカバーする。
---

# ローカルMCPアクセス(ブラウザ不要)

`/_emdash/api/mcp` は設計上**Bearerトークン専用**である(emdashのソース内
`packages/core/src/astro/middleware/auth.ts` を確認して判明: このミドルウェアは
MCPエンドポイントに対してセッション/クッキー認証を明示的に参照せず、有効な管理者の
セッションクッキーがあっても `401 NOT_AUTHENTICATED` を返す)。そのためブラウザログイン
や dev-bypass セッションだけでは**不十分**——Personal Access Token(PAT、`ec_pat_*`)が必要になる。

EmDashのドキュメントにある「セッションクッキーもMCPで使える」という記述は、この
ミドルウェアのバージョンには当てはまらない——信用しないこと。

朗報としては、認証プロバイダーが設定されていない `localhost`/`127.0.0.1` 上であれば、
そのPATは素のHTTP呼び出しだけで自分で発行できる——ブラウザも人間によるOAuth承認も不要。

## このプロジェクトの`.mcp.json`にローカルコネクタが登録されている場合

リポジトリルートの `.mcp.json` を確認し、`http://127.0.0.1:4321`(またはそれに類する
loopback URL)を指すエントリを探す——慣例として `-local` サフィックスが付く。例:

```json
"emdash-site-local": {
  "type": "http",
  "url": "http://127.0.0.1:4321/_emdash/api/mcp",
  "headers": { "Authorization": "Bearer ${EMDASH_LOCAL_PAT}" }
}
```

`${EMDASH_LOCAL_PAT}` はClaude Codeの環境変数展開記法である——生のトークンは
このファイル(gitにコミットされる)には一切書き込まれない。この変数が設定済みで有効な
場合、MCPツールはネイティブに(`mcp__<entry-name>__*`として)表示される——curlは不要で、
そのまま使い始めてよい。

このプロジェクトの `.mcp.json` にまだそのようなエントリが存在しない場合、再接続すべき
対象は何もない——下記の手動curl手順をそのまま使うこと。

同じファイル内で `-local` サフィックスが**付いていない**他のエントリ(例: `emdash-site`)
は、このloopback devサーバーではなくデプロイ済み/本番URLである——触る前に下記の
「本番に対してこれを使わないこと」を参照すること。

**ローカルコネクタが見つからない・未認証・呼び出しが401になる場合**: 環境変数が
まだ設定されていない、あるいはそれが指すPATが失効している(例: `.wrangler/` が
削除された——下記の注記を参照)。対処法:

1. 下記のステップ1〜2で新しいPATを発行する。
2. Claude Codeが動いているシェル(または該当プロセスが環境変数を読む場所)で
   `export EMDASH_LOCAL_PAT=ec_pat_...` を実行する。
3. MCPサーバーを再接続する(例: `/mcp` で再接続、またはセッションを再起動)ことで
   新しい環境変数を反映させる——`.mcp.json` の変数展開はコネクタ確立時に行われ、
   呼び出しごとには行われない。

現在のコンテキストで再接続ができない場合は、下記のステップ3にフォールバックする
(`Authorization` ヘッダーにトークンを直接載せた素のcurl)——コネクタの登録方法に
関係なく動作する。

## 前提条件

- EmDashのdevサーバーが起動していること(例: `templates/sample-emdash-site` で
  `pnpm dev`、デフォルトは `http://127.0.0.1:4321`)。
- devサーバーと同じマシン/サンドボックスから呼び出していること
  (`localhost` のみ——この手順全体はdev限定の抜け道であり、非ローカルの
  インスタンスに対しては一切機能しない)。

## 本番に対してこれを使わないこと

この手順全体は**ビルドされていないAstro devサーバー**(`pnpm dev` / `astro dev`)
に対してのみ機能する。emdashのソース `packages/core/src/astro/routes/api/setup/dev-bypass.ts`
を確認して判明: ハンドラの最初のチェックがこれである:

```ts
if (!import.meta.env.DEV) {
  return apiError("FORBIDDEN", "Dev bypass is only available in development mode", 403);
}
```

`import.meta.env.DEV` はビルド済み/デプロイ済みのインスタンス(Cloudflare Workers、
Pagesなど)では `false` になる——「非localhostホストでは大抵false」なだけでなく、
完全にコンパイル時に除去される。そのため `/_emdash/api/setup/dev-bypass` はホストや
ネットワークパスに関わらず本番では**常に** `403 FORBIDDEN` を返す。本番には
同等の抜け道は存在しない——このスキルは本番のMCPコネクタに対して提供できるものがない。

`.mcp.json` の `emdash-site` エントリ(`emdash-site-local` とは異なるデプロイ済みURL)
には、正規の方法で発行したPATが必要になる: 本番の管理パネルに実際にログインして
(パスキー/OAuthなど、そのサイトの `authProviders` に応じた方法で)
`/_emdash/admin/settings/api-tokens` でトークンを作成するか、
`emdash login --url https://<production-url>` を実行する(本物のOAuth Device
Flow——localhostの場合と異なり、人間がブラウザで承認する必要がある。localhostでは
`emdash login` が黙ってdev-bypassを使う)。このスキルの手順を本番URLに対して
再利用しようとしないこと——設計上、本番では通用しない。

## 手順

### 1. dev-bypassのセッションクッキーを取得する

```bash
curl -s -c /tmp/emdash-cookies.txt \
  "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin"
```

これはサイトに実際の認証プロバイダーが設定されておらず、かつリクエスト先が
loopbackアドレスである場合にのみ機能する——何の対話もなしにAdminロールの
セッション(`dev@emdash.local`、role 50)を発行する。`emdash login` が
`localhost` に対して自動的に行うのもこれと同じ処理である。

### 2. そのセッションを使ってREST API経由でPATを発行する

```bash
curl -s -b /tmp/emdash-cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-EmDash-Request: 1" \
  -X POST http://127.0.0.1:4321/_emdash/api/admin/api-tokens \
  -d '{"name": "agent-local", "scopes": ["admin"]}'
```

- `X-EmDash-Request: 1` は状態を変更するセッション認証APIコールに必須である
  (軽量なCSRFガード——ブラウザはクロスオリジンでカスタムヘッダーを付けられないため、
  素の `curl` からこれを送るのは問題ない)。
- このエンドポイントはセッションユーザーがAdmin(role ≥ 50)であることを要求する——
  dev-bypassのセッションはすでにこれを満たしている。
- これはlocalhostの外に出ないため、細かいスコープ(`content:read`/`content:write`など)
  を列挙する代わりに `admin` スコープ(フルアクセス)をリクエストしてよい。
- レスポンスの `data.token`(`ec_pat_...`)は**一度だけ**表示される——必ず記録すること。
- 人間が手動でこれを行いたい場合、管理UI上の相当機能は
  `http://127.0.0.1:4321/_emdash/admin/settings/api-tokens` である。

### 3. そのトークンでMCPを呼び出す

```bash
curl -s \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ec_pat_..." \
  -X POST http://127.0.0.1:4321/_emdash/api/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

任意のMCP JSON-RPC呼び出しに対して `method`/`params` を入れ替えればよい。例:
`{"method":"tools/call","params":{"name":"content_list","arguments":{"collection":"posts","limit":1}}}`

## 注記

- トンネルも外部コネクタもクロスバウンダリのネットワーキングも不要——これは
  devサーバーが動いているのと同じ環境からの、純粋なloopback HTTPである。
- 発行したPATは長期間有効であり、ここでは何も自動的に失効させない。片付けたい
  場合は `DELETE /_emdash/api/admin/api-tokens/:id`(作成レスポンスからトークンの
  `id` を得るか、同じセッションで `GET` して一覧取得する)で無効化できる——
  使い捨てのローカルサンドボックスであれば任意。
- MCPツールの完全なリファレンス: `docs.emdashcms.com/reference/mcp-server`
  (スコープ表、全45ツール)。上記の理由により「セッションクッキーも使える」という
  記述は無視すること。
- devサーバーのローカル状態が消去された場合(例: ローカルのD1/SQLiteデータを
  保持する `.wrangler/` の削除)、以前発行したPATは動作しなくなる
  (`401 INVALID_TOKEN`——セッションだけでなくトークンの行自体が消えている)。
  その場合は単にステップ1〜2をやり直して新しいPATを発行すればよく、他に
  変えるべきことはない。

## プラグイン設定の読み取り(MCPでは公開されていない)

コアMCPサーバーの45個のツール(`content_*`、`schema_*`、`settings_*`、
`media_*`、`menu_*`、`taxonomy_*`、`revision_*`、`search`)はemdashコアに
固定でハードコードされており、特定プラグイン自身の設定(例: Notion-syncプラグインの
接続設定)を読むためのツールは存在しない。それを読むには、上記ステップ2の
Bearer PATを使ってプラグインのBlock Kit管理ルートを直接呼び出す:

```bash
curl -s \
  -H "Authorization: Bearer ec_pat_..." \
  http://127.0.0.1:4321/_emdash/api/plugins/<plugin-id>/admin
```

これは管理ページの現在のBlock Kit JSONを返す(フィールドの値は保存済みの設定を
反映するが、`secret_input` フィールドは実際の値を一切返さない——locale、
ドロップダウンの選択状態、算出済みのステータス文言といった非シークレットな
状態のみ)。URLパスは、プラグインのmanifestが `admin.pages[].path` で
何を宣言していても常に `/admin` である(そのpathはWeb UI上のサイドバーリンクに
のみ使われる)。

このルートはセッションクッキーで呼ぶ場合は通常 `X-EmDash-Request: 1` という
CSRFヘッダーを要求する点に注意——だがBearerトークン認証のリクエストはこの
チェックを完全にスキップする(トークンはクッキーのような環境依存の資格情報では
ないため)ので、ここでは追加のヘッダーは不要である。

## プラグイン設定の書き込み(Block Kitの`form_submit` / `block_action`)

同じ `/admin` ルートは状態を変更するインタラクションも受け付ける——素の
`GET` は暗黙的に `page_load` を送信したことになる。フォームを送信したり
ボタンをクリックしたりするには、プラグインのルートハンドラが期待する
`BlockInteraction` の形をしたJSONボディを `POST` する:

```bash
curl -s \
  -H "Authorization: Bearer ec_pat_..." \
  -H "Content-Type: application/json" \
  -X POST http://127.0.0.1:4321/_emdash/api/plugins/<plugin-id>/admin \
  -d '{"type":"form_submit","action_id":"<フォームブロックのsubmit.action_id>","values":{"<フィールドのaction_id>":"<値>", ...}}'
```

- フォームの送信ボタンなら `type` は `"form_submit"`、単体のボタン
  (フォームを持たない「Fetch」アクションなど)なら `"block_action"` になる。
- `action_id` は*直前の* `page_load`/レスポンスにあった `submit.action_id`
  (フォームの場合)またはボタン自身の `action_id`(block_actionの場合)と
  一致していなければならない——action_idは動的な場合がある(既存行を編集する
  `save_mapping_0` と、新規追加する `save_mapping_new` のように)ので、
  不明な場合は先に再度 `GET` して確認すること。
- `values` のキーはフォームフィールド自身の `action_id` であり、ラベルではない。
- レスポンスは再レンダリングされたブロックツリー全体と、任意で
  `data.toast: {message, type}` を返す——`toast.type === "success"` を確認する
  (または `banner`/`stats` ブロックを読む)ことで、そのアクションが実際に
  何かを行ったか確認すること。不正な形のリクエストでも、エラーなしに
  *変化のない*ページがそのまま `200` で返ってくることが多いため。
- `X-EmDash-Request` ヘッダーは不要(Bearer認証がこのCSRFチェックを
  スキップする)。
- プラグインが期待する正確なaction_idと値の形を推測せずに知るには、
  インストール済みのソースを読むこと——sandboxedプラグインはバンドル済みの
  `dist/plugin.mjs` を `node_modules/.pnpm/<pkg>@<version>_.../node_modules/<pkg>/dist/plugin.mjs`
  以下に同梱している(`realpath node_modules/<scope>/<pkg>` で実体パスを
  解決すること、pnpmは別の場所にシンボリックリンクしている)。minifyされているが、
  `grep`/`python3 -c` でaction_idの文字列リテラル(例: `save_mapping_`)を
  検索すれば、そのハンドラの分岐と `values` から読み取っている正確なキーが
  見つかる。

### 落とし穴: `source .env` だけでは子プロセスにexportされない

POSTボディをヘルパーのサブプロセス(例: `node -e
"...process.env.NOTION_TOKEN..."`)で組み立てる場合、素の `source .env` では
不十分である——`export` の付かない `KEY=value` 行はシェルローカルの変数を
設定するだけで、`node` のような子プロセスからは一切見えない。すると
`JSON.stringify` はエラーを出さずに `undefined` のフィールドを黙って
省略するため、リクエストは(200、エラーなしで)「成功」したように見えつつ、
実際には何も保存されていない。`set -a; source .env; set +a`(または
`export $(grep NOTION_TOKEN .env)`)を使い、サブプロセスが実際にその変数を
継承するようにすること——さらに、送信前に組み立てたペイロードに期待する値が
含まれているか目視確認すること(例: `echo "$PAYLOAD" | grep -c ntn_`)。

### 実例: notion-syncの接続設定+マッピング作成

`@emdash-notion/sync` の管理ページ(`plugin id: notion-sync`)は、
以下のaction_idを持つ(`dist/plugin.mjs` をgrepして判明):

| action_id                 | type          | values                                                                                                    |
| -------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `save_connection`          | `form_submit` | `{locale, notionToken}`                                                                                     |
| `save_webhook`             | `form_submit` | `{webhookToken}`                                                                                             |
| `generate_webhook_token`   | `block_action`| (なし)                                                                                                       |
| `fetch_structure`          | `block_action`| (なし)——トークンが未保存の場合はバナーでエラーになる                                                          |
| `manual_sync`              | `block_action`| (なし)——保存済みのマッピングを使って即座に同期を実行する                                                       |
| `save_mapping_new`         | `form_submit` | `{collection, databaseId, titleField, bodyField, authorProperty, authorField, slugProperty, slugField}`     |
| `save_mapping_<index>`     | `form_submit` | 同上。新規追加ではなく、そのindexのマッピングを編集する                                                        |
| `delete_mapping_<index>`   | `block_action`| (なし)                                                                                                       |

マッピングの各フィールドを省略/空にした場合のデフォルト値: `titleField` →
`"title"`、`bodyField` → `"content"`、`authorProperty` → `"Author"`
(これはNotion側のプロパティ*名*で、大文字小文字を区別する——英語だと決めつけず、
`fetch_structure` が返すプロパティ一覧を確認すること)、`slugProperty` →
`"slug"`。`authorField`/`slugField` はEmDash側のフィールドスラッグであり、
対象コレクションにそれ用の素直なフィールドが実在しない限り未設定(「スキップ」)
のままにする——bylineやシステムのslugカラムはこのマッピング経由では
到達できない。

生の `NOTION_TOKEN` から実際に同期済みコンテンツにたどり着くまでの手順:

1. トークンを渡して `save_connection`。
2. `fetch_structure`——`{databases, properties}` の情報がバナーとして返り
   (`"N database(s), M property name(s) found"`)、次のステップで使う
   `databaseId`/`authorProperty`/`slugProperty` のselectの選択肢が
   埋まる。手順1で実際に保存できていなかった場合は「no Notion token
   saved」というエラーになる(上記の `.env` の落とし穴を参照——このバグは
   まさにこの形で表面化する)。
3. 同期したいEmDashコレクションごとに `save_mapping_new` を実行。
4. `manual_sync` で実際にコンテンツを取り込む——設定したslugプロパティで
   既存コンテンツと照合しながら、エントリを**draft(下書き)**として
   作成/更新する。件数を示すバナー(`created/updated/unchanged/deleted/
   skipped/failed`)が返る。

補足

あるコレクションの中に、いかにも仮の文字列っぽいタイトル(日本語の
「テスト」/「テストページ N/3」のようなQA文字列など)を持つ、説明のつかない
draftコンテンツを見かけたら、それが管理UIで手入力されたものだと決めつける前に、
notion-syncが設定済みでマッピングを持っていないか確認すること——共有/テスト用の
Notionワークスペースに対する `manual_sync` は、実際に出荷されるつもりのなかった
Notionページから引っ張ってくるため、全く同じ「ゴミ」コンテンツを決定論的に
再現する。これはまさに、このサイトの本番コンテンツをseedファイルと比較した際に
起きたことだった——本番インスタンスは、このスキルの実例で使っているのと
同じテスト用ワークスペースを同期済みだったのである(この推測は、下記の
直接SQL読み取りで `_plugin_storage` の `sync_map` 行数と1件ずつ突き合わせて
直接裏付けが取れた)。

## MCPと併用する: `wrangler d1 execute` での直接SQL読み取り

MCPのコアツール(`content_*`/`schema_*`/`settings_*`など)とBlock Kitの
`/admin`ルート(プラグイン自身の設定)で読める範囲は決まっている。それ以外
——生のテーブル構造そのもの、プラグインの `ctx.kv`/`ctx.storage` が実際に
どのテーブル・どのキー名で保存されているか、複数テーブルを跨いだ突き合わせ
など——を確認したいときは、`wrangler d1 execute` で直接SQLを読みに行くのが
最短ルートになる。devサーバーを起動する必要も、`dev-bypass`でPATを発行する
必要も、`wrangler.jsonc`を書き換える必要もない。

```bash
# データベース名は wrangler.jsonc の d1_databases[].database_name
# (binding名の "DB" ではない。database_id をそのまま渡しても動く)
npx wrangler d1 execute <database_name> --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

- `--remote` を付けると、デプロイ済みのWorkerが実際に使っている**本番のD1
  そのもの**に直接クエリが飛ぶ(コピーではない)。`wrangler whoami` で
  ログイン済みかつそのアカウントに対象D1への権限があれば、それだけで動く
  ——`dev-bypass`もPATも一切不要。
- `--remote` を外す(または `--local` を付ける)と、`npx emdash dev` /
  `astro dev` が使っているのと**同じローカルのMiniflareエミュレートD1**
  (`.wrangler/state` 以下)を読む。devサーバーを起動していなくても読める。
- **`--remote` に対しては、ユーザーの明示的な許可なしにSELECT以外の文を
  実行しないこと。** UPDATE/DELETE/INSERTを`--remote`に対して実行するのは
  本番データへの直接書き込みそのものであり、取り消せない。MCPの
  `content_update`/`content_delete`などタイプ付きのツールがある操作は、
  生SQLではなくそちら経由で行うこと——生SQLの書き込みは、それらのツールが
  届かない範囲(スキーマ移行の手直しなど)に限り、かつ都度ユーザーに確認を
  取った上でのみ行う。

### 見つかったテーブル(このプロジェクトの構成での実例)

- `ec_<collection>`(例: `ec_posts`、`ec_projects`) — 各コレクションの
  コンテンツ本体。
- `options` — サイト設定(`site:`プレフィックス)**に加えて**、in-process
  (native)としてロードされているプラグインの `ctx.kv` の実体もここに入る
  ——キー名は `plugin:<plugin-id>:settings:<key>` の形。今回の実例では
  `plugin:notion-sync:settings:notionToken`/`locale`/`mappings`/
  `notionDatabases`/`notionProperties` がここにあった。sandboxed前提の
  ドキュメント(Settings/KV store)には「プラグインごとに隔離されたKV」と
  書かれているが、in-process読み込みの場合は物理的にはこの共有テーブルに
  プレフィックス付きで乗っているだけ、という点に注意。
- `_plugin_storage`(`plugin_id`, `collection`, `id`, `data`, ...) —
  sandboxedプラグインの `ctx.storage`(インデックス付きコレクション)に
  相当するテーブル。notion-syncはここに `collection: "sync_map"` として
  Notionページ↔EmDashエントリの対応(`emdashId`/`hash`/`notionLastEdited`
  など)を1行ずつ記録している——「テスト」記事の出自を追うのに使ったのは
  このテーブル。
- `_plugin_state`(`plugin_id`, `version`, `status`, ...) — プラグインの
  インストール/有効化状態を持つはずのテーブルだが、このプロジェクトでは
  notion-sync(in-process/native扱い)の行が**存在しなかった**——
  sandboxed想定のテーブルが、native実行時には使われないケースがある、
  という一例。空だったことをすぐに「未設定」と誤読しないこと。

### 重要な注意: シークレットはここでは一切マスクされない

Block Kitの`/admin`ルートは`secret_input`フィールドの値を絶対に返さない
仕様だが、それはアプリ層(admin UI/APIレスポンス)だけの話であり、D1の
生の行には**平文でそのまま**入っている。`options`テーブルの
`plugin:notion-sync:settings:notionToken` はまさにこれで、実際のNotion
トークン文字列がそのまま `value` 列に入っている。

生SQLでこの種のキー(`notionToken`/`webhookToken`/`*secret*`/`*token*`
などを含む名前)を`SELECT`し、その`value`をそのまま出力・会話に貼り付ける
ことは、実在するシークレットの漏洩になる。テーブル名やキー名の**存在確認**
(`SELECT name FROM options WHERE name LIKE '%token%'`)までは安全だが、
値そのもの(`SELECT value FROM ...`)を取得・表示するのは避けること。
