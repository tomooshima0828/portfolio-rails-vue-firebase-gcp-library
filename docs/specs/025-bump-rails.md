# Rails を 8.1.4.1 に上げて脆弱性を直す

Issue: #25

## 目的

CI の api-security を通す。脆弱性のデータベース(ruby-advisory-db)が更新され、bundler-audit が、main にある Rails 8.1.4 の脆弱性を見つけた。main から作ったすべてのブランチで api-security が失敗し、PR をマージできない(PR #24 で発覚)。

| gem | 件数 | 重さ |
|---|---|---|
| actionpack | 7 | High 2、Medium 4、Low 1 |
| activestorage | 7 | Critical 1、High 1、Medium 4、Low 1 |
| actionview | 4 | Medium 4 |
| activesupport | 2 | High 1、Medium 1 |
| actionmailbox | 1 | Low 1 |

どれも Rails を作っている gem(Rails の部品)で、Rails 8.1.4.1(2026-11-04 に公開)で直っている。

## やること

- Rails を 8.1.4.1 に上げる。Rails の部品は、Rails と同じ版に一緒に上がる。ほかの gem は上げない

## やらないこと

- Rails 8.1.4.1 より新しい版(8.2 など)への更新
- Dependabot など、gem の更新を自動で知らせる仕組み(Issue #20 と同じく、スプリントのふりかえりで決める)
- ほかの gem の更新

## 完了条件

- AC-1:`bin/bundler-audit` は、脆弱性を報告しない
- AC-2:`bundle exec rspec`、`bin/rubocop`、`bin/brakeman` は、上げる前と同じく成功する
- AC-3:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

1. `docs/specs/025-bump-rails.md`:この仕様書
2. `api/Gemfile.lock`:`bundle update rails --conservative` で、Rails と、Rails と同じ版で出る部品だけを上げる。`--conservative` で、Rails が頼っているほかの gem(rack など)は上げない。更新後に api のイメージを作り直す。コマンド1回で1コミット

### 判断したこと

- **`Gemfile` は変えない**。`gem "rails", "~> 8.1.4"` は 8.1.4 以上 8.2 未満を許すので、8.1.4.1 はこの範囲に入る。`Gemfile.lock` だけを更新すればよい
- **Issue #20 と同じく、PR #24 とは別の PR にする**。Rails の版上げは、アプリ全体に影響する。PR #24(Vue のログイン)の変更と混ぜると、何かが壊れたときに、どちらが原因かを切り分けにくい
