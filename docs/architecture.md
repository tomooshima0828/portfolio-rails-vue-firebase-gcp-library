# 全体像(Architecture)

このプロジェクトの**今の**全体像を置く。仕様が変わったら、その変更と同じ PR で更新する。
フェーズと順番は [roadmap.md](roadmap.md)、使う技術と優先度は [README.md](../README.md) にある。

決まっていないことは書かない。各タスクの仕様書で決まった時点で追記する。

## 機能一覧

| 機能 | 内容 | データの置き場所 | 状態 |
|---|---|---|---|
| ログイン | Google アカウントでログインする。Rails は Firebase の ID トークンを検証して会員を特定する | Firebase Auth | 未実装 |
| 記事の投稿・編集・削除 | ログインした会員が、自分の記事を投稿・編集・削除する | Rails(PostgreSQL) | 未実装 |
| 記事の一覧・詳細 | 記事を一覧と詳細で表示する | Rails(PostgreSQL) | 未実装 |
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

- 配信:Vue は Firebase Hosting から配信し、`/api` を Cloud Run へ転送する(優先度 B)
- デプロイ:GitHub Actions → Artifact Registry → Cloud Run。Workload Identity 連携を使い、鍵ファイルを使わない
- ローカル環境:PostgreSQL は Docker、Firebase は Emulator Suite を使う

ディレクトリ構成は [README.md](../README.md) の「想定するディレクトリ構成」にある。

## 画面

各タスクの仕様書で決まった時点で追記する。

## API

各タスクの仕様書で決まった時点で追記する。

## データモデル

各タスクの仕様書で決まった時点で追記する。
