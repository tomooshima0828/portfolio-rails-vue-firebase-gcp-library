# main へのマージで自動デプロイする

Issue: #33

## 目的

main にマージしたら、オーナーが手を動かさなくても、本番が main の最新のコードで動作するようにする。

現在は、オーナーが手元で、次の4つを順に実行している(`docs/production-setup.md` の 3 章と 4 章)。

1. Rails のイメージをビルドし、Artifact Registry に保存する
2. Cloud Run のジョブ `migrate` のイメージを替えて実行し、表を更新する
3. Cloud Run のサービス `api` のイメージを替える
4. Vue をビルドし、Firebase Hosting にデプロイする

この4つを、GitHub Actions に同じ順で実行させる。GitHub Actions には Google アカウントがないため、Google Cloud を操作するには、サービスアカウント(Google Cloud の中にある、人ではなくプログラムのためのアカウント)の権限が必要になる。鍵ファイルを GitHub に預ける方法は使わず、Workload Identity 連携による権限借用を使う。権限借用は、別のプログラム(ここでは GitHub Actions)が、サービスアカウントの権限を一時的に使うことである。

全体の流れと仕組みの図は、学習ノート [docs/notes/033-auto-deploy.html](../notes/033-auto-deploy.html) にある。この仕様書の言葉は、ノートの言葉にそろえている。

## やること

- 本番用のプロジェクト `knowledge-library-prod` で、次を準備する(オーナーがコンソールで行う)
  - Security Token Service API を有効にする。Workload Identity 連携が使用する。2026-11-17 の時点で、有効になっていない
  - Workload Identity 連携を設定し、このリポジトリの Environment `production` を宣言したジョブにだけ、権限の借用を許可する
  - デプロイ用のサービスアカウント `deployer` を作成し、「本番の値」の表のロールだけを付与する
  - Artifact Registry のリポジトリ `knowledge-library` に、古いイメージを自動で削除する設定(クリーンアップ ポリシー)を付ける
- GitHub のリポジトリで、Environment `production` を作成する。main ブランチからのみ使用できるようにし、Vue の設定値を保存する(オーナーが行う)
- `.github/workflows/deploy.yml` を書く
- `docs/production-setup.md` に「5. 自動デプロイ」の章を書く。準備の手順と、問題があったときに前のバージョンに戻す手順を記載する
- `docs/architecture.md` と `README.md` の、デプロイの記述を更新する
- この PR をマージし、初めての自動デプロイが成功することを確認する。結果は、別の PR(`docs/` のブランチ)で手順書に追記する

Google Cloud と GitHub の画面の操作は、オーナーが行う。Claude は、操作の前に手順と理由を説明し、操作の後に gcloud・gh・curl の読み取りだけのコマンドで結果を確認する。各設定の詳細な仕組みは、学習ノートの5章のとおり、その作業の直前に説明する。

## やらないこと

- PR ごとのプレビュー環境(Firebase Hosting のプレビュー チャンネルなど)
- 自動のロールバック。問題があったときは、オーナーが手で前のバージョンに戻す(手順は 5 章に記載する)
- 開発用のプロジェクト `knowledge-library-dev` へのデプロイ
- Terraform など、Google Cloud の設定をコードで管理すること
- Cloud Build によるビルド
- 変更されたファイルによって、デプロイの対象を選ぶこと(文書だけの変更でも、すべてデプロイする)
- Cloud Run のサービスとジョブの、イメージ以外の設定(環境変数、シークレット、Cloud SQL 接続など)をワークフローで管理すること。現在の設定をそのまま使い、イメージだけを替える

## 完了条件

<!-- インフラの設定のタスクなので、RSpec や Vitest のテストはない。Claude が gcloud・gh・curl の読み取りだけのコマンドで確認し、ブラウザでの操作はオーナーが行って、結果を PR に記録する。AC-1、AC-6、AC-7、AC-8 はマージの後にしか確認できないため、結果は後の docs の PR に記載する -->

