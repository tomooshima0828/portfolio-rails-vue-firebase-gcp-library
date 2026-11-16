# Vue を Firebase Hosting で配信する

Issue: #32

## 目的

本番で、会員が画面からログインし、記事を投稿して、一覧で見られるようにする。#31 で、本番の Rails は DB に繋がり、`GET /api/articles` が 200 を返すようになった。ただ、利用者が開く画面(Vue)がまだ本番にない。

Vue をビルドしたファイル(HTML、JavaScript、CSS)を Firebase Hosting から配り、ブラウザから Rails を呼ぶ道を作る。本番の Firebase でログインできるようにし、Rails がそのログインを確かめられるようにする。

## やること

- ブラウザから Rails をどう呼ぶか(Firebase Hosting が `/api` を Cloud Run へ転送するか、ブラウザが Cloud Run を直接呼ぶか)を決め、ADR に残す
- `firebase.json` を書く。配るフォルダ、`/api` の転送、画面の URL を直接開いたときの扱いを決める
- 本番用のプロジェクト `knowledge-library-prod` の Firebase で、次を用意する
  - Authentication を始め、ログインの方法に Google を足す
  - ウェブアプリを登録し、設定値(`apiKey` など)を控える
- オーナーが、控えた設定値を `web/.env.production.local` に書く
- Cloud Run のサービス `api` に、環境変数 `FIREBASE_PROJECT_ID` を足してデプロイし直す
- オーナーが、手元のターミナルで Vue をビルドし、Firebase Hosting にデプロイする
- ブラウザで、ログイン → 記事の投稿 → 一覧の表示を確かめる
- `docs/production-setup.md` に「4. Firebase Hosting」の章を書く

Google Cloud と Firebase の画面の操作は、オーナーがコンソールで行う。コンソールでできない、Vue のビルドと Firebase Hosting へのデプロイは、オーナーが手元のターミナルで行う。Claude は、操作の前に手順と理由を説明し、操作の後に curl と gcloud の読み取りだけのコマンドで結果を確かめる。`web/.env.production.local` は、Claude は読まない(CLAUDE.md の機密情報の扱い)。

## やらないこと

