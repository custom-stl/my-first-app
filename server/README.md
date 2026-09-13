# きろくサーバー（さんすうノート）

といた きろくを サーバーに のこして、**人ごとに** 集計するための API です。
アプリ本体（`../index.html`）は、このサーバーが なくても うごきます。

## API

| メソッド | パス | ないよう |
| --- | --- | --- |
| `GET` | `/api/health` | 生きているか（あいことば不要） |
| `POST` | `/api/runs` | 1セット（10問）ぶんの きろくを のこす |
| `GET` | `/api/summary?today=YYYY-MM-DD` | **人ごとの集計**（今日・通算・連続日数・直近14日） |
| `GET` | `/api/runs?player=n:なまえ&limit=50` | きろくの一覧（1問ごとの内容つき） |

`APP_KEY`（あいことば）を設定すると、`/api/health` 以外は `key` が必要になります（POSTはbody、GETはクエリ）。

- 同じ人かどうかは `player_id`（`n:` + 名前を小文字化）で判定します。**別の端末で同じ名前を選べば1人ぶんにまとまります**。名前を変えると別人になります。
- `id` が同じ きろくは重複登録されません（送信のやり直し対策）。
- 1回の送信は32KBまで。値の範囲（`total` 1〜100、`correct ≤ total`、`level` 1〜3 など）はサーバー側でも検証します。

## 1. Cloudflare Workers で動かす（無料枠・おすすめ）

```bash
cd server
npx wrangler login                                  # ブラウザでログイン
npx wrangler d1 create sansu-note                   # 出てきた database_id を wrangler.toml に貼る
npx wrangler d1 execute sansu-note --remote --file=./schema.sql
npx wrangler secret put APP_KEY                     # あいことば（省略可。入れるのを推奨）
npx wrangler deploy
```

最後に出る `https://sansu-note-api.<あなた>.workers.dev` が サーバーのURLです。
アプリの「きろく」画面 → サーバー欄に URL と あいことばを入れて「ほぞんして ためす」を押してください。

書き込みを自分のサイトからだけに限りたい場合は、`wrangler.toml` の `ALLOW_ORIGIN` を
`"https://<ユーザー名>.github.io"` に変えて、もう一度 `npx wrangler deploy` します。

集計を SQL で見たいときは:

```bash
npx wrangler d1 execute sansu-note --remote \
  --command "SELECT player_name, day, SUM(total) AS もんだい, SUM(correct) AS せいかい
             FROM runs GROUP BY player_name, day ORDER BY day DESC, player_name"
```

## 2. 自分のPC・家のサーバーで動かす

Cloudflare を使わない場合は、Node.js だけで同じAPIが動きます（保存先はJSONファイル1つ）。

```bash
APP_KEY=あいことば node server/dev-server.mjs          # http://127.0.0.1:8787
PORT=9000 DATA=./kiroku.json node server/dev-server.mjs
```

同じ家のWi-Fiの中なら、タブレットからも `http://<PCのIPアドレス>:8787` で届きます。

## ファイル

| ファイル | やくめ |
| --- | --- |
| `api.mjs` | APIの本体（Workers版とローカル版で共通） |
| `worker.js` | Cloudflare Workers 用（D1に保存） |
| `dev-server.mjs` | Node.js 用（JSONファイルに保存） |
| `schema.sql` | D1のテーブル定義 |
| `wrangler.toml` | Cloudflare の設定 |

## 気をつけること

- ログインのしくみは入れていません。**URLとあいことばを知っている人は書き込めます**。家庭で使う前提の作りです。
- 送るのは「ニックネーム・日付・点数・問題と答え」だけです。本名や連絡先は使わないでください。
- あいことばを `config.js` に書いてリポジトリを公開すると誰でも読めます。公開リポジトリではアプリの画面から入れてください。
