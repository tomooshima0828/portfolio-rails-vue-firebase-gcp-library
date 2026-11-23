# Brakeman と puma を上げる

Issue: #45

## 目的

CI の api-security を通す。main から作ったすべてのブランチで、api-security が次の2つの理由で失敗し、PR をマージできない(PR #44 で発覚)。

1. Brakeman 8.1.1 が 2026-11-20 に公開され、「Brakeman 8.1.0 is not the latest version 8.1.1」で失敗する。`api/bin/brakeman` は、Rails が生成したとおり `--ensure-latest` を付けて Brakeman を実行するため、最新の版でなければ、検査の結果に関係なく失敗する
2. 脆弱性のデータベース(ruby-advisory-db)が 2026-11-22 に更新され、bundler-audit が、puma 8.0.3 の脆弱性を2件見つけた(Brakeman を上げる作業の中で発覚)

Brakeman は、Rails のコードを実行せずに読み、SQL インジェクションや XSS などの危険な書き方を見つける検査ツール(静的解析)である。puma は、Rails の前でリクエストを受ける Web サーバーで、本番の Cloud Run でも動いている。

| gem | 今の版 | 上げる版 | 理由 |
|---|---|---|---|
| brakeman | 8.1.0 | 8.1.1(2026-11-20 公開) | 最新の版でないため |
| puma | 8.0.3 | 8.0.4(2026-11-17 公開) | 脆弱性2件。下の表 |

| puma の脆弱性 | 内容 | このアプリへの実害 |
|---|---|---|
| GHSA-4v6q-hvv7-49h9 | SSL の接続で、メモリを使い果たすことがある | ほぼない。本番では HTTPS の処理を Cloud Run が行い、puma は SSL を扱わない |
| GHSA-rhww-p99c-hgj9 | JRuby の HTTP パーサーで、リクエストのヘッダーがパスとクエリを書き換えられる | ない。このアプリは JRuby ではない |

## やること

- brakeman を 8.1.1 に、puma を 8.0.4 に上げる。ほかの gem は上げない

## やらないこと

- `bin/brakeman` の `--ensure-latest` を外すこと。Brakeman の新しい版では、新しい検査が追加される。古い版のまま検査が成功しても、新しい検査をしていないだけの可能性があり、`--ensure-latest` があればそれに気づける。新しい版は1〜2か月に1回公開され(2026-08-12、10-01、11-20)、そのたびに小さな PR が必要になるが、検査ツールを最新に保つ費用として小さい。急ぎの修正が止まって困ったときに、外すかどうかを ADR で決める
- puma 8.1 系(8.1.2)への更新。8.1 系は機能が増える版で、今回の脆弱性は 8.0.4 で直っている。Issue #40 と同じ判断
- 本番の Cloud Run のイメージの作り直し。PR #44(自動デプロイ)をマージしたときに、自動デプロイが、この PR の変更を含むイメージを作る
- Dependabot など、部品の版を見張る仕組み(フェーズ5)
- ほかの gem の更新

## 完了条件

- AC-1:`bin/brakeman` は成功する(最新の版で実行され、警告がない)
- AC-2:`bin/bundler-audit` は、脆弱性を報告しない
- AC-3:`bundle exec rspec`、`bin/rubocop` は、上げる前と同じく成功する
- AC-4:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

1. `docs/specs/045-bump-brakeman-puma.md`:この仕様書
2. `api/Gemfile.lock`:次の2つのコマンドで、brakeman と puma の版の2行だけを変える。更新後に api のイメージを作り直す。2つの gem の変更を1コミットにする
   - `bundle update brakeman --conservative`
   - `bundle update puma --patch --conservative`

### 判断したこと

- **`Gemfile` は変えない**。`gem "brakeman", require: false` には版の指定がなく、`gem "puma", ">= 5.0"` は 8.0.4 を許す。`Gemfile.lock` だけを更新すればよい
- **puma は `--patch` で、最後の桁だけを上げる**。付けないと、Gemfile の範囲で一番新しい 8.1.2 まで上がる。Issue #40 と同じ
- **`--conservative` で、2つが使うほかの gem(brakeman の racc、puma の nio4r)は上げない**。Issue #25、#40 と同じ
- **brakeman と puma を1つの Issue にする**。どちらも「CI の api-security を通す」という同じ目的で、片方だけでは CI が通らない。Issue #40 で puma と msgpack をまとめたのと同じ
- **Issue #20、#25、#40 と同じく、別の PR にする**。PR #44(自動デプロイ)の変更と混ぜない。この PR がマージされた後に、PR #44 に main を取り込めば、CI が通る
