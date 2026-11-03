# nokogiri、loofah、rails-html-sanitizer の脆弱性を直す

Issue: #20

## 目的

CI の api-security を通す。2026-11-02 に更新された脆弱性のデータベース(ruby-advisory-db)で、bundler-audit が、main にある次の gem の脆弱性を見つけた。main から作ったすべてのブランチで api-security が失敗し、PR をマージできない(PR #19 で発覚)。

| gem | 今の版 | 直った版 | 件数 |
|---|---|---|---|
| nokogiri | 1.19.4 | 1.19.5 以上 | 24 |
| loofah | 2.25.2 | 2.25.3 以上 | 6 |
| rails-html-sanitizer | 1.7.1 | 1.7.2 以上 | 2 |

3つとも、Rails が HTML を扱うために使う gem で、このアプリのコードから直接は使っていない。

## やること

- 3つの gem を、脆弱性が直った版に上げる。ほかの gem は上げない

## やらないこと

- Dependabot など、gem の更新を自動で知らせる仕組み。入れるかどうかは、スプリントのふりかえりで決める
- ほかの gem の更新

## 完了条件

- AC-1:`bin/bundler-audit` は、脆弱性を報告しない
- AC-2:`bundle exec rspec`、`bin/rubocop`、`bin/brakeman` は、上げる前と同じく成功する
- AC-3:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

1. `docs/specs/020-bump-nokogiri-loofah.md`:この仕様書
2. `api/Gemfile.lock`:`bundle update nokogiri loofah rails-html-sanitizer --conservative` で、3つの gem だけを上げる。`--conservative` で、3つが頼っているほかの gem は上げない。更新後に api のイメージを作り直す。コマンド1回で1コミット