- GitHub Actions による、ビルドとデプロイの自動化(#33)
- 独自ドメイン。Firebase Hosting が用意する `knowledge-library-prod.web.app` を使う
- ローカル開発の CORS(rack-cors)。ローカルでは Vite の開発サーバーが `/api` を転送するので、要らない(今のまま)
- Firebase Auth の `authDomain` を、画面と同じドメイン(`web.app`)に替えること。ログインはポップアップで行うので、今は替えない。ログインできないブラウザが見つかったら、そのときに考える
- 本番の DB に入れた記事を、DB の作り直し(ADR 0007、2026-12-09 ごろ)の後も残すこと。作り直した後に、画面から入れ直す
- Firestore、Cloud Storage など、ほかの Firebase の機能

## 完了条件

<!-- インフラの設定のタスクなので、RSpec や Vitest のテストはない。Claude が curl と gcloud の読み取りだけのコマンドで確かめ、ブラウザでの操作はオーナーが行って、結果を PR に残す -->

- AC-1:利用者が本番の URL(`https://knowledge-library-prod.web.app/`)を開いたとき、Firebase Hosting は Vue の画面を返し、画面は記事の一覧を表示する
- AC-2:利用者が Vue Router の画面の URL(`/articles/new` など)を直接開いたとき、Firebase Hosting は 404 ではなく `index.html` を返し、Vue Router がその画面を表示する
- AC-3:ブラウザが `https://knowledge-library-prod.web.app/api/articles` を呼んだとき、Firebase Hosting はリクエストを Cloud Run のサービス `api` に転送し、Rails のレスポンス(200 と `{ "articles": [...] }`)を返す。レスポンスは `Cache-Control: private` を持ち、Firebase Hosting の CDN にキャッシュされない
- AC-4:会員が本番の画面で Google でログインし、記事を投稿したとき、Rails はその会員の記事として本番の DB に保存し、画面の一覧に表示される
- AC-5:ログインしていない人が `POST /api/articles` を送ったとき、Rails は 401 と `{ "error": "unauthorized" }` を返す

## 設計

### 変更するファイル

セットアップのタスクなので、テストを先に書く順番の対象外。

1. `docs/specs/032-firebase-hosting.md`:この仕様書
2. `docs/adr/0008-proxy-api-through-firebase-hosting.md`:`/api` を Firebase Hosting から Cloud Run へ転送する判断
3. `docs/notes/vue-firebase-hosting.html`:学習ノート。Rails と Vue の置き方の違い、`docker build` と `npm run build` の違い、3つのつなぎ(`/api` の取り次ぎ、設定値の埋め込み、Rails の `FIREBASE_PROJECT_ID`)の図
4. `firebase.json`:Firebase Hosting の設定
5. (ファイルではない操作)Authentication と Google ログイン → ウェブアプリの登録 → `web/.env.production.local`(オーナー)→ Cloud Run に `FIREBASE_PROJECT_ID` → Vue のビルドとデプロイ(オーナー)→ 確認
6. `docs/production-setup.md`:「4. Firebase Hosting」の章。5 で実際に行った手順を書く
7. `docs/architecture.md`:配信の行を、今の姿に直す
8. `README.md`:技術一覧の rack-cors の行を、今の使い方(本番でも使わない)に直す(ADR 0008)

### 本番の値

| 項目 | 値 |
|---|---|
| 本番の URL | `https://knowledge-library-prod.web.app`(Firebase Hosting の初めのサイト。`knowledge-library-prod.firebaseapp.com` でも同じものが開く) |
| 配るフォルダ | `web/dist`(`vite build` の出力先) |
| `/api` の転送 | `/api/**` を、Cloud Run のサービス `api`(`asia-northeast1`)へ転送する |
| 画面の URL | 上に当たらないパスには、`/index.html` を返す |
| ログインの方法 | Firebase Authentication の Google |
| ウェブアプリの名前 | `knowledge-library-web` |
| Vue に渡す設定値 | `web/.env.production.local` の `VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_APP_ID` |
| Rails に渡す環境変数 | `FIREBASE_PROJECT_ID=knowledge-library-prod`(シークレットではなく、普通の環境変数) |
| Firebase CLI | `firebase-tools` 15.34.2 を `npx` で使う |

`firebase.json` の中身(案):

```json
{
  "hosting": {
    "public": "web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "/api/**", "run": { "serviceId": "api", "region": "asia-northeast1" } },
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

### 判断したこと

- **`/api` は、Firebase Hosting が Cloud Run へ転送する**。理由は [ADR 0008](../adr/0008-proxy-api-through-firebase-hosting.md)。判断の材料は [docs/notes/vue-production-hosting.html](../notes/vue-production-hosting.html)
- **Vue のコードは変えない**。Vue は今も `/api/articles` のように、同じドメインの `/api` を呼んでいる(`web/src/api/client.ts`)。ローカルでは Vite の開発サーバーが、本番では Firebase Hosting が、`/api` を Rails へ転送する。転送する係が変わるだけで、Vue から見た呼び方は同じ
- **画面の URL を直接開いたときは、`index.html` を返す**。`/articles/new` のような画面は、ブラウザの中で Vue Router が切り替えるもので、Firebase Hosting にはそのファイルがない。`index.html` を返すと、Vue が起動し、Vue Router が URL を見て画面を出す。`/api/**` の転送を先に書くので、API のリクエストは `index.html` にならない
- **本番の Firebase の設定値は、オーナーが `web/.env.production.local` に書く**。Vue は、Firebase の設定値を、ビルドするときに JavaScript のファイルへ埋め込む(Rails のように、動くときに受け取るのではない)。Vite は、本番のビルドのときに `.env.production.local` を読む。このファイルは `web/.gitignore` の `*.local` でコミットされず、開発の `.env` と同じ扱いになる。値そのものは、ブラウザに配る JavaScript に入るので秘密ではないが、`.env` の扱い(CLAUDE.md)にそろえる。#33 で自動にするときは、GitHub の変数に移す
- **本番のビルドは、開発の設定を渡さないコマンドで行う**。`docker compose run web` でビルドすると、`compose.yaml` が開発用の Firebase の設定値を環境変数で渡す。Vite は、ファイルより環境変数を優先するので、開発用の値が埋め込まれてしまう。そのため、`docker run` で、`web/Dockerfile.dev` と同じ版の Node のイメージ(`node:24.22.0-slim`)を直接使い、`web/` だけをつないでビルドする。`web/node_modules` は、Linux のコンテナの中で入れたものなので、Mac の上ではなく、コンテナの中でビルドする
- **Firebase CLI は、版を決めて `npx` で使う**。Mac に入れたままにしないので、ほかのプロジェクトに影響しない。版を決めると、手順書の通りに動く。ログイン(`firebase login`)は、オーナーの Google アカウントで行う
- **`.firebaserc` は作らない**。デプロイのコマンドに、毎回 `--project knowledge-library-prod` を付ける。本番用のプロジェクトしかデプロイ先がないので、別名を付ける意味がない。毎回書くことで、どこにデプロイするかがコマンドから分かる
- **Rails の `FIREBASE_PROJECT_ID` は、普通の環境変数で渡す**。プロジェクト ID は、ブラウザに配る JavaScript にも入る公開の値で、秘密ではない。Rails は、この値で、ID トークンが本番の Firebase のものかを確かめる。開発用のプロジェクトの ID トークンは、本番の Rails では通らない
- **API のレスポンスは、CDN にキャッシュされない**。CDN は、Firebase Hosting が世界各地に持つキャッシュで、同じリクエストには Rails まで転送せずに、キャッシュしたレスポンスを返す。Firebase の文書によると、Cloud Run へ転送したリクエストのレスポンスは、初めの値では CDN にキャッシュされず、`Cache-Control` に `public` を付けたときだけキャッシュされる。`private` なら、キャッシュしてよいのはリクエストした人のブラウザだけになる。Rails のレスポンスには `Cache-Control: max-age=0, private, must-revalidate` が付いている(2026-11-13 に、本番の `/api/articles` で確かめた)。AC-3 で、転送の後も同じであることを確かめる
- **Firebase Hosting の転送は、60秒で打ち切られる**。このアプリの API は、1秒もかからないので困らない
- **ログインを許すドメインは、初めの値を確かめるだけにする**。Firebase Authentication は、初めから `localhost`、`knowledge-library-prod.firebaseapp.com`、`knowledge-library-prod.web.app` を許す。足すものはない。作業の後に、画面で確かめる
