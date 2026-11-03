# 記事モデルを作る

Issue: #9

## 目的

会員が書いた記事を、Rails(PostgreSQL)に保存できるようにする。#10 の「記事の作成・一覧 API」の土台にする。

## やること

- 記事のテーブル `articles` と、モデル `Article` を作る。記事は、タイトル、本文、書いた会員を持つ
- 記事が守る決まり(タイトルと本文は必須、タイトルは100文字まで、書いた会員は必須)を、モデルのバリデーションとデータベースの制約で守る
- 会員から、その会員の記事を取り出せるようにする

## やらないこと

- 記事の API(#10)
- タグ、サムネイル画像、公開状態(下書きと公開の区別)。フェーズ3で、必要になった Issue で足す
- 会員を消したときに、その会員の記事をどうするか。会員を消す機能はまだない。外部キーがあるので、記事のある会員は、データベースが消させない
- 本文の上限。必要になった Issue で決める

## 完了条件

- AC-1:タイトル、本文、書いた会員があるとき、記事は保存できる
- AC-2:タイトルが空の場合、記事は保存されない
- AC-3:タイトルが100文字を超える場合、記事は保存されない。100文字ちょうどなら保存できる
- AC-4:本文が空の場合、記事は保存されない
- AC-5:書いた会員がない場合、記事は保存されない
- AC-6:会員は、その会員が書いた記事だけを `member.articles` で返す
- AC-7:PR の CI の4つのジョブが成功する

## 設計

### 変更するファイル

モデルのタスクなので、テストを先に書く(2 の時点ではテストは失敗する)。

1. `docs/specs/009-article-model.md`:この仕様書
2. `api/spec/models/article_spec.rb`:AC-1〜6 の model spec。#9 には API がないため、request spec ではなく model spec で確かめる
3. `rails generate model Article member:references 'title:string!' 'body:text!' --no-test-framework`:migration とモデル。`references` で `member_id`(必須)、外部キー、インデックスが付き、モデルに `belongs_to :member` が入る。`!` で `null: false` を付ける。コマンド1回で1コミット
4. `bin/rails db:migrate`:`api/db/schema.rb` を更新する。コマンド1回で1コミット
5. `api/app/models/article.rb`:タイトルと本文のバリデーションを足す
6. `api/app/models/member.rb`:`has_many :articles` を足す
7. `docs/architecture.md`:「データモデル」に `articles` を書く

### データモデル

`articles`

| カラム | 型 | 制約 |
|---|---|---|
| `id` | bigint | 主キー |
| `member_id` | bigint | 必須、`members` への外部キー、インデックス |
| `title` | string | 必須。100文字まで(モデルのバリデーション) |
| `body` | text | 必須 |
| `created_at`、`updated_at` | datetime | 必須 |

関連:会員(`members`)1人が、記事(`articles`)を複数持つ。

### 判断したこと

- **model spec で確かめる**。#9 には API がないので、request spec では確かめられない。Rails コンソールでの手動確認は、CI でくり返せない。`Member` で model spec を作らなかったのは、同じ PR の request spec(`GET /api/me`)で会員を作る動きを確かめられたため。#10 の request spec と一部重なるが、model spec はモデルの決まりを、request spec は API の返事を確かめるので、役割が違う
- **必須はデータベースとモデルの両方で守る**。データベースの `null: false` と外部キーは、モデルを通らない書き込み(SQL を直接実行するなど)でも決まりを守る。モデルのバリデーションは、#10 の API が「どこがだめか」を返すために使う
- **タイトルの100文字は、モデルのバリデーションだけで守る**。Rails の `length` は文字の数で数えるので、日本語でも100文字になる。データベースのカラムには上限を付けない。上限を変えたくなったとき、migration を作らずに済むため
- **書いた会員の必須は、`belongs_to` に任せる**。Rails では、`belongs_to` の関連はデフォルトで必須になり、会員がなければバリデーションで保存されない。そのため、`validates :member, presence: true` は書かない