- AC-1:main へのマージで実行された CI が成功したとき、deploy.yml のジョブは、CI が確認したコミットから Rails のイメージをビルドして Artifact Registry に保存し、Cloud Run のジョブ `migrate` の実行、Cloud Run のサービス `api` の更新、Firebase Hosting への Vue のデプロイを、この順に実行する。デプロイの後、ジョブ `migrate` とサービス `api` のイメージのタグは、そのコミットの短い ID になる
- AC-2:PR の作成・更新で CI が実行されたとき、または main の CI が失敗したとき、デプロイは開始されない
- AC-3:ジョブ `migrate` の実行が失敗したとき、deploy.yml のジョブはそこで停止し、サービス `api` と Firebase Hosting は更新されない。本番は前のバージョンのまま動作し続ける
- AC-4:GitHub Actions は、鍵ファイルを使わずに Google Cloud を操作する。リポジトリと Environment の Secrets に、Google Cloud の鍵は保存されていない。`deployer` に、利用者が作成した鍵はない
- AC-5:Workload Identity 連携は、このリポジトリ(リポジトリ ID `1409915528`)の、Environment `production` を宣言したジョブにだけ、`deployer` の権限の借用を許可する。Environment `production` は、main ブランチからのみ使用できる
- AC-6:`deployer` に付与されているロールは、「本番の値」のロールの表に記載したものだけである。追加が必要になった場合は、失敗したときのエラーとともに、手順書に記録する
- AC-7:自動デプロイの後、利用者が本番の URL(`https://knowledge-library-prod.web.app/`)を開くと、新しくビルドした Vue の画面に記事の一覧が表示される。会員はログインして記事を投稿できる。ログインしていない人の `POST /api/articles` には、401 が返る
- AC-8:Artifact Registry のリポジトリ `knowledge-library` には、最新の2つのイメージだけが残る。クリーンアップ ポリシーは定期的に実行されるため、マージの翌日以降に確認する

AC-2 と AC-3 は、意図的に CI やマイグレーションを失敗させて確認することはしない。AC-2 は、この PR の CI が実行されてもデプロイが開始されないことと、`deploy.yml` の開始条件で確認する。AC-3 は、`deploy.yml` の実行順と、GitHub Actions が失敗した手順で停止する仕組みで確認する。

## 設計

### 変更するファイル

セットアップのタスクなので、テストを先に書く順番の対象外。

1. `docs/specs/033-auto-deploy.md`:この仕様書
2. `docs/notes/033-auto-deploy.html`:学習ノート。全体の流れ、OIDC トークンがアクセストークンに交換されるまでの流れ、仕様書で決める5つの事項
3. `docs/notes/README.md`:ノートの一覧に、2 を追加する
4. `docs/adr/0009-deploy-with-workload-identity-federation.md`:GitHub Actions から Google Cloud を操作する方法(Workload Identity 連携による権限借用)と、借用を許可する相手の絞り方の判断
5. (ファイルではない操作)Security Token Service API の有効化 → Workload Identity 連携 → `deployer` とロール → Environment `production` と Vue の設定値(オーナー)→ クリーンアップ ポリシー → 確認
6. `.github/workflows/deploy.yml`:自動デプロイのワークフロー
7. `docs/production-setup.md`:「5. 自動デプロイ」の章。5 で実際に行った手順と、前のバージョンに戻す手順。「本番の値」の表に、Workload Identity 連携と `deployer` を追加する
8. `docs/architecture.md`:「デプロイ(Rails)」と「デプロイ(Vue)」の記述を、自動デプロイの内容に更新する
9. `README.md`:技術一覧の「GitHub Actions(CD)」の行に、Firebase Hosting へのデプロイを追加する

マージの後に、別の PR(`docs/` のブランチ)で行う。

10. `docs/production-setup.md`:5 章に、初めての自動デプロイの結果(AC-1、AC-6、AC-7、AC-8)を追記する。追加が必要になったロールがあれば、ここに記録する

### 全体の流れ

```
オーナーが PR を main にマージする
  → GitHub が CI(ci.yml)を実行する
  → CI が成功したら、GitHub が deploy.yml のジョブを起動する
      1. CI が確認したコミットを取り出す
      2. Workload Identity 連携で、deployer の権限を借用する
      3. Rails のイメージをビルドし、Artifact Registry に保存する
      4. Cloud Run のジョブ migrate のイメージを替えて実行し、完了まで待つ
      5. Cloud Run のサービス api のイメージを替える
      6. Vue をビルドする(Vue の設定値は Environment production から読む)
      7. Firebase CLI で、Firebase Hosting にデプロイする
```

