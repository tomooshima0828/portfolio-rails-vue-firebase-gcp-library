# Rails で Firebase の ID トークンを検証する

Issue: #8

## 目的

API が、リクエストした会員を Firebase の ID トークンで特定できるようにする。#10 の「ログインした会員だけが記事を作れる」の土台にする。

## やること

- `jwt` gem で、Firebase の ID トークンを検証する。Firebase の SDK は使わず、Firebase 公式の「サードパーティの JWT ライブラリで ID トークンを検証する」手順のとおりに確かめる(Ruby 向けの Admin SDK はないため)
- 会員のテーブル `members` と、モデル `Member` を作る。会員は Firebase の uid だけを持つ
- 検証に通ったトークンの uid で会員を探し、いなければ作る
- 確かめるための API `GET /api/me` を作る。ログインしている会員を返す。#11 で、ログインが Rails までつながったかを確かめるときにも使う

## やらないこと

- Vue のログイン(#11)
- Auth Emulator が発行する、署名のないトークンの受け付け。ローカルで本物の Firebase と Emulator のどちらでログインするかと合わせて、#11 で決める
- 開発環境の `FIREBASE_PROJECT_ID` の設定(#11。本物のトークンで試せるのは #11 から)
- 会員の名前やメールアドレスの保存(必要になった Issue で足す)
- ログアウトやアカウントの停止の即時反映。Rails は Firebase に問い合わせないので、発行済みの ID トークンは期限(1時間)まで通る。失効の確認(Admin SDK の `checkRevoked` にあたる処理)は作らない
- rack-cors(#12)

## 完了条件

<!-- テストでは、spec/support で作った RSA の鍵でトークンに署名し、Google の公開鍵の代わりにその鍵を返すように差し替える -->

- AC-1:有効な ID トークンを `Authorization: Bearer` で付けて `GET /api/me` を送ったとき、API は 200 と、会員の `id`・`firebase_uid` を返す
- AC-2:初めての uid の有効なトークンが届いたとき、API は会員を作る
- AC-3:同じ uid の有効なトークンが2回届いたとき、API は会員を新しく作らず、同じ会員を返す
- AC-4:`Authorization` ヘッダーがない、または `Bearer` の形でない場合、API は 401 を返す
- AC-5:署名が Firebase の公開鍵で確かめられない場合(別の鍵で署名されている、公開鍵の一覧にない `kid`、署名の方式が RS256 以外。署名なしの `none` を含む)、API は 401 を返す
- AC-6:有効期限(`exp`)が切れている、または発行時刻(`iat`)かログイン時刻(`auth_time`)が未来の場合、API は 401 を返す
- AC-7:宛先(`aud`)か発行元(`iss`)が、自分の Firebase プロジェクトと違う場合、API は 401 を返す
- AC-8:uid(`sub`)が空の場合、API は 401 を返す
- AC-9:401 を返す場合、API は会員を作らない
- AC-10:Google が示すキャッシュの期間(`Cache-Control: max-age`)の間、検証のクラスは公開鍵を取得し直さない
- AC-11:キャッシュにない `kid` のトークンが届いたとき、検証のクラスは公開鍵を取得し直し、新しい鍵で確かめる(Google が鍵を入れ替えたとき)
- AC-12:PR の CI の4つのジョブが成功する
- AC-13:キャッシュにない `kid` のトークンで公開鍵を取得し直してから5分の間は、別のキャッシュにない `kid` のトークンが届いても、検証のクラスは公開鍵を取得し直さない(偽物のトークンで、Google への通信を増やされないため)

## 設計

### 変更するファイル

機能のタスクなので、テストを先に書く(4〜6 の時点ではテストは失敗する)。

1. `docs/specs/008-verify-id-token.md`:この仕様書
2. `api/Gemfile`、`api/Gemfile.lock`:`jwt` を追加する。追加後に api のイメージを作り直す
3. `api/spec/rails_helper.rb`:`spec/support` のファイルを読み込む行を有効にする
4. `api/spec/support/firebase_id_token_helper.rb`:テスト用の道具。RSA の鍵を作ってトークンに署名し、検証のクラスが取り寄せる公開鍵を、その鍵に差し替える。#10 でも使う
5. `api/spec/requests/api/me_spec.rb`:AC-1〜9 の request spec
6. `api/spec/lib/firebase_id_token_verifier_spec.rb`:AC-10、AC-11、AC-13 のテスト
7. `rails generate model Member 'firebase_uid:string!:uniq' --no-test-framework`:migration とモデル。`!` で `null: false` を付ける。コマンド1回で1コミット。モデルのテストの雛形は作らない(request spec で確かめるため)
8. `bin/rails db:migrate`:`api/db/schema.rb` を更新する。コマンド1回で1コミット
9. `api/config/application.rb`:Firebase のプロジェクト ID を、環境変数 `FIREBASE_PROJECT_ID` から読む
10. `api/config/environments/test.rb`:テストでは、プロジェクト ID を固定の値にする
11. `api/app/lib/firebase_id_token_verifier.rb`:公開鍵を取り寄せてキャッシュし、署名と中身を確かめて、トークンの中身を返す
12. `api/app/controllers/concerns/firebase_authenticatable.rb`:`authenticate_member!` と `current_member`。ヘッダーからトークンを取り出して検証し、会員を探すか作る。失敗したら 401 を返す
13. `api/app/controllers/api/me_controller.rb`:`GET /api/me`
14. `api/config/routes.rb`:`/api/me` を足す
15. `docs/architecture.md`:「API」と「データモデル」に書く
16. `api/Gemfile.lock`:`bundle update rack crass --conservative` で、rack を 3.2.8 に、crass を 1.0.8 に上げる。PR の CI(AC-12)で、bundler-audit が、main にもとからある rack 3.2.7 と crass 1.0.7 の脆弱性を見つけたため。この Issue の機能とは関係ないが、CI を通してマージするために、この PR に含める。コマンド1回で1コミット

### 入出力

`GET /api/me`

- リクエスト:`Authorization: Bearer <ID トークン>`
- 成功:200

  ```json
  { "id": 1, "firebase_uid": "abc123" }
  ```

- 失敗:401

  ```json
  { "error": "unauthorized" }
  ```

  どの確認で失敗したかは返さない(偽造を試す人に手がかりを与えないため)。理由は Rails のログに残す

### データモデル

`members`

| カラム | 型 | 制約 |
|---|---|---|
| `id` | bigint | 主キー |
| `firebase_uid` | string | 必須、一意のインデックス |
| `created_at`、`updated_at` | datetime | 必須 |

### 検証で確かめること

Firebase 公式の手順のとおり。1つでも満たさなければ 401。

| 項目 | 確かめること |
|---|---|
| 署名 | トークンのヘッダーの `kid` に合う Google の公開鍵で、署名が確かめられる |
| `alg` | RS256 |
| `exp` | 未来 |
| `iat` | 過去 |
| `auth_time` | 過去 |
| `aud` | 自分の Firebase プロジェクト ID |
| `iss` | `https://securetoken.google.com/<プロジェクト ID>` |
| `sub` | 空でない(これが Firebase の uid) |

### 判断したこと

- **公開鍵は JWKS(JSON Web Key Set)の URL から取る**(`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`)。`jwt` gem の `jwks:` に渡すと、gem がトークンの `kid` に合う鍵を選ぶ。知らない `kid` が来たときに取り直す仕組み(AC-11)も、gem に用意されている。tech-notes の firebase-auth-handson と同じ形。Firebase の公式文書に載っている取得先は、同じ鍵を証明書(X.509)の形で返す `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` のほう。JWK の形なら `jwt` gem がそのまま読めるため、こちらを使う。この URL が使えなくなったら、公式文書の URL に替えて、証明書から鍵を取り出す処理を足す
- **公開鍵は、検証のクラスの中にメモリで保存する**。期間は Google が返す `max-age`。複数のスレッドが同時に取り直さないよう、`Mutex` で守る。テストでは、テストごとに保存した鍵を消す
- **知らない `kid` での取り直しは、5分に1回までにする**(AC-13)。適当な `kid` を書いた偽物を大量に送られると、そのたびに Google へ取りに行くことになり、Rails が遅くなったり、Google に通信を止められたりするため。5分は、前回の「知らない `kid` での取り直し」から数える。期限切れでの取り直しは制限しない。Google の鍵の入れ替えと偽物が5分以内に重なると、本物のトークンが最大5分 401 になるが、まれなので受け入れる。`jwt` gem の README にも、同じ考え方の例がある
- **検証のクラスは `app/lib/` に置く**。モデルでもコントローラーでもない、Firebase のための道具のため。`app/` の下なので、Rails が自動で読み込む
- **会員は `create_or_find_by!` で作る**。初めてのリクエストが同時に2つ届いても、一意のインデックスのおかげで、会員は1人だけになる
- **Firebase のプロジェクト ID は、Rails の設定(`config.x`)に1か所で持つ**。設定がない場合、検証のクラスはエラーにする(誤ったプロジェクトのトークンを通さないため)
