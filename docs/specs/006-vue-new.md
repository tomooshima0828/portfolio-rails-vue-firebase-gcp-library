# Vue プロジェクトを作る

Issue: #6

## 目的

Vue 3 の SPA の土台を Docker で動かせるようにし、以降のタスク(#11、#12)で画面と Vitest のテストを書ける状態にする。

## やること

- `web/` に Vue 3(TypeScript、Vue Router、Pinia、Vitest)を create-vue で作る。サンプルコードの少ない `--bare` にする。Node は 24 LTS にする
- リポジトリ直下の `compose.yaml` に web(Vite の開発サーバー)を足し、`localhost:5173` で動かす。ローカル開発はすべて Docker で行う(ADR 0002)
- README に、Docker での Vue のコマンド(初回の準備、起動、テスト、型チェック、ビルド、パッケージの追加)を書く

## やらないこと

- 画面(#11、#12)、Firebase JS SDK(#11)
- Rails API の呼び出し方。Vite の proxy を使うか、rack-cors で別オリジンから呼ぶかは #12 で判断する
- ESLint / Prettier(優先度 B、フェーズ5)
- CI(#7)
- 本番での配信(Firebase Hosting、フェーズ2)

## 完了条件

<!-- npm のコマンドは、すべて docker compose run --rm web … の形でコンテナ内で実行する。AC-6 は、わざと型エラーを入れて確かめ、確認後に戻す -->

- AC-1:`docker compose up` したとき、db、api、web の3つのコンテナが起動し、web は `localhost:5173` で Vue の画面を返す
- AC-2:web が起動している間、`src/App.vue` を変更したとき、ブラウザの表示は自動で更新される(HMR)
- AC-3:`npm run test:unit -- --run` を実行したとき、Vitest は App のテストを実行し、すべて成功する
- AC-4:`npm run type-check` を実行したとき、vue-tsc は型エラーなしで終わる
- AC-5:`npm run build` を実行したとき、Vite は `web/dist` に成果物を作り、エラーなく終わる
- AC-6:型エラーがある場合、`npm run type-check` はエラーを表示して失敗する
- AC-7:README の手順どおりにコマンドを実行したとき、初回の準備から起動・停止まで、エラーなく完了する

## 設計

### 変更するファイル

セットアップのタスクなので、テストを先に書く順番の対象外。

1. `docs/specs/006-vue-new.md`:この仕様書
2. `web/` 一式:create-vue のコマンド1回で1コミット。使い捨ての `node:24-slim` コンテナ内で実行する
   - コマンド:`npx create-vue@3.24.0 --ts --router --pinia --vitest --bare web`
3. `web/package-lock.json`:`npm install --package-lock-only` のコマンド1回で1コミット。使い捨てのコンテナ内で実行する
4. `web/Dockerfile.dev`:開発用のイメージ(Node 24)。Rails の `-b 0.0.0.0` と同じ理由で、Vite を `--host 0.0.0.0` で起動し、コンテナの外から繋がるようにする。依存パッケージはイメージに入れない(下記)
5. `compose.yaml`:web サービスを足す。`./web` をバインドマウントし、ポート 5173 を公開する
6. `README.md`:Vue のコマンド。1〜5 ができてから、実際に試したコマンドだけを書く

### 判断したこと

- **Node 24 LTS**:今の Active LTS で、create-vue 3.24.0 の要件(`^22.18.0 || >=24.12.0`)を満たす。Node 26 は、まだ LTS になっていない
- **`--bare`**:#11 以降で消すことになるサンプル(HelloWorld、HomeView など)を入れない。テストは `src/__tests__/App.spec.ts` が1つ作られるので、AC-3 にはそれを使う
- **node_modules は `web/node_modules`(Mac から見える場所)に置く**:api の gem のように Docker のボリュームに置くと、VS Code が `vue` などの型を読めず、`.vue` / `.ts` の import のほとんどに赤線が出るため
  - npm は必ずコンテナの中で実行する。Mac で実行すると、コンテナが入れた Linux 用のバイナリと衝突する
  - 初回の準備で `docker compose run --rm web npm ci` を実行し、`web/node_modules` を作る
  - パッケージを足すときは `docker compose run --rm web npm install パッケージ名` を実行する。イメージの作り直しは要らない
  - `web/node_modules` は、create-vue が作る `web/.gitignore` で Git から除外される