ジョブは1つにし、手順を上から順に実行する。いずれかの手順が失敗したら、それ以降の手順は実行しない。

### 本番の値

| 項目 | 値 |
|---|---|
| ワークフロー | `.github/workflows/deploy.yml`。名前は `Deploy` |
| 起動のきっかけ | ワークフロー `CI` が main ブランチで終了したとき(GitHub Actions の `workflow_run`) |
| GitHub の Environment | `production`。使用できるブランチは main だけ。URL は `https://knowledge-library-prod.web.app` |
| Environment に保存する Vue の設定値 | `VITE_FIREBASE_PROJECT_ID`、`VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_APP_ID`(値は `web/.env.production.local` と同じ) |
| Workload Identity 連携 | プール `github`、プロバイダ `github-actions`(発行元 `https://token.actions.githubusercontent.com`) |
| 権限の借用を許可する相手 | リポジトリ ID `1409915528`(`tomooshima0828/portfolio-rails-vue-firebase-gcp-library`)の、Environment `production` を宣言したジョブ |
| デプロイ用のサービスアカウント | `deployer@knowledge-library-prod.iam.gserviceaccount.com` |
| イメージのタグ | CI が確認したコミットの短い ID(7文字)。手でビルドしていたときと同じ |
| Node | `24.22.0`(`web/Dockerfile.dev` と CI と同じ) |
| Firebase CLI | `firebase-tools` 15.34.2 を `npx` で使う(4 章と同じ) |
| クリーンアップ ポリシー | 最新の2つのイメージを残し、それ以外を削除する |

`deployer` に付与するロール(AC-6 の基準)。範囲を部品単位で指定できるものは、部品単位で付与する。

| 用途 | ロール | 付与する範囲 |
|---|---|---|
| イメージを保存する | Artifact Registry 書き込み(`roles/artifactregistry.writer`) | リポジトリ `knowledge-library` |
| ジョブ `migrate` のイメージを替えて実行する | Cloud Run デベロッパー(`roles/run.developer`) | ジョブ `migrate` |
| サービス `api` のイメージを替える | Cloud Run デベロッパー(`roles/run.developer`) | サービス `api` |
| ジョブとサービスを `api-runtime` として動作させる | サービス アカウント ユーザー(`roles/iam.serviceAccountUser`) | サービスアカウント `api-runtime` |
| Firebase Hosting にデプロイする | Firebase Hosting 管理者(`roles/firebasehosting.admin`) | プロジェクト(部品単位では付与できない) |
| 権限の借用を許可する | Workload Identity ユーザー(`roles/iam.workloadIdentityUser`) | `deployer` 自身。相手は「権限の借用を許可する相手」の行のとおり |

### 判断したこと

学習ノートの5章の、5つの決定事項。

