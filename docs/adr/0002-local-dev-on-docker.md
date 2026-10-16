# 0002. ローカル開発をすべて Docker で行う

- 日付:2026-10-16
- 状態:採用

## 背景

#5 で Rails API の土台を作るにあたり、Rails と PostgreSQL をローカルでどう動かすかを決める必要があった。#6 で作る Vue も同じ問題を抱える。

手元の Mac には rbenv の Ruby 3.2.2 と Homebrew の PostgreSQL 14 が入っている。このプロジェクトで使う Ruby 3.4 とも、本番の Cloud SQL(PostgreSQL 17)とも合っていない。

## 選択肢

1. Rails は手元(rbenv)で動かし、PostgreSQL だけ Docker で動かす
2. Rails、Vue、PostgreSQL をすべて Docker Compose で動かす
3. Dev Containers(VS Code ごとコンテナの中で開発する。`rails new --devcontainer` で生成できる)

## 決定

2 を選ぶ。Rails と PostgreSQL は #5 で、Vue は #6 で `compose.yaml` に足す。

## 理由

- **起動と停止がコマンド1つで済む**。`docker compose up` / `docker compose down` で Rails、Vue、PostgreSQL をまとめて扱える。それぞれを個別に起動するより手間が少ない。
- **Mac の Ruby や PostgreSQL のバージョンを気にしなくてよい**。Ruby 3.4 を rbenv で入れる手間も、Homebrew の PostgreSQL 14 とのポートの衝突もなくなる。
- **本番の考え方を先に練習できる**。フェーズ2の Cloud Run も、イメージからコンテナを起動して動かす。イメージの作成、環境変数での接続先の受け渡し、コンテナの中の調査に、ローカルの段階から慣れておける。
- **重さは問題になりにくい**。M2 Mac は Docker Desktop との相性がよく、Ruby と PostgreSQL の公式イメージも Apple Silicon 用が用意されている。

1 は、ローカルが軽く、構成も単純でエディタの補完もそのまま動く。ただ、起動の手間と、Mac の Ruby の管理が残る。
3 は、2 の弱点であるエディタの補完を解消できるが、VS Code に強く依存し、設定ファイルも増える。

## 影響

- テストやマイグレーションなど、起動以外のコマンドはコンテナの中で実行する(`docker compose exec api …` など)。よく使うコマンドは README に書く。
- gem を変えたら、イメージを作り直す(`docker compose build api`)。
- Mac に Ruby 3.4 がないので、エディタの補完(Ruby LSP)は弱くなる。困った場合は 3 の Dev Containers を検討する。
- 開発用の `api/Dockerfile.dev` と、`rails new` が作る本番用の `api/Dockerfile` を分ける。`compose.yaml` は本番では使わない。
- M2 は ARM の CPU で、Cloud Run は amd64 で動く。フェーズ2で本番用のイメージを作るときは、`--platform linux/amd64` を指定する。

## 参考

- 2つの構成の比較:[docs/notes/local-dev-docker.html](../notes/local-dev-docker.html)
