# 記事の作成・一覧 API を作る

Issue: #10

## 目的

ログインした会員が記事を作り、記事の一覧を取り出せる API を作る。#12 の「記事の投稿・一覧画面」が呼ぶ API にする。

## やること

- 記事を作る API `POST /api/articles` を作る。ログインが必要。記事は、ログインしている会員の記事として保存する
- 記事の一覧を返す API `GET /api/articles` を作る。ログインは不要。すべての会員の記事を、新しい順に返す

## やらないこと

- ページネーション、記事の詳細・編集・削除(フェーズ3)
- エラーの文の日本語化。rails-i18n などが必要になるので、画面でエラーをどう表示するかと合わせて、必要になった Issue で決める
- rack-cors(#12。#8 の仕様書で決めたとおり)

## 完了条件

- AC-1:ログイン済みの会員がタイトルと本文を送ったとき、`POST /api/articles` は、その会員の記事として保存し、201 と保存した記事を返す
- AC-2:リクエストに `member_id` が含まれている場合も、`POST /api/articles` はそれを使わず、ログインしている会員の記事として保存する
- AC-3:タイトルか本文が記事の決まりに合わない場合(空、またはタイトルが101文字)、`POST /api/articles` は 422 と項目ごとのエラーを返し、記事を保存しない
- AC-4:リクエストに `article` がない場合、`POST /api/articles` は 400 を返し、記事を保存しない
- AC-5:ID トークンがない、または確かめられない場合、`POST /api/articles` は 401 を返し、記事を保存しない
- AC-6:`GET /api/articles` は、すべての会員の記事を新しい順に返す
- AC-7:ログインしていなくても、`GET /api/articles` は 200 を返す
- AC-8:記事が1件もない場合、`GET /api/articles` は空の `articles` を返す
- AC-9:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

機能のタスクなので、テストを先に書く(2 の時点ではテストは失敗する)。

1. `docs/specs/010-articles-api.md`:この仕様書
2. `api/spec/requests/api/articles_spec.rb`:AC-1〜8 の request spec
3. `api/config/routes.rb`:`resources :articles, only: %i[index create]` を `namespace :api` に足す
4. `api/app/controllers/api/articles_controller.rb`:`index` と `create`。`create` だけ `before_action :authenticate_member!` を付ける
5. `docs/architecture.md`:「API」の表に2つの API を書き、「機能一覧」の状態を直す

### 入出力

`POST /api/articles`

- リクエスト:`Authorization: Bearer <ID トークン>`

  ```json
  { "article": { "title": "Rails の N+1 を見つける", "body": "Bullet を入れて…" } }
  ```

- 成功:201

  ```json
  {
    "id": 1,
    "title": "Rails の N+1 を見つける",
    "body": "Bullet を入れて…",
    "member_id": 1,
    "created_at": "2026-11-03T01:00:00.000Z",
    "updated_at": "2026-11-03T01:00:00.000Z"
  }
  ```

- 失敗:422(記事の決まりに合わない)

  ```json
  { "errors": { "title": ["can't be blank"] } }
  ```

- 失敗:400(`article` がない)。本文は Rails の決まった形のまま
- 失敗:401。`{ "error": "unauthorized" }`(#8 と同じ)

`GET /api/articles`

- リクエスト:なし(ログインは不要)
- 成功:200。記事は新しい順(`created_at` の降順。同じ時刻なら `id` の降順)

  ```json
  {
    "articles": [
      {
        "id": 2,
        "title": "…",
        "body": "…",
        "member_id": 1,
        "created_at": "…",
        "updated_at": "…"
      }
    ]
  }
  ```

### 判断したこと

- **一覧はログインなしで呼べる**。「ノウハウ図書館」の記事は、誰でも読めるのが自然なため。記事の公開状態(下書きと公開の区別)はまだないので、すべての記事が公開されている扱いになる
- **一覧は、すべての会員の記事を返す**。「自分の記事」だけの一覧は、必要になった Issue で足す
- **一覧は `{ "articles": [...] }` で包んで返す**。フェーズ3でページネーションを足すとき、`articles` の横に総件数などを足せば、画面の側の読み方を変えずに済むため
- **一覧の記事に本文を含める**。詳細の API はまだないので、フェーズ1の「一覧で表示」は、一覧の API だけで描くため。本文に上限がないので一覧が重くなりうるが、フェーズ3のページネーションと詳細の API で解決する
- **書いた会員は、`current_member` から決める**。リクエストの `member_id` を使うと、別の会員になりすまして記事を作れてしまうため。Strong Parameters で受け取るのは `title` と `body` だけにする
- **リクエストは `article` で包んだ形を正式な形にする**。Rails には、平らな JSON(`{ "title": ... }`)を自動で `article` の下に入れ直す仕組み(wrap_parameters)がある。ただ、その仕組みに頼るより、形を仕様書に書いておくほうが読み手に分かりやすい。受け取りは Rails 8 の `params.expect(article: [:title, :body])` で書く。`article` がなければ、Rails が 400 を返す
- **返す項目は、コントローラーで1つずつ書き出す**(`as_json(only: ...)`)。今後 `articles` にカラムが増えても、勝手に API の外へ出ないようにするため。書き出すのは2か所だけなので、jbuilder やシリアライザの gem は入れない
- **422 は `:unprocessable_content` で返す**。Rails 8.1 が使う rack 3.2 では、`:unprocessable_entity` は古い名前になっている
- **401 の確かめは2つの場合に絞る**。トークンの細かい検証は、#8 の `GET /api/me` の request spec で確かめ済みのため。この Issue では、ヘッダーがない場合と、確かめられないトークンの場合に、401 を返し記事を保存しないことだけを確かめる
