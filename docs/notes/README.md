# 学習ノートと判断材料の一覧

技術の仕組みを図で説明する学習ノートと、ADR を書く前の判断材料を置く。HTML のノートは、ブラウザで開いて読む。

- Issue のために作ったノートは、ファイル名の先頭に Issue 番号(3桁)を付ける。仕様書 `docs/specs/` と同じ番号なので、仕様書の番号からノートを探せる
- Issue に紐づかないもの(全体の判断材料、図のメモ)は、番号を付けない
- 新しいノートを作ったら、この一覧に1行足す

## Issue ごとのノート

| Issue | 題名 | 何が分かるか | ファイル |
|---|---|---|---|
| Issue #5 | ローカル開発の構成 | ローカル開発を Docker で動かすか、Mac に直接入れるかの比較(ADR 0002 の判断材料) | [005-local-dev-docker.html](005-local-dev-docker.html) |
| Issue #5 | Dockerfile の基礎 | Dockerfile の各行が何をしているか | [005-dockerfile-basics.html](005-dockerfile-basics.html) |
| Issue #8 | ID トークンの署名 | Rails が、Vue から届いた ID トークンを本物だと確かめる仕組み | [008-id-token-signature.html](008-id-token-signature.html) |
| Issue #8 | 公開鍵で ID トークンを確かめる | Rails が Google の公開鍵を取りに行き、その鍵で確かめる流れ | [008-firebase-public-key.html](008-firebase-public-key.html) |
| Issue #8 | トークンを断る場所 | ID トークンを、どの確認で、どこで断るか | [008-token-rejection-points.html](008-token-rejection-points.html) |
| Issue #11 | Vue の Google ログインの全体像 | 会員が Vue で Google ログインし、Rails が会員を知るまで | [011-vue-google-login.html](011-vue-google-login.html) |
| Issue #11 | ログインのファイルの関係 | ログインのために書いたファイルが、どうつながっているか | [011-vue-login-files.html](011-vue-login-files.html) |
| Issue #11 | コードで追うログイン | ログインの流れを、実際のコードの順に読む | [011-vue-login-code-tour.html](011-vue-login-code-tour.html) |
| Issue #12 | Vitest を RSpec と比べて読む | Vue のテスト(Vitest)を、RSpec と対応づけて読む | [012-vitest-basics.html](012-vitest-basics.html) |
| Issue #29 | 本番の箱と、財布と、見張り | 本番の Google Cloud プロジェクト、請求先アカウント、予算アラートの関係 | [029-gcp-projects-and-billing.html](029-gcp-projects-and-billing.html) |
| Issue #30 | 置き場と、動かす場所と、鍵の金庫 | Rails を Cloud Run で動かすまでの流れと、master.key の渡り方 | [030-cloud-run-deploy.html](030-cloud-run-deploy.html) |
| Issue #31 | データベースと、接続口と、2つの門 | Rails から Cloud SQL までの繋がり方と、DB のパスワードの渡り方 | [031-cloud-sql-connection.html](031-cloud-sql-connection.html) |
| Issue #32 | Firebase Hosting と、3つのつなぎ | Vue を Firebase Hosting で本番に置き、ログイン → 投稿 → 一覧を通す流れ。`docker build` と `npm run build` の違い | [032-vue-firebase-hosting.html](032-vue-firebase-hosting.html) |
| Issue #33 | 自動デプロイと、サービスアカウントの権限借用 | main へのマージから本番が更新されるまでの流れ。GitHub の OIDC トークンが deployer のアクセストークンに交換される仕組みと、仕様書で決める5つの事項 | [033-auto-deploy.html](033-auto-deploy.html) |
| Issue #33 | OIDC と、GitHub Actions の OIDC トークン | OIDC トークンが発行され、Security Token Service で検証・交換されるまでの流れ。署名の検証で分かることと、属性の条件が必要な理由。OIDC トークンの項目と、プロバイダ github-actions の欄の対応 | [033-oidc-token.html](033-oidc-token.html) |
| Issue #33 | Google Cloud の全体図と用語 | プロジェクト・製品・リソースの入れ子と、リソースごとの IAM ポリシー。Rails とデプロイのジョブが、サービスアカウント api-runtime と deployer を使ってリクエストを送る関係 | [033-google-cloud-map.html](033-google-cloud-map.html) |

## Issue に紐づかないもの

| 題名 | 何が分かるか | ファイル |
|---|---|---|
| Vue の本番配信と Firebase Hosting | 本番で Vue をどこから配り、ブラウザから Rails をどう呼ぶかの選択肢(roadmap.md のフェーズ2の判断材料) | [vue-production-hosting.html](vue-production-hosting.html) |
| Firebase と Google Cloud の関係 | Firebase のプロジェクトと Google Cloud のプロジェクトが同じ1つであること。ブラウザから呼ぶ機能と Rails から使う機能、使う機能と使わない機能、どちらのコンソールで操作するか | [firebase-and-google-cloud.html](firebase-and-google-cloud.html) |
| テーブルと関連の全体像(ERD) | Rails のテーブルどうしのつながり(予定のテーブルを含む) | [erd.md](erd.md) |
