# さんすう・えいごノート — 作業メモ

小学1〜2年生向けの算数＋英語ドリル。`index.html` 1枚で動く静的アプリ（依存ライブラリなし）。

トップ（`#top`）から **さんすう（`#home`）／えいご（`#eigo`）／きろく（`#history`）** に わかれる。
レベル・なまえ・キャラクター・こえ（ろくおんを ふくむ）・きろくは **2つの アプリで きょうよう**。
えいごの もんだいは 4たく（`input: "choice"`）で、`makeEigo(kind, lv)` が つくる。

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
cp index.html config.js manifest.webmanifest icon.svg icon-180.png icon-192.png icon-512.png "$SD/sansu-note-site/"
(cd "$SD" && zip -qr sansu-note-site.zip sansu-note-site)
```

作った ZIP は **SendUserFile でユーザーに渡し、「解凍して Netlify のサイトの Deploys にフォルダをドラッグ」** と伝える（URLは変わらない）。

`index.html` を変えたら、中の `const BUILD = "YYYY-MM-DDx"` も必ず上げる。ホーム画面の一番下に「バージョン …」として出るので、**ユーザーが公開先を開けば最新が載っているか自分で確認できる**。渡すときは「ホーム画面の下のバージョンが ○○ になっていれば更新できています」と伝える。

**録音した声は公開先には載らない**（端末のブラウザの中にある）。デプロイしても声は増えも減りもしないので、「声が更新されているか」を聞かれたらその点を先に伝え、消えていれば「バックアップ（こえと きろく）」からの復元を案内する。

> ユーザーが Netlify サイトを GitHub リポジトリに連携したら、`main` への push で自動デプロイされるようになる。その場合はZIPの受け渡しは不要になるので、このメモを更新する。

## 変更したときの確認

```bash
npm i playwright            # 未インストールなら（この環境では /opt/node22 に既にある）
node tests/verify-questions.mjs   # 3レベル×7種類×10問×4セット=840問を自動で解いて答え合わせを照合
node tests/verify-api.mjs         # きろくサーバー（server/）のAPIを検証
node tests/verify-voice-order.mjs # ケロとコロの声が重ならないか（ことば／アニメごえ／録音）を実時間で計測
```

`verify-voice-order.mjs` は `127.0.0.1` に http-server を立てて測る（`file://` だと録音のテストができない）。

`verify-questions.mjs` は**答えを画面から独立に計算して**照合する（筆算は問題文、時計は針の角度から）。
えいごは画面から答えを出せないので、**選択肢が4つで重複なし・`.pick.ans` と答え合わせの答えが一致・
テスト側が持つ単語表（`KNOWN`。アプリの `WORDS` とは別物）と一致**、の3つで照合する。
出題や採点をいじったら必ず実行し、「しっぱい 0件 / JSエラー なし」を確認する。

判定パネルのDOM構造を変えると `verify-questions.mjs` のセレクタ（`.judge .say p b`、`.pick.ans`、`.picknum`）が追随する必要がある。
画面の いききを かえた ときは、テストの `appOf()`（トップ → さんすう／えいご）も なおす。

## 構成

| ファイル | 中身 |
| --- | --- |
| `index.html` | アプリ本体（さんすう・えいご 両方。HTML+CSS+JS、SVGのキャラクター・時計・花まるもコード生成） |
| `config.js` | きろくサーバーのURL・あいことばの既定値（空でよい） |
| `server/` | きろくサーバー。`api.mjs` が本体で、Workers版（`worker.js`）とローカル版（`dev-server.mjs`）が共用 |
| `tests/` | 上記の検証スクリプト |
| `.github/workflows/pages.yml` | GitHub Pages 用（リポジトリが private のままなので現在は動かない） |

## デザインの きまり（frontend-design でひと通り整えた。崩さない）

**コンセプトは「学習ノート」**。方眼紙・朱ペン・花まる・筆算のマスという文房具の材料だけで作る。
迷ったら「ノートと先生の赤ペンにあるか？」で決める。ここから外れる飾りは足さない。