- **A. いつデプロイを開始するか**:main へのマージで実行された CI が成功したときだけ開始する。CI は PR の作成時や更新時にも実行されるが、そのときは開始しない。テストを通過したコードだけを本番に反映するため。CI の `ci.yml` にデプロイを追加せず、`deploy.yml` を別に作るのは、PR でも実行されるファイルに、本番を操作する権限を持たせないため
- **B. Vue の設定値をどこに保存するか**:このリポジトリの Environment `production` に、秘匿しない形(GitHub の Variables)で保存する。値は Firebase Hosting がブラウザに配信する JavaScript に含まれる公開情報で、秘匿しても保護できるものがない。秘匿しない形であれば、どの値でビルドしたかを確認でき、誤った値に気づきやすい。値は、オーナーが `web/.env.production.local` から転記する。Claude は値を読まず、名前があることだけを確認する
- **C. `deployer` に何を許可するか**:デプロイの4つの手順に必要な操作だけを、使用するリソースの単位で許可する(上のロールの表)。アクセストークンが漏洩した場合でも、操作できる範囲を最小限にするため。不足があれば、Issue #30 と同様に、失敗したときのエラーを確認してから追加し、手順書に記録する
- **D. 誰に `deployer` の権限の借用を許可するか**:このリポジトリの、Environment `production` を宣言したジョブだけに許可する。リポジトリは名前ではなく ID で指定する。名前は変更でき、削除後に別の人が同じ名前で作成することもできるが、ID は変わらないため。PR の CI のジョブは Environment `production` を宣言しないため、借用は拒否される。条件を Workload Identity 連携のプロバイダに記載するか、`deployer` のロールで絞るか、両方にするかは、ADR 0009 で決める
- **E. 古いイメージをどうするか**:最新の2つだけを残し、それ以外は Artifact Registry のクリーンアップ ポリシーで自動削除する。マージのたびにイメージ(約 192MB)が1つ増えるため、無料枠(0.5GB)に収める。2つ残すのは、現在動作しているイメージと、問題があったときに戻すための1つ前のイメージ。現在のクリーンアップ ポリシーは「テストを実行」(削除せず記録だけ)なので、実際に削除する設定に変更する

その他の判断。

- **イメージは、GitHub Actions のランナーでビルドする**。ランナー(GitHub Actions がジョブごとに用意し、終了後に破棄する仮想マシン)は amd64 なので、Mac のときのようなエミュレーション(`--platform linux/amd64`)が不要で、ビルドが速い。Cloud Build を使うと、ビルド用のサービスアカウントと権限がもう一組必要になる
- **Vue は、ランナーの Node でビルドする**。手元では、`compose.yaml` の開発用の値と、Mac 用の `node_modules` を避けるために Node のコンテナを使った(4.5)が、ランナーにはどちらもない。CI の `web` のジョブと同じく、Node の版を指定し、`npm ci` で依存関係を入れ直す
- **Cloud Run のサービスとジョブは、イメージだけを替える**。環境変数、シークレット、Cloud SQL 接続などの設定は、現在の設定をそのまま使う。設定まで `deploy.yml` に書くと、コンソールで変更した設定と食い違ったときに、どちらが正しいか分からなくなる。設定を変更するときは、これまでどおり手順書に沿って手で変更する
- **ジョブ `migrate` の完了を待ってから、サービス `api` を替える**。表を先に更新し、その後に新しいコードを動作させる順番を守る(ADR 0006)
- **連続してマージしたときは、前のデプロイの完了を待たせる**(GitHub Actions の `concurrency`)。途中で取り消すと、ジョブ `migrate` とサービス `api` のイメージが食い違ったまま停止することがある
- **文書だけの変更でも、すべてデプロイする**。「main の最新のコミットが本番で動作している」という1つのルールで管理できる。無駄になるのは、ビルドとデプロイの数分だけ
- **Action は SHA で指定する**。CI と同じ(仕様書 007)。`deploy.yml` の権限は、既定を `contents: read` にし、デプロイのジョブだけに OIDC トークンの発行(`id-token: write`)を許可する

### 注意すること

- **初めての自動デプロイは、この PR のマージで実行される**。`workflow_run` は main にあるワークフローのファイルしか使わないため、マージの前には実行できない。そのため、PR 本文には `Closes #33` ではなく `Refs #33` を書き、マージで Issue #33 が閉じないようにする。自動デプロイの成功を確認し、結果を記載した PR をマージしてから、Issue #33 を閉じる。失敗した場合も、本番は前のバージョンのまま動作し続けるので(AC-3)、`fix/` のブランチで修正する
- **DB がない間は、デプロイが失敗する**。ADR 0007 で Cloud SQL を削除している間や、2026-12-09 ごろの作り直しの最中は、ジョブ `migrate` が DB に接続できずに失敗し、デプロイはそこで停止する。DB を作り直した後に、失敗したワークフローを GitHub の画面で「Re-run」すれば、デプロイし直せる
- **手作業のデプロイの手順も残す**。3 章と 4 章の手順は、自動デプロイが使えないとき(GitHub Actions の障害、権限の不足など)のために残す。手作業でデプロイしても、次のマージで main の最新に戻る
