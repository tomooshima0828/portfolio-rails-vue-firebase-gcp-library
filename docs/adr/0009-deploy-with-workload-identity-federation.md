# 0009. GitHub Actions は、Workload Identity 連携でサービスアカウント deployer の権限を借用して、本番を操作する

- 日付:2026-11-18
- 状態:採用

## 背景

Issue #33 で、main へのマージのたびに、GitHub Actions が本番へデプロイするようにする([仕様書 033](../specs/033-auto-deploy.md))。GitHub Actions は Google アカウントを持たないため、Artifact Registry、Cloud Run、Firebase Hosting を操作するには、Google Cloud がリクエストの送り手を識別できる仕組みが必要になる。[README.md](../../README.md) の技術一覧では、「鍵ファイルを使わない CI デプロイ」を目標にしている。

この ADR では、次の2つを決める。

- **判断1**:GitHub Actions から Google Cloud を操作する方法
- **判断2**:権限の借用を許可する相手を、どこで絞るか

用語は、学習ノート [docs/notes/033-auto-deploy.html](../notes/033-auto-deploy.html) にそろえる。

- **サービスアカウント**:Google Cloud の中にある、人ではなくプログラムのためのアカウント。権限(ロール)は、このアカウントに付ける
- **権限借用**:別のプログラム(ここでは GitHub Actions)が、サービスアカウントの権限を一時的に使うこと
- **OIDC トークン**:GitHub が、ジョブが実行されるたびに発行する、署名つきのトークン。「どのリポジトリの、どの Environment のジョブか」が記載される
- **Workload Identity 連携**:外部(ここでは GitHub)が発行したトークンを検証し、Google Cloud のトークンと交換する仕組み。Security Token Service が OIDC トークンを連携トークンに交換し、IAM Credentials API が連携トークンをサービスアカウントのアクセストークンに交換する

## 選択肢

### 判断1:GitHub Actions から Google Cloud を操作する方法

【鍵ファイル方式】は、鍵ファイルを GitHub に保存するかどうかで、ほかの2つと異なる。【借用方式】と【直接付与方式】の違いは、ジョブと Google Cloud のリソースの間に `deployer` を挟むかどうかである。

| | `deployer` | ロールを付ける相手 | トークンの交換 |
|---|---|---|---|
| 【借用方式】 | 挟む | `deployer` に集める | 2回(連携トークンを `deployer` のアクセストークンに交換する) |
| 【直接付与方式】 | 挟まない | ジョブそのもの(外部の ID)に直接付ける | 1回(連携トークンのまま使う) |

外部の ID は、Workload Identity 連携を通った「このリポジトリのジョブ」を、Google Cloud の中で指す名前である(例:`principalSet://iam.googleapis.com/projects/656607631341/locations/global/workloadIdentityPools/github/attribute.repository_id/1409915528`)。【直接付与方式】では、ロールを付ける場所ごとに、この名前を許可の一覧(IAM ポリシー)に記載する。

| 選択肢 | 内容 |
|---|---|
| 【鍵ファイル方式】 | サービスアカウント `deployer` の鍵ファイル(JSON)を作り、GitHub の Secrets に保存する。ジョブは鍵ファイルで `deployer` として操作する |
| 【借用方式】 | Workload Identity 連携で、OIDC トークンを連携トークンに、連携トークンを `deployer` のアクセストークンに交換する(交換は2回)。ジョブはアクセストークンで `deployer` として操作する。ロールは `deployer` に付ける |
| 【直接付与方式】 | Workload Identity 連携で、OIDC トークンを連携トークンに交換する(交換は1回)。`deployer` を作らず、ロールを「このリポジトリの、Environment `production` のジョブ」という外部の ID に直接付ける。ジョブは連携トークンで操作する |

| | 【鍵ファイル方式】 | 【借用方式】 | 【直接付与方式】 |
|---|---|---|---|
| GitHub に保存するもの | 鍵ファイル(期限なし) | なし | なし |
| トークンの交換 | なし | 2回 | 1回 |
| ロールを付ける相手 | `deployer` | `deployer` | 外部の ID(`principalSet://…`) |
| 操作の記録に出る名前 | `deployer` | `deployer` | 外部の ID の長い識別子 |
| 漏洩したときの被害 | 鍵を削除するまで続く | アクセストークンの期限(初めの値で1時間)まで | 連携トークンの期限まで |
| Firebase CLI での動作 | 動作する | 動作する | 確認していない |

### 判断2:権限の借用を許可する相手を、どこで絞るか

