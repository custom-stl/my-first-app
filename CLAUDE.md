# さんすうノート — 作業メモ

小学1〜2年生向けの算数ドリル。`index.html` 1枚で動く静的アプリ（依存ライブラリなし）。

## 公開先（変更したら必ず更新する）

**https://sparkly-nougat-5bb9ae.netlify.app/** — Netlify Drop で公開している本番URL。お子さんが実際に使う。

このURLへは **Claude から直接デプロイできない**。理由は2つ。

1. Netlify の認証情報を持っていない（アクセストークンを会話に貼らせない）
2. 実行環境のネットワークポリシーが `netlify.app` への通信を遮断している
   （`connect_rejected: gateway answered 403 to CONNECT`）

そのため **`index.html` などを変更したら、毎回この手順まで必ず終わらせる**。

```bash
# 配布用ZIPを作る（サイトに必要なファイルだけ。README/CLAUDE.md/tests/server は入れない）
SD="${SCRATCHPAD:-/tmp}"; rm -rf "$SD/sansu-note-site" "$SD/sansu-note-site.zip"
mkdir -p "$SD/sansu-note-site"
cp index.html typing.html config.js manifest.webmanifest icon.svg icon-180.png icon-192.png icon-512.png "$SD/sansu-note-site/"
(cd "$SD" && zip -qr sansu-note-site.zip sansu-note-site)
```

作った ZIP は **SendUserFile でユーザーに渡し、「解凍して Netlify のサイトの Deploys にフォルダをドラッグ」** と伝える（URLは変わらない）。

`index.html` / `typing.html` を変えたら、それぞれの中の `const BUILD = "YYYY-MM-DDx"` も必ず上げる。ホーム画面の一番下に「バージョン …」として出るので、**ユーザーが公開先を開けば最新が載っているか自分で確認できる**。渡すときは「ホーム画面の下のバージョンが ○○ になっていれば更新できています」と伝える。

**録音した声は公開先には載らない**（端末のブラウザの中にある）。デプロイしても声は増えも減りもしないので、「声が更新されているか」を聞かれたらその点を先に伝え、消えていれば「バックアップ（こえと きろく）」からの復元を案内する。

> ユーザーが Netlify サイトを GitHub リポジトリに連携したら、`main` への push で自動デプロイされるようになる。その場合はZIPの受け渡しは不要になるので、このメモを更新する。

## 変更したときの確認

```bash
npm i playwright            # 未インストールなら（この環境では /opt/node22 に既にある）
node tests/verify-questions.mjs   # 3レベル×3種類×10問×4セット=360問を自動で解いて答え合わせを照合
node tests/verify-api.mjs         # きろくサーバー（server/）のAPIを検証
node tests/verify-voice-order.mjs # ケロとコロの声が重ならないか（ことば／アニメごえ／録音）を実時間で計測
node tests/verify-typing.mjs      # かずうち ゲーム（けたすう・うてた／ミスの数え・時間切れ・最高記録）
node tests/verify-typing-app.mjs  # typing.html（4コース×3レベル・つぎのキー／ゆび・れんしゅう／ゲーム）
```

`verify-voice-order.mjs` は `127.0.0.1` に http-server を立てて測る（`file://` だと録音のテストができない）。

`verify-typing.mjs` と `verify-typing-app.mjs` は `page.clock` でブラウザの時計を止め、1キーずつ進めて確かめる（60秒待たない）。

`verify-questions.mjs` は**答えを画面から独立に計算して**照合する（筆算は問題文、時計は針の角度から）。出題や採点をいじったら必ず実行し、「しっぱい 0件 / JSエラー なし」を確認する。

判定パネルのDOM構造を変えると `verify-questions.mjs` のセレクタ（`.judge .say p b`）が追随する必要がある。

## 構成

| ファイル | 中身 |
| --- | --- |
| `index.html` | アプリ本体（HTML+CSS+JS、SVGのキャラクター・時計・花まるもコード生成） |
| `typing.html` | タイピングゲーム。**単体で開いて動く**（TOPからリンク）。いずれ `index.html` に統合する |
| `config.js` | きろくサーバーのURL・あいことばの既定値（空でよい） |
| `server/` | きろくサーバー。`api.mjs` が本体で、Workers版（`worker.js`）とローカル版（`dev-server.mjs`）が共用 |
| `tests/` | 上記の検証スクリプト |
| `.github/workflows/pages.yml` | GitHub Pages 用（リポジトリが private のままなので現在は動かない） |

## 気をつけること

- 文章は**わかち書き**＋`word-break: keep-all` で、語の途中で改行しない
- 表示は**ライト／ダークの両テーマ**を確認する。色は `:root` のトークン経由で使う
- グラフの2色は `dataviz` skill の `validate_palette.js` で検証済み（ライト `#e4523f`/`#2b6ca3`、ダーク `#e8603f`/`#3f8fd0`）。変えるなら再検証する
- 記録・録音した声・設定はすべて `localStorage`（端末内）。サーバーに送るのは記録だけ
- **タイピングゲーム**（`typing.html`）は いまは べつファイル。単体で `open typing.html` して たしかめられる。
  いろ・かたちの トークン（`:root`）と `frogSVG()` は `index.html` と おなじ かたちに そろえて あるので、
  統合する ときは `<main id="typing">` として そのまま はこべる。`store` キーは `sn-typing-*`（`sn-sound` だけ 共用）。
  ゆびの いろ（`--yubi-1`〜`5`）は ひだり・みぎで おなじ ゆびが おなじ いろ。いろだけに たよらず、
  つぎの キーは わく＋うきあがりで しめし、「ひだりの なかゆびで E」と ことばでも 出す
- **かずうち ゲーム**（ホームの「あそぶ」）は `sn-log-v1` にも サーバーにも 書かない。
  さんすうの きろく・グラフ・「みんなの きろく」を にごらせない ため。
  のこすのは けたごと・人ごとの さいこう きろく（`sn-type-best-<なまえ>-<レベル>`）だけ。
  タイマーは `tgStop()` で ぜんぶ とまる（`show()` が よぶ）。あそんで いる あいだだけ 声を ならさない（ビープのみ）
- 「みんなの きろく」はサーバーがなくても動く（`localTeam()` が端末内の記録を人ごとにまとめる）。
  サーバーが未設定・到達不能・あいことば違いのときも、理由を出したうえで端末内の分を表示する
  （`showLocalTeam()`）。行き止まりの画面を作らない
- `localStorage` はブラウザ側の都合で消える（URLが変わる／iOS Safariの7日ルール／データ削除）。
  「バックアップ（こえと きろく）」でファイルに出し入れできるので、消えた相談が来たらまずそれを案内する。
  `store.set` は失敗すると false を返す（保存できたか必ず見る。黙って成功扱いにしない）
- 自分で `display` を指定した要素にも `hidden` が効くよう `[hidden]{display:none!important}` を入れてある（消さない）
- **ケロとコロの声は重ねない**。`playVoiceParts()` が部品（`voicePartsFor()` が返す関数）を1つずつ待って鳴らす。
  `babble()`/`playRec()` は秒数を、`speakAsync()` は Promise を返す約束。新しい音を足すときもこの形に合わせる。
  `stopVoice()`（`voiceSeq` を進めて鳴っている音を止める）は次の問題・中断・再スタートで必ず呼ぶ。
  正解の自動送りは声が終わるのを待つ（`voiceDone?.then(...)`）ので、声を変えたら `seq.mjs` 相当の順番テストも通すこと
