# CLAUDE.md

Knowledge Library(仮)。Rails API + Vue 3 SPA を Firebase / Google Cloud 上で動かすポートフォリオ。
目的・優先順位・非目標は [docs/principles.md](docs/principles.md)、GitHub での進め方は [docs/development-flow.md](docs/development-flow.md)、要件と技術一覧は [HANDOFF.md](HANDOFF.md) を参照。

## 進め方(最重要)

このプロジェクトは **仕様駆動開発(SDD)** で、**実装内容をオーナーが理解することを最優先**する。速さより理解を取る。

1. **仕様が先**。コードを書く前に `docs/specs/` の該当 spec が存在し、合意済みであること。なければ spec の下書きから始める。
2. **1回に書くのは 1ファイル(1実装箇所)だけ**。複数ファイルを一度に作らない。ただし、そのファイルのテストは対にしてよい。
3. **書く前に説明する**。次の3点を短く伝え、承認を得てから書く。
   - 何を書くか(このファイルの責務)
   - なぜそう書くか(代替案があれば、選んだ理由)
   - どの spec・要件に対応するか
4. **書いた後に説明する**。重要な行や、初見で分かりにくい Rails / Vue / Firebase の仕組みを補足する。
5. **動作確認まで行って 1 タスク完了**。テストの実行結果、または手動確認の結果を報告する。通らないものを「完了」と言わない。
6. 次のファイルに進むかどうかは、オーナーの指示を待つ。先回りして実装しない。

## 判断の記録

- 技術選定や設計の分かれ道では、`docs/adr/` に 1判断1ファイルで残す(背景、選択肢、決定、理由)。
- 迷ったら黙って決めず、選択肢と推奨を示して聞く。

## コーディング方針

- 既存コードの命名・書き方・コメント量に合わせる。
- 過剰な抽象化や、spec にない機能を足さない。
- テストは RSpec(request spec 中心)と Vitest。静的解析は RuboCop / Brakeman / vue-tsc。

## 機密情報の扱い

次のものは読まない・書かない・出力しない。
- `.env*`、`config/master.key`、サービスアカウントの鍵ファイル
- 本番データ、個人情報

- 秘密情報を表示するコマンド(`cat .env`、`printenv`、`rails credentials:show` など)を実行しない。deny は Read ツールしか止められないため、Bash 経由は自分で守る。
- 鍵の発行や Secret Manager への登録など、秘密情報を扱う作業はオーナーに任せ、手順の説明にとどめる。

詳細は [docs/ai-guideline.md](docs/ai-guideline.md)。Read の禁止は [.claude/settings.json](.claude/settings.json) の deny で設定済み。

## Git

- GitHub Flow。デフォルトブランチは `main`。変更は PR 経由。
- 仕様は `docs/specs/` のファイル、タスクは Issue、実装は PR。1 子 Issue = 1ファイル = 1 ブランチ = 1 PR。詳細とブランチ名の付け方は [docs/development-flow.md](docs/development-flow.md)。
- 実装を始める前に、対応する Issue 番号を確認する。PR 本文には `Closes #番号` と対応 spec を書く。
- コミットや push は、オーナーが依頼したときだけ行う。