| 選択肢 | 内容 |
|---|---|
| 【入口で絞る】 | Workload Identity 連携のプロバイダの条件で、リポジトリ ID と Environment を確認する。条件に合わない OIDC トークンは、Security Token Service が交換を拒否する(ノートの図3 の ②) |
| 【deployer で絞る】 | プロバイダの条件は緩くし、`deployer` に付ける Workload Identity ユーザーのロール(`roles/iam.workloadIdentityUser`)の相手を限定する。条件に合わない相手には、IAM Credentials API がアクセストークンを発行しない(ノートの図3 の ⑤) |
| 【両方で絞る】 | プロバイダの条件と、`deployer` の Workload Identity ユーザーのロールの相手の両方で、リポジトリ ID と Environment を確認する |

## 決定

- **判断1**:【借用方式】を採用する。デプロイ用のサービスアカウント `deployer` を作り、ロールは `deployer` に付ける
- **判断2**:【両方で絞る】を採用する。許可する相手は、リポジトリ ID `1409915528` の、Environment `production` を宣言したジョブとする

プロバイダの属性の対応づけ、条件の式、Workload Identity ユーザーのロールを付ける相手の識別子などの具体的な設定値は、準備の作業の前に説明し、[docs/production-setup.md](../production-setup.md) の 5 章に記録する。

## 理由

### 判断1

- **【鍵ファイル方式】は、漏洩したときの被害に期限がない**。鍵ファイルは、削除するまで有効なままになる。ワークフローのログへの出力や、ワークフローで使う Action の不正なコードなどで漏洩すると、拾った人は、どこからでも、削除されるまで本番を操作できる。定期的に作り直して Secrets を差し替える管理も、オーナーの作業として残る。Google の文書も、Workload Identity 連携は「サービスアカウントの鍵に伴う管理と安全上の負担をなくす」と説明している。
- **【直接付与方式】は、このプロジェクトで動作するかを確認できていない**。Google の文書は、一般に【直接付与方式】を推奨している。一方で、「一部の Google Cloud の製品には API の制限がある」とも記載しており、その場合はサービスアカウントの権限借用を使うよう案内している。このプロジェクトでは、Firebase CLI による Firebase Hosting へのデプロイが、【直接付与方式】で動作するかを確認していない。【借用方式】であれば、gcloud も Firebase CLI も、サービスアカウントとして動作する。
- **【借用方式】は、操作の記録と権限の画面が読みやすい**。操作の記録や IAM の画面に `deployer` という1つの名前で表示されるため、オーナーが確認しやすい。Issue #30 で作った `api-runtime` と同じ形でもある。
- **後から【直接付与方式】に移行できる**。移行の作業は、`deployer` に付けたロールを外部の ID に付け直し、`deploy.yml` の権限借用の設定を外すことだけである。

まとめると、【借用方式】は、`deployer` を1つ作る手間と、交換が1回多いこと(道具が自動で行うため、デプロイの時間はほとんど変わらない)を受け入れる代わりに、鍵を保存せず、確実に動作し、確認しやすい構成になる。

### 判断2

- **入口の条件は省けない**。GitHub は、すべての組織とリポジトリで、同じ発行元の URL を使う。Google の文書は、GitHub のプロバイダには、自分の組織やリポジトリが発行したトークンに限定する条件を「付けなければならない(must)」と記載している。条件がなければ、ほかの人のリポジトリのジョブが発行した OIDC トークンも、交換されてしまう。
- **片方の設定を誤っても、もう片方で止まる**。条件の式の誤りや、Workload Identity ユーザーのロールを付ける相手の誤りは、設定画面では気づきにくい。2か所で確認しておけば、片方を誤っても、もう片方で拒否される。同じ条件を2か所に書くことになるが、これは安全のための意図した二重の確認である。
- **リポジトリは、名前ではなく ID で指定する**。リポジトリの名前は変更でき、削除後に別の人が同じ名前で作成することもできる。Google の文書も、一意で再利用されない数字の ID(`*_id`)を使うよう勧めている。

## 影響

- **準備の作業が増える**:Security Token Service API の有効化、Workload Identity 連携(プールとプロバイダ)、`deployer` とロールの作成を、オーナーがコンソールで1回だけ行う(仕様書 033 の「やること」)
- **`deployer` の鍵は作成しない**:作成していないことを、完了条件 AC-4 で確認する
- **リポジトリを作り直したとき、または Environment の名前を変えたときは、条件を更新する**:リポジトリを削除して作り直すと ID が変わるため、プロバイダの条件と Workload Identity ユーザーのロールの相手の両方を更新する。リポジトリの名前の変更だけであれば、更新は不要
- **見直すとき**:Firebase CLI を含め、使う道具がすべて【直接付与方式】で動作することを確認でき、`deployer` の管理を減らしたくなったときは、【直接付与方式】への移行を検討する

## 参考

- 仕様書:[docs/specs/033-auto-deploy.md](../specs/033-auto-deploy.md)
- 学習ノート:[docs/notes/033-auto-deploy.html](../notes/033-auto-deploy.html)
- 本番環境の作り方:[docs/production-setup.md](../production-setup.md)
- Google の文書:[Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)、[Configure Workload Identity Federation with deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)(2026-11-18 に確認)
