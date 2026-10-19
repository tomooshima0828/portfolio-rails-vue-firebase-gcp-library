# 0003. CI は Docker Compose を使わず、GitHub Actions の標準の仕組みで動かす

- 日付:2026-10-19
- 状態:採用

## 背景

[ADR 0002](0002-local-dev-on-docker.md) で、ローカル開発はすべて Docker Compose で行うことにした。#7 で GitHub Actions の CI を作るにあたり、CI でも Docker Compose を使うかを決める必要があった。

CI は、GitHub が貸す使い捨ての Linux マシン(ランナー)で動く。ランナーには Docker と git が入っているが、Ruby 3.4 や PostgreSQL 17 は自分で用意する。

## 選択肢

1. Actions の標準の仕組み。Ruby と Node は Action(ruby/setup-ruby、actions/setup-node)でランナーに入れ、PostgreSQL は services でジョブの横に起動する
2. CI でも Docker Compose。`docker compose build` でイメージを作り、`docker compose run --rm api bundle exec rspec` のように、ローカルと同じコマンドで実行する

## 決定

1 を選ぶ。

## 理由

- **ADR 0002 で Docker を選んだ一番の理由が、CI には当てはまりにくい**。ローカルで Docker にしたのは、Mac の Ruby 3.2.2 や Homebrew の PostgreSQL 14 と食い違うのを避けるためだった。ランナーは毎回まっさらで、1 でもバージョンをローカルとそろえられる(Ruby は `api/.ruby-version`、Node は 24.22.0、PostgreSQL は `postgres:17`)。
- **速い**。1 は gem と npm のキャッシュが標準で効き、2回目以降はインストールがほぼ不要になる。2 は毎回イメージを作るので遅く、速くするにはイメージのキャッシュの設定が別に要る。
- **情報が多い**。Rails が生成する CI も 1 の形で、困ったときに調べやすい。

2 は、ローカルと完全に同じイメージで動くので、環境の差による失敗が起きない。1 を選ぶことで、この利点は捨てる。

## 影響

- ローカルと CI で、コマンドの書き方が変わる。ローカルは `docker compose run --rm api bundle exec rspec`、CI は `bundle exec rspec`。
- バージョンを上げるときは、ローカルと CI の両方を直す。Ruby は `api/.ruby-version` を両方が読むので1か所で済む。Node は `web/Dockerfile.dev` と `ci.yml`、PostgreSQL は `compose.yaml` と `ci.yml` の2か所になる。
- 「ローカルでは通るのに CI で失敗する」ことが起きたら、まず環境の差を疑う。それが続くようなら、2 を検討し直す。
