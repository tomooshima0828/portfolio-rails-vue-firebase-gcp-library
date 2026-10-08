# 開発の流れ(SDD × GitHub)

仕様駆動開発(SDD)を、GitHub の Issue・PR・Projects と組み合わせて進める。
前提となる方針は [principles.md](principles.md)、AI への作業ルールは [CLAUDE.md](../CLAUDE.md) にある。

## 役割分担

仕様書ファイルと Issue は二択ではなく、役割が違うので両方使う。

| | 仕様書(`docs/specs/`) | Issue | PR |
|---|---|---|---|
| 書くこと | システムが**どう振る舞うべきか** | **何をやるか**と進み具合 | 実際の変更と、その説明 |
| 寿命 | 残り続ける。仕様が変われば更新する | 作業が終われば Close | マージで完了 |
| 答える問い | 「この機能は今どういう仕様か?」 | 「どこまで進み、次に何をするか?」 | 「何を・なぜ変えたか?」 |

進捗は GitHub Projects のボード(Todo / In Progress / Done)で見る。

## 流れ

```
① spec を書く    → PR(docs/specs/NNN-名前.md)→ マージ = 仕様の合意
② タスクに分ける  → 親 Issue(spec 単位)の下に、子 Issue を 1ファイル(1実装箇所)ごとに作る
③ 実装する       → 1 子 Issue = 1 ブランチ = 1 PR(本文に「Closes #番号」)
④ 確認する       → CI が通り、動作確認の結果を PR に残してマージ
```

例:

```
docs/specs/001-article-posting.md   ← 仕様(残り続ける)
        ↑ リンク
Issue #10「spec 001: 記事投稿」      ← 親 Issue(機能単位の進捗)
  ├ #11 記事モデルを作る             ← 子 Issue(1ファイル1タスク)
  ├ #12 記事の作成 API を作る
  └ #13 投稿フォームを作る
        ↓ Closes #11
PR「記事モデルを作る」               ← 実装
```

## 単位のルール

- **1 子 Issue = 1ファイル(1実装箇所)= 1 ブランチ = 1 PR**。そのファイルのテストは同じ PR に含めてよい。
- **例外:生成コマンド**。`rails new`、`npm create vue`、`rails g migration` など、一度に複数ファイルを作るコマンドは「コマンド1回 = 1 PR」とする。PR では主要なファイルだけ説明する。

## 仕様が途中で変わったとき

1. 仕様書ファイルを直す PR を先に出し、マージする。
2. 影響する子 Issue を追加・修正する。
3. 実装の PR に進む。

コードだけ先に変えて、仕様書が古いまま残る状態を作らない。

## 名前の付け方

| 対象 | 形式 | 例 |
|---|---|---|
| 仕様書 | `docs/specs/NNN-名前.md`(3桁連番) | `docs/specs/001-article-posting.md` |
| ADR | `docs/adr/NNNN-名前.md`(4桁連番) | `docs/adr/0001-database-hosting.md` |
| spec のブランチ | `spec/NNN-名前` | `spec/001-article-posting` |
| 実装のブランチ | `feature/Issue番号-名前` | `feature/11-article-model` |
| 修正のブランチ | `fix/Issue番号-名前` | `fix/15-title-validation` |
| 文書のブランチ | `docs/名前` | `docs/development-flow` |

## PR に書くこと

- 何を変えたか(このファイルの責務)
- なぜそう書いたか(代替案があれば、選んだ理由)
- 対応する spec と Issue(`Closes #番号`)
- 動作確認の方法と結果

(PR テンプレート `.github/pull_request_template.md` で欄を用意する。作成予定)

## ブランチ保護(設定予定)

一人開発では自分の PR を自分で承認できないため、次の設定にする。

- `main` への直接 push を禁止し、変更は PR 経由にする
- 承認数は 0
- CI の成功を必須にする(CI 導入後)