| 使う道具 | 中身 |
| --- | --- |
| 色 | `--paper` 方眼紙／`--grid`・`--grid-fine` 罫（2段の太さ）／`--ink` えんぴつ／`--shu` 朱ペン（主役）／`--ai` 藍／`--kin` 金（星だけ）／`--midori` えいご |
| 書体 | `--f-disp` Kiwi Maru（見出し・問題文・ボタン）、`--f-body` Zen Kaku（本文・UI）、`--f-num` M PLUS Rounded（**数字とラテン文字だけ**） |
| 大きさ | `--t-xs`〜`--t-2xl` の6段だけ。新しい `font-size: .78rem` のような値を足さない |
| かどの丸み | `--r-s` 部品／`--r-m` ボタン・入力／`--r-l` ノートのページ。全部同じ丸みにしない |
| 浮き | 浮くのは**いま解いているページ（`.sheet`）だけ**（`--lift`）。設定や結果の紙は影なしで `--grid` のふちで見分ける |

- **派手さは1か所**：正解の瞬間（花まるをペンで引く `.maru .flower` と判定パネル）とトップの2枚のカード。ほかは静かに保つ
- 画面ごとに `--accent` を持つ（`#home` = 朱、`#eigo` = みどり）。見出し・レベルの選択・もくじの印はこれを使う。
  **1つの画面の中で印の色をばらけさせない**（色が何も伝えていなかったので統一した）
- 動きは正解の花まる1つだけ。カードごとのホバーや出現アニメは足さない。`prefers-reduced-motion` で必ず止める
- 次のものは**戻さない**（生成物っぽさの典型として一度取り除いた）:
  同じ丸み・同じ影のカードを並べる／どの塊の上にも字間を空けた小さいラベルを置く／
  日本語に `letter-spacing` を振る／順番でないものに 01・02 の番号を振る／ボタン文字の末尾に `→`
- 文字の大きさは、色ではなく**書体と大きさ**で目立たせる（`.lead em` は数字書体で少し大きく）

## 気をつけること

- 文章は**わかち書き**＋`word-break: keep-all` で、語の途中で改行しない
- 表示は**ライト／ダークの両テーマ**を確認する。色は `:root` のトークン経由で使う
- 画面幅 320px でも横スクロールさせない。`display: grid` の中身は `min-width: 0` を忘れると はみ出す
- ボタンは 34px 角より小さくしない（子どもが押す）
- グラフの2色は `dataviz` skill の `validate_palette.js` で検証済み（ライト `#e4523f`/`#2b6ca3`、ダーク `#e8603f`/`#3f8fd0`）。変えるなら再検証する
- 記録・録音した声・設定はすべて `localStorage`（端末内）。サーバーに送るのは記録だけ
- **録音した声は さんすうと えいごで 共通**（`REC_KEY = "sn-rec"` 1つだけ）。かたっぽ だけに する ような
  わけかたは しない。えいごの こえの えらびは べつキー（`sn-voice-en`）で、ケロ・コロの 日本語の こえとは べつ
- 「みんなの きろく」はサーバーがなくても動く（`localTeam()` が端末内の記録を人ごとにまとめる）。
  サーバーが未設定・到達不能・あいことば違いのときも、理由を出したうえで端末内の分を表示する
  （`showLocalTeam()`）。行き止まりの画面を作らない
- `localStorage` はブラウザ側の都合で消える（URLが変わる／iOS Safariの7日ルール／データ削除）。
  「バックアップ（こえと きろく）」でファイルに出し入れできるので、消えた相談が来たらまずそれを案内する。
  `store.set` は失敗すると false を返す（保存できたか必ず見る。黙って成功扱いにしない）
- 自分で `display` を指定した要素にも `hidden` が効くよう `[hidden]{display:none!important}` を入れてある（消さない）
- **ケロとコロの声は重ねない**。`playVoiceParts()` が部品（`voicePartsFor()` が返す関数）を1つずつ待って鳴らす。
  `babble()`/`playRec()` は秒数を、`speakAsync()`/`speakEnAsync()` は Promise を返す約束。新しい音を足すときもこの形に合わせる。
  えいごの よみあげも この れつの 中（ケロ → えいご → コロ）に いれる。`speakEn()` は `synth.cancel()` を
  よぶので、れつの 中では **かならず `speakEnAsync()` を つかう**（`speakEn()` は もんだいの よみあげと ためしうち だけ）。
  `stopVoice()`（`voiceSeq` を進めて鳴っている音を止める）は次の問題・中断・再スタートで必ず呼ぶ。
  正解の自動送りは声が終わるのを待つ（`voiceDone?.then(...)`）ので、声を変えたら `seq.mjs` 相当の順番テストも通すこと
