# Rails API プロジェクトを作る

Issue: #5

## 目的

Rails API の土台を Docker で動かせるようにし、以降のタスクで RSpec のテストを書ける状態にする。

## やること

- `api/` に Rails 8.1(API モード)を作る。Ruby は 3.4 系の最新にする
- リポジトリ直下の `compose.yaml` で、db(PostgreSQL 17)と api(Rails)の2つのコンテナを動かす。ローカル開発はすべて Docker で行う(ADR 0002)
- RSpec を入れ、`/up`(Rails 標準のヘルスチェック)の request spec を1つ書く
- README に、Docker でのローカル開発のコマンド(初回の準備、起動・停止、テスト、gem の追加、マイグレーション、DB の作り直し)を書く

## やらないこと

- 本番用 Dockerfile の調整(フェーズ2)
- CI(#7)、Vue(#6)、モデルや認証(#8 以降)
- FactoryBot(最初にファクトリを使う #9 で入れる)
- rack-cors(#12 で判断する)
- エディタの補完のために、ローカルへ Ruby を入れること

## 完了条件

<!-- コマンドは、すべて docker compose run --rm api … の形でコンテナ内で実行する。AC-6 は db を起動させないよう --no-deps を付ける -->

- AC-1:`docker compose up` したとき、db と api のコンテナが起動し、api は `localhost:3000` で待ち受ける
- AC-2:`bin/rails db:prepare` を実行したとき、Rails は開発用とテスト用のデータベースを作る
- AC-3:api が起動している間、`GET /up` は 200 を返す
- AC-4:`bundle exec rspec` を実行したとき、RSpec は `/up` の request spec を実行し、すべて成功する
- AC-5:`bin/rubocop` と `bin/brakeman` を実行したとき、どちらも違反・警告なしで終わる
- AC-6:db コンテナが停止している場合、`bin/rails db:prepare` は接続エラーを表示して失敗する
- AC-7:README の手順どおりにコマンドを実行したとき、初回の準備から起動・停止まで、エラーなく完了する

## 設計

### 変更するファイル

セットアップのタスクなので、テストを先に書く順番の対象外。

1. `docs/specs/005-rails-new.md`:この仕様書
2. `docs/adr/0002-local-dev-on-docker.md`:ローカル開発をすべて Docker で行う判断
3. `api/` 一式:`rails new` のコマンド1回で1コミット。使い捨てのコンテナ内で実行する
   - オプション:`--api -d postgresql --skip-git --skip-test --skip-kamal --skip-solid --skip-thruster --skip-ci`
4. `.gitignore`(リポジトリ直下):Rails が普段 `api/.gitignore` に書くルールを、`api/` を付けて追加する。`.gitignore` は各ディレクトリに置かず、リポジトリ直下で一元管理する
5. `api/Dockerfile.dev`:開発用のイメージ(Ruby 3.4、gem のインストール)。`rails new` が作る本番用の `Dockerfile` は、フェーズ2の Cloud Run 用に残す
6. `compose.yaml`:db と api の2サービス。db のポートは Mac 側に公開しない。db のパスワードは開発専用の値を直接書く
7. `api/config/database.yml`:接続先を、環境変数で db コンテナにする
8. `api/Gemfile`:rspec-rails を追加する
9. `api/spec/` 一式:`rails generate rspec:install` のコマンド1回で1コミット
10. `api/spec/requests/health_spec.rb`:`/up` の request spec
11. `README.md`:ローカル開発のコマンド。1〜10 ができてから、実際に試したコマンドだけを書く
