# 全体像(Architecture)

このプロジェクトの**今の**全体像を置く。仕様が変わったら、その変更と同じ PR で更新する。
フェーズと順番は [roadmap.md](roadmap.md)、使う技術と優先度は [README.md](../README.md) にある。

決まっていないことは書かない。各タスクの仕様書で決まった時点で追記する。

## 機能一覧

| 機能 | 内容 | データの置き場所 | 状態 |
|---|---|---|---|
| ログイン | Google アカウントでログインする。Rails は Firebase の ID トークンを検証して会員を特定する | Firebase Auth | Vue の Google ログインと Rails の検証(#8、#11) |
| 記事の投稿・編集・削除 | ログインした会員が、自分の記事を投稿・編集・削除する | Rails(PostgreSQL) | 投稿の API と画面(#10、#12) |
| 記事の一覧・詳細 | 記事を一覧と詳細で表示する | Rails(PostgreSQL) | 一覧の API と画面(#10、#12) |
| 検索 | 記事をキーワードで検索する | Rails(PostgreSQL) | 未実装 |
| タグ | 記事にタグを付け、タグで絞り込む | Rails(PostgreSQL) | 未実装 |
| ブックマーク | 会員が記事をブックマークし、一覧で見る | Rails(PostgreSQL) | 未実装 |
| サムネイル画像 | 記事にサムネイル画像を付ける | Cloud Storage(Active Storage) | 未実装 |
| コメント・リアクション | 記事へのコメントとリアクションを、リアルタイムに反映する | Firestore | 未実装 |

データは原則 Rails(PostgreSQL)に置く。リアルタイムに反映したいコメントとリアクションだけを Firestore に置く。

## 構成

```
ブラウザ(Vue 3 SPA)
  ├─ Firebase Auth …… Google ログイン、ID トークンの発行
  ├─ Firestore ……… コメント・リアクション(セキュリティルールで保護)
  └─ /api ─→ Rails API(Cloud Run)
               ├─ ID トークンの検証
               ├─ Cloud SQL for PostgreSQL
               ├─ Cloud Storage(Active Storage)
               └─ Secret Manager
```

- 環境:Google Cloud / Firebase のプロジェクトを、開発用 `knowledge-library-dev` と本番用 `knowledge-library-prod` に分ける。料金がかかるのは本番用だけ([ADR 0005](adr/0005-separate-dev-prod-projects.md))
- 本番:Rails は Cloud Run のサービス `api`(東京)で、専用のサービスアカウント `api-runtime` の身分で動く。`RAILS_MASTER_KEY` は Secret Manager から受け取る。作り方は [production-setup.md](production-setup.md)
- 本番の DB:Cloud SQL for PostgreSQL のインスタンス `db`(東京)。公開 IP を持つが、承認済みネットワークは空にし、Rails は Cloud Run の Cloud SQL 接続(Unix ソケット)を通って繋ぐ。DB のパスワードは Secret Manager の `db-password` から受け取る。表は、サービスと同じイメージで動く Cloud Run のジョブ `migrate` で作る([ADR 0006](adr/0006-run-migrations-with-cloud-run-jobs.md))。#31 では30日間の無料お試しで動かし、切れる前に一番小さい DB に作り直す。使わない期間の扱いは [ADR 0007](adr/0007-cloud-sql-idle-periods.md)、仕組みの図は [notes/cloud-sql-connection.html](notes/cloud-sql-connection.html)
- 配信:Vue は Firebase Hosting から配信し、`/api` を Cloud Run へ転送する(優先度 B)
- CI:PR の作成・更新と main への push のたびに、GitHub Actions が RSpec、RuboCop、Brakeman、bundler-audit、Vitest、vue-tsc を実行する。main の Ruleset で、その成功をマージの条件にしている([ADR 0003](adr/0003-ci-environment.md))
- デプロイ:今は手元でイメージをビルドし、Artifact Registry に push して、コンソールで Cloud Run にデプロイする。#33 で GitHub Actions → Artifact Registry → Cloud Run に自動化する。Workload Identity 連携を使い、鍵ファイルを使わない
- ローカル環境:Rails、Vue(Vite の開発サーバー)、PostgreSQL を Docker Compose で動かす([ADR 0002](adr/0002-local-dev-on-docker.md))。Vue から Rails へのリクエストは、Vite の開発サーバーが `/api` を転送する。Firebase Auth は、開発用の本物のプロジェクトを使う([ADR 0004](adr/0004-local-firebase-auth.md))。Emulator Suite は、Firestore を使うフェーズ4で使う

ディレクトリ構成は [README.md](../README.md) の「想定するディレクトリ構成」にある。

## 画面

各タスクの仕様書で決まった時点で追記する。

| 画面 | 内容 | 仕様書 |
|---|---|---|
| 記事の一覧(`/`) | すべての会員の記事を、新しい順に表示する。ログインは不要。ログイン中は、投稿画面へのリンクを出す | [#12](specs/012-articles-ui.md) |
| 記事の投稿(`/articles/new`) | タイトルと本文を入れて、記事を投稿する。ログインが必要で、未ログインなら一覧に移す | [#12](specs/012-articles-ui.md) |

全画面の上に、ログイン・ログアウトのボタンを置く。ログインが必要な画面は、Vue Router のガードで守る。

## API

Rails API のエンドポイント。ログインが必要なものは、`Authorization: Bearer <Firebase の ID トークン>` を付けて呼ぶ。トークンがない、または確かめられない場合は、401 と `{ "error": "unauthorized" }` を返す。

| メソッドとパス | 内容 | ログイン | 仕様書 |
|---|---|---|---|
| `GET /api/me` | ログインしている会員の `id` と `firebase_uid` を返す。初めての uid なら会員を作る | 必要 | [#8](specs/008-verify-id-token.md) |
| `GET /api/articles` | すべての会員の記事を、新しい順に返す | 不要 | [#10](specs/010-articles-api.md) |
| `POST /api/articles` | ログインしている会員の記事として、記事を作る | 必要 | [#10](specs/010-articles-api.md) |

## データモデル

Rails(PostgreSQL)のテーブル。テーブルどうしの関連の全体像(予定のテーブルを含む)は、[notes/erd.md](notes/erd.md) の ERD にある。

### members

会員。Firebase の uid だけを持ち、名前やメールアドレスは持たない。

| カラム | 型 | 制約 |
|---|---|---|
| `id` | bigint | 主キー |
| `firebase_uid` | string | 必須、一意 |
| `created_at`、`updated_at` | datetime | 必須 |

### articles

記事。会員が書いたタイトルと本文を持つ。

| カラム | 型 | 制約 |
|---|---|---|
| `id` | bigint | 主キー |
| `member_id` | bigint | 必須、`members` への外部キー、インデックス |
| `title` | string | 必須。100文字まで(モデルのバリデーション) |
| `body` | text | 必須 |
| `created_at`、`updated_at` | datetime | 必須 |

関連:会員(`members`)1人が、記事(`articles`)を複数持つ。
