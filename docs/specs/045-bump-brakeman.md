# Brakeman を 8.1.1 に上げる

Issue: #45

## 目的

CI の api-security を通す。Brakeman 8.1.1 が 2026-11-20 に公開され、api-security が「Brakeman 8.1.0 is not the latest version 8.1.1」で失敗する。`api/bin/brakeman` は、Rails が生成したとおり `--ensure-latest` を付けて Brakeman を実行するため、最新の版でなければ、検査の結果に関係なく失敗する。main から作ったすべてのブランチで失敗し、PR をマージできない(PR #44 で発覚)。

Brakeman は、Rails のコードを実行せずに読み、SQL インジェクションや XSS などの危険な書き方を見つける検査ツール(静的解析)である。

## やること

- Brakeman を 8.1.0 から 8.1.1 に上げる。ほかの gem は上げない

## やらないこと

- `bin/brakeman` の `--ensure-latest` を外すこと。Brakeman の新しい版では、新しい検査が追加される。古い版のまま検査が成功しても、新しい検査をしていないだけの可能性があり、`--ensure-latest` があればそれに気づける。新しい版は1〜2か月に1回公開され(2026-08-12、10-01、11-20)、そのたびに小さな PR が必要になるが、検査ツールを最新に保つ費用として小さい。急ぎの修正が止まって困ったときに、外すかどうかを ADR で決める
- 本番の Cloud Run のイメージの作り直し。Brakeman は `group :development, :test` の gem で、本番のイメージは `BUNDLE_WITHOUT="development"` で作るため、イメージには入る。ただし `require: false` で、Rails の実行時には読み込まない。次のイメージは、PR #44 のマージで自動デプロイが作る
- Dependabot など、部品の版を見張る仕組み(フェーズ5)
- ほかの gem の更新

## 完了条件

- AC-1:`bin/brakeman` は成功する(最新の版で実行され、警告がない)
- AC-2:`bundle exec rspec`、`bin/rubocop`、`bin/bundler-audit` は、上げる前と同じく成功する
- AC-3:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

1. `docs/specs/045-bump-brakeman.md`:この仕様書
2. `api/Gemfile.lock`:`bundle update brakeman --conservative` で、brakeman の版の1行だけを変える。更新後に api のイメージを作り直す

### 判断したこと

- **`Gemfile` は変えない**。`gem "brakeman", require: false` には版の指定がないので、8.1.1 も入る。`Gemfile.lock` だけを更新すればよい
- **`--conservative` で、brakeman が使う racc は上げない**。差分を brakeman の1行に収める。Issue #25、#40 と同じ
- **Issue #20、#25、#40 と同じく、別の PR にする**。PR #44(自動デプロイ)の変更と混ぜない。この PR がマージされた後に、PR #44 に main を取り込めば、CI が通る
