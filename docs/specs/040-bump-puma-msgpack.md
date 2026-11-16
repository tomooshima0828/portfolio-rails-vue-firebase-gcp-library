# puma と msgpack を、脆弱性が直った版に上げる

Issue: #40

## 目的

CI の api-security を通す。脆弱性のデータベース(ruby-advisory-db)が 2026-11-15 に更新され、bundler-audit が、main にある puma と msgpack の脆弱性を見つけた。main から作ったすべてのブランチで api-security が失敗し、PR をマージできない(PR #39 で発覚)。

| gem | 今の版 | 件数 | 主な内容 | 直った版 |
|---|---|---|---|---|
| puma | 8.0.2 | 7 | 遅いクライアントや、読むのをやめたクライアントに、ワーカーや接続が待たされ続ける。TLS の設定の扱いの誤り | 8.0.3(2026-11-13 公開) |
| msgpack | 1.8.5 | 1 | JRuby のデコーダーだけが対象。このアプリは JRuby ではないので実害はない | 1.8.7(2026-10-30 公開) |

puma は、Rails の前でリクエストを受ける Web サーバーで、本番の Cloud Run でも動いている。msgpack は、bootsnap(Rails の起動を速くする gem)が使っている。

## やること

- puma を 8.0.3 に、msgpack を 1.8.7 に上げる。ほかの gem は上げない

## やらないこと

- puma 8.1 系(8.1.0、8.1.1)への更新。8.1.0 は 2026-11-14 に出たばかりの、機能が増える版で、今回の脆弱性は 8.0.3 で直っている
- 本番の Cloud Run のイメージの作り直し。Issue #32 で Rails をデプロイし直すときに、新しいイメージで行う
- Dependabot や `npm audit` など、部品の版を見張る仕組み(フェーズ5)
- ほかの gem の更新

## 完了条件

- AC-1:`bin/bundler-audit` は、脆弱性を報告しない
- AC-2:`bundle exec rspec`、`bin/rubocop`、`bin/brakeman` は、上げる前と同じく成功する
- AC-3:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

1. `docs/specs/040-bump-puma-msgpack.md`:この仕様書
2. `api/Gemfile.lock`:`bundle update puma msgpack --patch --conservative` で、2つの gem だけを、同じマイナー版の中の新しい版に上げる。更新後に api のイメージを作り直す。コマンド1回で1コミット

### 判断したこと

- **`Gemfile` は変えない**。`gem "puma", ">= 5.0"` は 8.0.3 を許す。msgpack は Gemfile に書いておらず、bootsnap が `~> 1.5` で求めているので、1.8.7 もこの範囲に入る。`Gemfile.lock` だけを更新すればよい
- **`--patch` で、最後の桁だけを上げる**。puma は、`--patch` を付けないと、Gemfile の範囲で一番新しい 8.1.1 まで上がる。脆弱性を直すのに要るのは 8.0.3 で、変更が一番小さい。8.1 系に上げるかは、必要になったときに別に決める
- **`--conservative` で、2つが頼っているほかの gem(puma の nio4r など)は上げない**。Issue #25 と同じ
- **Issue #20、#25 と同じく、別の PR にする**。PR #39(ノートの整理)と Issue #32(Firebase Hosting)の変更と混ぜない。どちらも、この PR がマージされた後に main を取り込めば、CI が通る
