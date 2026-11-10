# Rails を Cloud Run に手動でデプロイする

Issue: #30

## 目的

本番で Rails を動かす土台を作る。Rails のイメージを Artifact Registry に置き、Cloud Run で動かし、本番の URL で応答するところまでを手で一度通す。

手で通しておくと、#33(GitHub Actions による自動デプロイ)で、何を自動にするのかが分かる。DB は #31 で繋ぐので、このタスクでは繋がない。

## やること

- `api/bin/docker-entrypoint` から、起動のたびに `rails db:prepare` を実行する処理を外す。DB がない状態でも起動できるようにするため
- 本番用のプロジェクト `knowledge-library-prod` で、次を用意する
  - Cloud Run、Artifact Registry、Secret Manager の API を有効にする
  - イメージの置き場(Artifact Registry のリポジトリ)を作る
  - Cloud Run で Rails を動かす専用のサービスアカウントを作る
  - `RAILS_MASTER_KEY` の値を、Secret Manager のシークレットに登録する(オーナーが行う)
  - 専用のサービスアカウントに、このシークレットを読む権限だけを付ける
- 手元の Docker で `api/Dockerfile` からイメージを作り、Artifact Registry に push する
- Cloud Run にデプロイし、`/up` が 200 を返すことを確かめる
- `docs/production-setup.md` に「2. Cloud Run」の章を書く

gcloud のコマンドは、Claude が1つずつ説明してから実行する。シークレットの値の登録だけは、オーナーが行う(CLAUDE.md の機密情報の扱い)。

## やらないこと

- Cloud SQL の作成と DB の接続、マイグレーションの実行方法(#31)
- GitHub Actions による自動デプロイと Workload Identity 連携(#33)
- `FIREBASE_PROJECT_ID` など、API が動くための値を渡すこと。DB が繋がり、API が動くようになるタスクで渡す
- Vue の配信、`/api` の転送(#32)
- 独自ドメイン
- 同時実行数などのスケールの詳しい設定と、Cloud SQL の接続数との関係(フェーズ2の後半のタスク)

## 完了条件

<!-- インフラの設定のタスクなので、RSpec などのテストはない。Claude が curl と gcloud の読み取りだけのコマンドで確かめ、結果を PR に残す -->

- AC-1:本番の Cloud Run のサービスに `GET /up` を送ったとき、Rails は 200 を返す
- AC-2:Cloud Run のサービスは、専用のサービスアカウントで動く。このサービスアカウントが持つ権限は、`RAILS_MASTER_KEY` のシークレットを読むことだけで、プロジェクト全体への権限は持たない
- AC-3:Cloud Run のサービスは、`RAILS_MASTER_KEY` を Secret Manager のシークレットから受け取る。イメージにも、Cloud Run の設定にも、鍵の値は含まれない
- AC-4:専用のサービスアカウントにシークレットを読む権限がない場合、Cloud Run はデプロイを失敗させ、その版を起動しない

## 設計

### 変更するファイル

セットアップのタスクなので、テストを先に書く順番の対象外。

1. `docs/specs/030-cloud-run-deploy.md`:この仕様書
2. `api/bin/docker-entrypoint`:`rails db:prepare` を実行する処理を外す
3. (ファイルではない操作)API の有効化 → Artifact Registry のリポジトリ → サービスアカウント → シークレット(オーナー)→ 権限を付けずにデプロイして失敗を確かめる(AC-4)→ 権限の付与 → デプロイ → 確認
4. `docs/production-setup.md`:「2. Cloud Run」の章。3 で実際に行った手順を書く

### 本番の値

| 項目 | 値 |
|---|---|
| リージョン | `asia-northeast1`(東京)。Artifact Registry と Cloud Run をそろえる |
| Artifact Registry のリポジトリ | `knowledge-library`(Docker 形式) |
| イメージ | `asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:<git のコミットの短い ID>` |
| Cloud Run のサービス | `api` |
| サービスアカウント | `api-runtime@knowledge-library-prod.iam.gserviceaccount.com` |
| シークレット | `rails-master-key`。Cloud Run には版の番号を指定して渡す |
| インスタンス数 | 最小 0、最大 1 |
| CPU の割り当て | リクエストを処理している間だけ(リクエスト単位の課金) |
| メモリ | 512MiB(Cloud Run の既定) |
| 呼び出せる人 | 誰でも(認証なし) |

### 判断したこと

- **起動時の `rails db:prepare` を外す**。Rails が生成した entrypoint は、サーバー1台で動かす前提で、起動のたびにマイグレーションを流す。Cloud Run は同時に複数のコンテナを起動することがあり、全部が一斉にマイグレーションを流すと、ぶつかる恐れがある。起動も遅くなる。マイグレーションをどこで流すかは #31 で決める。デプロイの設定で entrypoint を飛ばす方法もあるが、コードを読んでも起動時の動きが分からなくなるので選ばない。ローカルの開発は `Dockerfile.dev` を使い、この entrypoint を通らないので、影響しない
- **イメージは手元の Docker でビルドする**。手元の Mac は arm64 だが、Cloud Run は amd64 のイメージしか動かせないので、`--platform linux/amd64` を付けてビルドする。エミュレーションで動くので遅い。Cloud Build を使えば amd64 で速くビルドできるが、ビルド用のサービスアカウントと権限を別に用意する必要がある。手でのビルドは #33 までのつなぎなので、仕組みが少ない方を選ぶ
- **専用のサービスアカウントで動かす**。指定しないと、Compute Engine の既定のサービスアカウントで動き、プロジェクト全体を編集できる強い権限を持つことがある。乗っ取られたときの被害を小さくするため、権限を `rails-master-key` を読むことだけにする。権限は、プロジェクト全体ではなく、シークレット1つに付ける。イメージの取得とログの出力には、このサービスアカウントの権限は要らない(Cloud Run 自身が行う)
- **`RAILS_MASTER_KEY` は Secret Manager から環境変数として渡す**。`--set-env-vars` で値を直接渡すと、Cloud Run の設定画面に鍵が平文で見える。`api/.dockerignore` が `config/master.key` を除いているので、イメージにも入らない
- **シークレットは版の番号を指定して渡す**。`latest` を指定すると、シークレットを更新した後、新しく起動したコンテナだけが新しい値を使い、古い値と新しい値のコンテナが混ざる。番号を指定すれば、値を変えるにはデプロイし直す必要があり、どの版がどの値で動いているかが設定から分かる
- **誰でも呼び出せるようにする**。最終的にはブラウザから呼ばれる API なので、公開する。DB がない間は `/up` 以外はエラーになり、データを返すことはない
- **インスタンスは最小 0、最大 1**。使われていない間は 0 台になり、料金がかからない。代わりに、久しぶりのアクセスは起動を待つので遅くなる。最大 1 は、想定外のアクセスで台数が増えて課金されるのを防ぐため。Cloud SQL を繋いだ後の台数と接続数は、後のタスクで決める
- **料金は無料枠に収まる見込み**。Cloud Run と Secret Manager は無料枠の範囲で使う。Artifact Registry の無料枠は保存量 0.5GB なので、古いイメージは手で消し、置くのは動いている版だけにする
