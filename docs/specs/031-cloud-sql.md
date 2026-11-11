# Cloud SQL を作り、Cloud Run の Rails から繋ぐ

Issue: #31

## 目的

本番の Rails にデータベースを繋ぎ、本番の API が記事の一覧を返すところまで進める。#30 で Rails は Cloud Run で動いたが、DB がないので `/up` しか応答できない。

DB は、このプロジェクトで初めて常に料金がかかる部品になる。どう繋ぐか、表をどう作るか、使わない期間にどうするかを、料金と安全の両方から決めて記録する。

## やること

- 本番用のプロジェクト `knowledge-library-prod` で、次を用意する
  - Cloud SQL Admin API を有効にする
  - Cloud SQL for PostgreSQL のインスタンスを作る。公開 IP を付け、承認済みネットワークは空にする
  - データベース `api_production` と、Rails が使う DB の利用者 `api` を作る
  - `api` のパスワードを、Secret Manager のシークレットに登録する(オーナーが行う)
  - 専用のサービスアカウント `api-runtime` に、Cloud SQL に繋ぐ権限と、このシークレットを読む権限を足す
- `api/config/database.yml` の本番の設定を、開発と同じ環境変数(`DB_HOST`、`DB_USERNAME`、`DB_PASSWORD`)で受け取る形にそろえる
- イメージを作り直し、Artifact Registry に push する
- マイグレーションを流す Cloud Run のジョブ `migrate` を作って実行し、表を作る
- Cloud Run のサービス `api` に DB の設定を足してデプロイし直し、`GET /api/articles` が 200 を返すことを確かめる
- インスタンスを止めたときの振る舞いを確かめ、動かし直す
- ADR を2つ書く:マイグレーションの流し方、使わない期間の扱い
- `docs/production-setup.md` に「3. Cloud SQL」の章を書く。インスタンスを削除した後に、この章で作り直せるようにする

Google Cloud の操作は、オーナーがコンソールで行う。コンソールでできない、イメージのビルドと push だけは、オーナーが手元のターミナルで行う。Claude は、操作の前に手順と理由を説明し、操作の後に gcloud の読み取りだけのコマンドで結果を確かめる。パスワードの値は、Claude は読まない(CLAUDE.md の機密情報の扱い)。

## やらないこと

