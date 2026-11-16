# 0008. 本番の /api は、Firebase Hosting から Cloud Run へ取り次ぐ

- 日付:2026-11-15
- 状態:採用

## 背景

#32 で、Vue を本番に置き、本番でログイン → 記事の投稿 → 一覧の表示が通るようにする。Vue はビルドするとファイル(HTML、JavaScript、CSS)になり、Rails のように動き続けるものではないので、ファイルを配る場所が別に要る。あわせて、ブラウザで動く Vue が、Cloud Run の Rails をどう呼ぶかを決める必要がある。

[docs/roadmap.md](../roadmap.md) のフェーズ2で、Vue の配信に Firebase Hosting を使うこと、`/api` を Firebase Hosting から Cloud Run へ取り次ぐか、ブラウザから Cloud Run を直接呼ぶかは、このフェーズのタスクで ADR に残すことを決めていた。判断の材料は [docs/notes/vue-production-hosting.html](../notes/vue-production-hosting.html) にある。

今の Vue は、`/api/articles` のように、画面と同じ相手(オリジン)の `/api` を呼んでいる(`web/src/api/articles.ts`)。ローカルでは、Vite の開発サーバーが `/api` を Rails に取り次いでいる(`web/vite.config.ts`)。

## 選択肢

1. Firebase Hosting が Vue のファイルを配り、`/api/**` へのリクエストを Cloud Run のサービス `api` に取り次ぐ
2. Cloud Storage のバケットに Vue のファイルを置き、ロードバランサで `/api` を Cloud Run に振り分ける
3. Vue のビルド結果を Rails の `public/` に入れ、Cloud Run の Rails が Vue も配る
4. Firebase Hosting が Vue のファイルを配り、ブラウザは Cloud Run の URL(`run.app`)を直接呼ぶ

## 決定

1 を選ぶ。`firebase.json` の `rewrites` に、`/api/**` を Cloud Run のサービス `api`(`asia-northeast1`)へ取り次ぐ設定と、それ以外のパスに `/index.html` を返す設定を書く。

## 理由

- **ブラウザから見た相手が1つになり、CORS の設定が要らない**。ブラウザは、画面を読み込んだ相手と違う相手への呼び出しを、相手が許可したときだけ通す(CORS)。4 は、画面が `web.app`、API が `run.app` で相手が2つになるので、Rails に許可の設定(rack-cors)が要り、許可する相手の書き間違いが、そのまま本番の不具合や穴になる。1 は、画面も API も `web.app` なので、許可の仕組みそのものが関わらない。
- **Vue のコードを変えずに済み、ローカルと同じ形になる**。1 では、本番は Firebase Hosting が、ローカルは Vite の開発サーバーが、`/api` を Rails に取り次ぐ。取り次ぐ係が変わるだけで、Vue から見た呼び方は同じ。4 は、Vue に Cloud Run の URL を教える設定を足し、ローカルと本番で呼び先を切り替える必要がある。
- **常に料金がかかる部品を増やさない**。2 は、HTTPS と `/api` の振り分けにロードバランサが要り、使っていなくても料金がかかる。[docs/principles.md](../principles.md) の非目標「無料枠・低額枠を超える常時稼働の構成」に当たる。1 の Firebase Hosting は、このアプリの規模なら無料枠に収まる。
- **api と web を分けた構成のまま見せられる**。3 は、部品が一番少ないが、画面を直すだけでも Rails のイメージを作り直す必要があり、CDN もない。README の「api/ と web/ を分ける」構成とずれる。
- **1 の損は、このアプリでは困らない**。損は次の2つ。
  - Firebase Hosting からの取り次ぎは、60秒で打ち切られる。このアプリの API は、1秒もかからない。
  - Firebase Hosting の CDN が、API のレスポンスをキャッシュして、ほかの人に返すおそれがある。Firebase の文書によると、Cloud Run に取り次いだリクエストのレスポンスは、初めの値では CDN にキャッシュされない。キャッシュされるのは、レスポンスの `Cache-Control` に `public` を付けたときで、`private` なら、キャッシュしてよいのはリクエストした人のブラウザだけになる。また、Firebase Hosting は、取り次いだレスポンスの `Vary` に `Authorization` を足すので、ID トークンが違えば、同じキャッシュは返らない。Rails のレスポンスには `Cache-Control: max-age=0, private, must-revalidate` が付いている(2026-11-13 に、本番の `/api/articles` で確かめた)。取り次いだ後も同じであることを、仕様書 032 の AC-3 で確かめる。

4 は、取り次ぎの60秒の上限がなく、Firebase Hosting を通らない分だけ通り道が短い。2 は、Google Cloud だけで完結する。3 は、デプロイするものが1つで済む。1 を選ぶことで、これらの利点は捨てる。

## 影響

- rack-cors は、本番でも使わない。`api/Gemfile` の `gem "rack-cors"` は、コメントのまま残す。README の技術一覧で rack-cors を「Vue(別オリジン)からの呼び出し」としている行は、#32 の PR で直す。
- 本番の URL は `https://knowledge-library-prod.web.app` になる。Cloud Run の URL(`run.app`)も、これまでどおり直接開ける。ブラウザの Vue は、`run.app` を使わない。
- 今後、API のレスポンスにキャッシュの指定を付けるときは、ログインした会員ごとに中身が変わるレスポンスに `public` を付けない。付けると、Firebase Hosting の CDN が、ある会員あてのレスポンスを別の人に返すおそれがある。
- 画面の URL(`/articles/new` など)を直接開いても、Firebase Hosting は `/index.html` を返し、Vue Router が画面を出す。`/api/**` の取り次ぎを先に書くので、API のリクエストは `/index.html` にならない。
- Firebase Hosting は、取り次ぐリクエストから cookie を取り除く(`__session` という名前のものだけを通す)。今の Rails の API は、ログインを cookie ではなく `Authorization` ヘッダーの ID トークンで確かめるので、影響はない。今後 cookie を使うときは、この制約に合わせる。
- Firebase Hosting を通ると、Rails が受け取るほかのヘッダー(送り主の IP など)が変わる可能性がある。今の Rails はそれを使っていないので、影響はない。どう変わるかは、確かめていない。
- **見直すとき**:
  - 60秒を超える API(大きなファイルの処理など)を作るとき
  - 独自ドメインにするとき、または Vue と API を別のドメインに分けたくなったとき

## 参考

- 仕様書:[docs/specs/032-firebase-hosting.md](../specs/032-firebase-hosting.md)
- 判断の材料:[docs/notes/vue-production-hosting.html](../notes/vue-production-hosting.html)
- 学習ノート:[docs/notes/032-vue-firebase-hosting.html](../notes/032-vue-firebase-hosting.html)
- Firebase の文書:[Serve dynamic content and host microservices with Cloud Run](https://firebase.google.com/docs/hosting/cloud-run)、[Manage cache behavior](https://firebase.google.com/docs/hosting/manage-cache)
