# Vue に Google ログインを作る

Issue: #11

## 目的

会員が Vue の画面から Google アカウントでログインし、そのログインが Rails までつながるようにする。#12 の「ログインした会員が記事を投稿する」画面の土台にする。

## やること

- Firebase JS SDK で、Google ログイン(ポップアップ)とログアウトを作る
- ログイン状態を Pinia のストアに持つ。ページを再読み込みしても、ログインしたままにする
- ログインしている間、ID トークンを `Authorization: Bearer` に付けて Rails API を呼ぶ関数を作る。#12 でも使う
- ログインした後に `GET /api/me` を呼び、会員の `id` を画面に出す。ログインが Rails までつながったことを確かめるため(#8 の仕様書で決めたとおり)
- ローカルでも、本物の Firebase(開発用のプロジェクト)でログインする。Auth Emulator の署名のないトークンは受け付けない(ADR 0004)
- 開発環境の `FIREBASE_PROJECT_ID` と、Vue が使う Firebase の設定値を、リポジトリ直下の `.env` から api と web に渡す
- Vue から Rails API へのリクエストは、Vite の開発サーバーの proxy で転送する

## やらないこと

- 画面の遷移と、ログインが必要な画面のガード(#12。記事の画面と一緒に作る)
- 見た目を整えること(principles.md の非目標)
- rack-cors。proxy を使うので、ローカルでは要らない。本番で要るかどうかは、Vue の本番配信の方式と合わせてフェーズ2で決める
- 会員の名前やメールアドレスの表示と保存(必要になった Issue で足す)
- Auth Emulator(フェーズ4で、Firestore と一緒に使う)
- 本番用の Firebase のプロジェクト(フェーズ2で、開発用と分けるかどうかを含めて決める)

## 完了条件

<!-- Vitest では、Firebase の SDK と fetch を偽物に差し替える。本物の Google ログインは手動確認で確かめる -->

- AC-1:未ログインの間、画面は「Google でログイン」のボタンを表示する
- AC-2:ログインのボタンを押したとき、画面は Google のポップアップでログインする
- AC-3:ログインしている間、画面はログアウトのボタンと、`GET /api/me` が返した会員の `id` を表示する
- AC-4:ログアウトのボタンを押したとき、画面はログアウトして、ログインのボタンに戻る
- AC-5:ログインした後にページを再読み込みしたとき、画面はログインしたままになる(手動確認)
- AC-6:ログインしている間、API を呼ぶ関数は、ID トークンを `Authorization: Bearer` に付けて送る
- AC-7:未ログインの間、API を呼ぶ関数は `Authorization` を付けない
- AC-8:`GET /api/me` が失敗した場合(401 など)、画面はエラーを表示する
- AC-9:本物の Google アカウントでログインしたとき、`members` に会員が1人作られ、画面にその会員の `id` が出る(手動確認)
- AC-10:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

機能のタスクなので、テストを先に書く(8〜10 の時点ではテストは失敗する)。

1. `docs/specs/011-vue-google-login.md`:この仕様書
2. `docs/adr/0004-local-firebase-auth.md`:ローカルでも本物の Firebase でログインし、Auth Emulator の署名のないトークンを受け付けない、という判断
3. `.env.example`:`.env` の見本。キーだけを書き、値は空にする
4. `compose.yaml`:`.env` の値を、api と web の環境変数に渡す
5. `docker compose run --rm web npm install firebase`:`web/package.json` と `web/package-lock.json` を更新する。コマンド1回で1コミット
6. `web/vite.config.ts`:`/api` へのリクエストを `http://api:3000` へ転送する proxy
7. `web/env.d.ts`:`VITE_FIREBASE_*` の型
8. `web/src/stores/__tests__/auth.spec.ts`:ログインのストアのテスト(AC-2、AC-4)
9. `web/src/api/__tests__/client.spec.ts`:API を呼ぶ関数のテスト(AC-6、AC-7)
10. `web/src/__tests__/App.spec.ts`:画面のテスト(AC-1、AC-3、AC-8)。もとの「You did it!」のテストは、この画面のテストに置き換える
11. `web/src/firebase.ts`:Firebase の初期化。アプリと Auth のインスタンスを1つだけ作る
12. `web/src/stores/auth.ts`:ログイン状態の Pinia ストア。ログイン、ログアウト、`onAuthStateChanged` での状態の更新
13. `web/src/api/client.ts`:ログインしていれば ID トークンを付けて、Rails API を呼ぶ関数
14. `web/src/App.vue`:ログイン・ログアウトのボタンと、会員の `id` の表示
15. `docs/architecture.md`:「機能一覧」のログインの状態と、「構成」のローカル環境の Firebase の行を直す。「画面」に、#12 で置き換える仮の画面を1行足す
16. `README.md`:「初回の準備」に、Firebase のプロジェクトの作り方と `.env` の書き方を足す

### 入出力

画面(`App.vue` の1枚)

| 状態 | 表示 |
|---|---|
| ログイン状態の確認中(ページを開いた直後) | 何も出さない |
| 未ログイン | 「Google でログイン」のボタン |
| ログイン中 | 「会員 ID:1」と、「ログアウト」のボタン |
| ログインに失敗した、または `GET /api/me` が失敗した | 上の表示に加えて、エラーの文 |

API を呼ぶ関数

- 受け取るもの:パス(`/api/me` など)と、`fetch` に渡すオプション
- 返すもの:`fetch` の `Response`。状態コードの扱いは、呼ぶ側に任せる

環境変数(`.env`)

| キー | 使う側 | 内容 |
|---|---|---|
| `FIREBASE_PROJECT_ID` | api と web | Firebase のプロジェクト ID。web には `VITE_FIREBASE_PROJECT_ID` の名前で渡す |
| `VITE_FIREBASE_API_KEY` | web | Firebase のウェブアプリの `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | web | Firebase のウェブアプリの `authDomain` |
| `VITE_FIREBASE_APP_ID` | web | Firebase のウェブアプリの `appId` |

### 判断したこと

- **ローカルでも本物の Firebase でログインする**。Auth Emulator のトークンは署名がない(`alg: none`)。受け付けるには、Rails の検証に「開発環境では署名を確かめない」分岐が要る。これは #8 の AC-5(署名なしを 401 にする)と逆の動きで、分岐が本番に漏れると認証が素通りになる。認証のコードに確かめない道を作らないため、本物の Firebase を使う。詳しくは ADR 0004
- **Firebase の設定値は `.env` に置き、コミットしない**。設定値は秘密情報ではない(Firebase の公式文書でも、`apiKey` は秘密ではないとされている)。ただ、このリポジトリは Public で、GitHub の secret scanning は Google の API キーの形を検出する。検出の通知を毎回見分ける手間を避けるため、値はコミットせず、見本の `.env.example` だけをコミットする
- **`.env` は、リポジトリ直下に1つだけ置く**。Docker Compose は、`compose.yaml` と同じ場所の `.env` を自動で読み、`${FIREBASE_PROJECT_ID}` のように書いた箇所に値を入れる。プロジェクト ID を1か所に書けば、api と web の値がずれない。Vite は、名前が `VITE_` で始まる環境変数だけを `import.meta.env` に出すので、web には `VITE_` を付けた名前で渡す
- **`.env` はオーナーが書く**。`.env` は Claude Code の deny の設定で読めないため(ai-guideline.md)
- **Vue から Rails へは、Vite の proxy で転送する**。ブラウザから見ると、相手は `localhost:5173` だけになり、オリジンが1つなので CORS は起きない。本番で Firebase Hosting が `/api` を Cloud Run へ転送する案(notes/vue-production-hosting.html の案A)と同じ形になる。転送先は、Docker Compose のネットワークの中の名前 `api` を使う(web のコンテナから見た `localhost` は、web のコンテナ自身のため)
- **proxy の `changeOrigin` は、明示して `false` にする**。`true` にすると、Rails に届く Host ヘッダーが `api:3000` になり、Rails の開発環境の Host の確認(`config.hosts`)で弾かれる。転送先を文字列だけで書く形(`'/api': 'http://api:3000'`)では、Vite が `true` にするため、`false` を書いておく必要がある。`false` なら Host は `localhost:5173` のままで、Rails の開発環境が初めから許可している `localhost` に当たる
- **ログインはポップアップ(`signInWithPopup`)で行う**。リダイレクト(`signInWithRedirect`)は、画面のオリジンと `authDomain` が違うと、ブラウザのサードパーティの保存領域の制限で失敗することがある。ローカルの `localhost:5173` と `authDomain`(`<プロジェクト ID>.firebaseapp.com`)は違うオリジンなので、ポップアップを使う
- **ログイン状態の保存は、Firebase の初期設定に任せる**。Firebase JS SDK は、ログイン状態をブラウザ(IndexedDB)に保存し、再読み込みのときに戻す(AC-5)。Pinia のストアは、`onAuthStateChanged` の知らせを受けて、自分の状態を更新するだけにする
- **ストアは「確認中」の状態を持つ**。ページを開いた直後は、Firebase が保存したログイン状態を読み込む前なので、ログインしているかどうかがまだ分からない。この間にログインのボタンを出すと、ログインしている会員にも一瞬ボタンが見えるため、最初の `onAuthStateChanged` の知らせまでは何も出さない
- **ID トークンは、API を呼ぶたびに `getIdToken()` で取り出す**。ID トークンの期限は1時間で、`getIdToken()` は期限が近ければ新しいトークンを取り直して返す。ストアにトークンを保存すると、期限切れのトークンを送ってしまうため
- **画面は `App.vue` の1枚にする**。画面の遷移は #12 で記事の画面と一緒に作る。今 Vue Router に画面を足すと、#12 で作り直すことになるため
- **Vitest では、Firebase の SDK を偽物に差し替える**。CI には Firebase の設定値を渡さず、本物の Firebase にも通信しない。本物の Google ログインは CI では動かせないので、AC-5 と AC-9 は手動確認にする