- `FIREBASE_PROJECT_ID` を渡すこと、ログインが要る API(`POST /api/articles`、`GET /api/me`)を本番で動かすこと(#32。本番の Firebase の設定と一緒に行う)
- 本番の DB に記事を入れること。記事の投稿にはログインが要るので、#32 で画面から投稿する
- GitHub Actions による自動デプロイと、マイグレーションの自動実行(#33)
- Cloud Run の台数と同時実行数、Puma のスレッド数、DB の接続プール、Cloud SQL の最大接続数の関係を決めること(#35)
- 内部 IP と VPC による接続
- 予算を超えたときに、自動でインスタンスを止める仕組み
- バックアップからの復元の手順

## 完了条件

<!-- インフラの設定のタスクなので、RSpec などのテストはない。Claude が curl と gcloud の読み取りだけのコマンドで確かめ、結果を PR に残す -->

- AC-1:本番の Cloud Run のサービスに `GET /api/articles` を送ったとき、Rails は Cloud SQL から記事を読み、200 と `{ "articles": [...] }` を返す(記事を入れていないので、作った直後は空の配列)
- AC-2:Cloud SQL のインスタンスは、承認済みネットワークを持たない。Rails は、Cloud Run の Cloud SQL 接続(Unix ソケット)を通って繋ぐ
- AC-3:Rails は、DB のパスワードを Secret Manager のシークレットから受け取る。イメージにも、Cloud Run の設定にも、リポジトリにも、パスワードの値は含まれない
- AC-4:専用のサービスアカウント `api-runtime` が持つ権限は、`rails-master-key` と DB のパスワードのシークレットを読むことと、Cloud SQL に繋ぐこと(Cloud SQL クライアント)だけ
- AC-5:マイグレーションのジョブを実行したとき、ジョブは `rails db:migrate` を流して成功し、`members` と `articles` の表を作る
- AC-6:Cloud SQL のインスタンスが止まっている場合、Rails は `GET /api/articles` に 500 を返し、`GET /up` には 200 を返す。インスタンスを動かし直すと、`GET /api/articles` は再び 200 を返す

## 設計

### 変更するファイル

セットアップのタスクなので、テストを先に書く順番の対象外。

1. `docs/specs/031-cloud-sql.md`:この仕様書
2. `docs/adr/0006-run-migrations-with-cloud-run-jobs.md`:マイグレーションを Cloud Run のジョブで流す判断
3. `docs/adr/0007-cloud-sql-idle-periods.md`:使わない期間の扱い(止める・削除する)の判断
4. `docs/notes/cloud-sql-connection.html`:学習ノート。Rails から DB までの繋がり方、パスワードがどう渡るか、ジョブとサービスの役割の図
5. `api/config/database.yml`:本番の `username` と `password` の上書きを消し、開発と同じ環境変数で受け取る
6. (ファイルではない操作)API の有効化 → インスタンス → データベースと利用者 → シークレット(オーナー)→ 権限 → イメージのビルドと push → ジョブの作成と実行 → サービスのデプロイ → 確認 → 止めて確かめ、動かし直す
7. `docs/production-setup.md`:「3. Cloud SQL」の章。6 で実際に行った手順を書く
8. `docs/architecture.md`:本番の構成に Cloud SQL とジョブを書き足す

### 本番の値

| 項目 | 値 |
|---|---|
| インスタンス | `db`。接続名は `knowledge-library-prod:asia-northeast1:db` |
| エディション | Enterprise |
| データベースのバージョン | PostgreSQL 17(ローカルの `compose.yaml` と同じ) |
| リージョン、ゾーン | `asia-northeast1`(東京)、単一ゾーン(高可用性なし) |
| マシン | 共有コア、1 vCPU、0.614GB(db-f1-micro) |
| ストレージ | SSD、10GB。自動増加はしない |
| 接続 | 公開 IP あり、承認済みネットワークなし、内部 IP なし |
| バックアップ | 自動バックアップあり(7個まで保持)。ポイントインタイム リカバリはなし |
| 削除からの保護 | 有効 |
| データベース | `api_production` |
| DB の利用者 | `api`(パスワードで認証する) |
| シークレット | `db-password`。Cloud Run には版の番号を指定して渡す |
| Rails に渡す環境変数 | `DB_HOST=/cloudsql/knowledge-library-prod:asia-northeast1:db`、`DB_USERNAME=api`、`DB_PASSWORD`(シークレットから) |
| マイグレーションのジョブ | Cloud Run のジョブ `migrate`。サービス `api` と同じイメージ、身分証、環境変数、Cloud SQL 接続を使い、`bin/rails db:migrate` を実行する。タスク数 1、再試行 0 |

### 判断したこと

- **公開 IP と、Cloud Run の Cloud SQL 接続で繋ぐ**。Cloud Run の設定でインスタンスを指定すると、Cloud Run がコンテナの中に `/cloudsql/接続名` という接続口(Unix ソケット)を用意し、その先を暗号化して Cloud SQL まで繋ぐ。承認済みネットワークを空にするので、パスワードを知っていても、インターネットから直接は繋げない。繋げるのは、Cloud SQL クライアントの権限を持つ身分証だけになる。内部 IP と VPC で繋ぐ方法は、DB をインターネットから完全に切り離せ、止めたときの費用も安い。ただ、VPC、プライベート サービス アクセス、Cloud Run の VPC への出口の3つの部品が増え、作り直しの手順も長くなる。Google の文書の標準で、部品が一番少ない方を選ぶ
- **Cloud SQL クライアントの権限は、プロジェクトに付ける**。Cloud SQL には、Secret Manager のように、インスタンスの画面からそのインスタンスにだけ権限を付ける仕組みがない。プロジェクトに付けると、このプロジェクトのすべてのインスタンスに繋げるようになるが、インスタンスは `db` の1つだけなので、範囲は変わらない。IAM の条件で `db` だけに絞る方法もあるが、範囲が同じまま設定が増えるので選ばない。この権限でできるのは、インスタンスの情報を読むことと、繋ぐことだけで、DB の中身を読むには、さらに DB の利用者のパスワードが要る。#30 の AC-2(プロジェクト全体への権限は持たない)は、この権限の分だけ変わる
- **マイグレーションは、Cloud Run のジョブで流す**。理由は [ADR 0006](../adr/0006-run-migrations-with-cloud-run-jobs.md)
- **使わない期間の扱い**は [ADR 0007](../adr/0007-cloud-sql-idle-periods.md)
- **一番小さいマシン(共有コア)にする**。利用者はオーナー1人で、月の費用は、本体とディスクで約1,900円の見込み。予算の 3,000円に収まる。共有コアは SLA(稼働の保証)の対象外だが、ポートフォリオでは困らない
- **Enterprise エディションにする**。コンソールの初めの値は Enterprise Plus だが、共有コアのマシンを選べるのは Enterprise だけ
- **ストレージは SSD 10GB で、自動増加はしない**。10GB は選べる最小の大きさ。HDD にすると月150円ほど安いが、後から SSD に変えられない。自動増加は、思わぬ費用を防ぐために使わない。記事のデータは小さいので、10GB で足りる
- **自動バックアップは残す**。誤ってデータを消したときに戻せるようにする。DB が小さいので、費用はほぼかからない。ポイントインタイム リカバリは、変更の記録(ログ)を保存する分の費用がかかり、秒単位で戻す必要もないので使わない。インスタンスを削除すると、バックアップも一緒に消える
- **削除からの保護を有効にする**。誤操作で消さないため。ADR 0007 で削除するときは、先に保護を外す
- **DB の利用者 `api` を作り、`postgres` を使わない**。`postgres` は Cloud SQL が最初に作る管理用の利用者で、Rails が普段使うものと分ける。コンソールで作る利用者は、Cloud SQL の管理用の役割(`cloudsqlsuperuser`)を持つので、権限は `postgres` に近い。表ごとに権限を絞るのは、利用者を SQL で作る必要があり、このタスクではしない
- **データベース `api_production` は、コンソールで作る**。ジョブでは `rails db:migrate` だけを流し、データベースを作る `db:create` や `db:prepare` は使わない。データベースを作る権限を、Rails に持たせなくて済む
- **`database.yml` の本番の設定を、開発と同じ環境変数にそろえる**。Rails が生成した本番の設定は、利用者名を `api` に固定し、パスワードを `API_DATABASE_PASSWORD` で受け取る。開発は `DB_USERNAME` と `DB_PASSWORD` で受け取るので、環境ごとに名前が違い、読むときに迷う。接続先 `DB_HOST` は、すでに共通の名前で受け取っている。名前をそろえると、本番の設定に残るのはデータベース名だけになる
- **DB のパスワードは、シークレット `db-password` から環境変数として渡す**。#30 の `RAILS_MASTER_KEY` と同じ理由で、値を Cloud Run の設定に直接書かず、版の番号を指定して渡す。権限は、シークレット1つにだけ付ける
