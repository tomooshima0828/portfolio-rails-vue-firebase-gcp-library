# 本番環境の作り方

本番環境(Google Cloud / Firebase)を一から作り直せるように、実際に行った手順を残す。章は Issue ごとに足していく。

- 作業はオーナーがコンソールで行う。画面の名前は、作業した日のもの。コンソールは見た目が変わることがあるので、名前が違ったら、意味の近いものを探す
- カード番号や請求先アカウントの ID など、支払いの情報はこの文書に書かない
- 開発用と本番用でプロジェクトを分ける理由は [ADR 0005](adr/0005-separate-dev-prod-projects.md)、全体の図は [docs/notes/029-gcp-projects-and-billing.html](notes/029-gcp-projects-and-billing.html)

## 本番の値

| 項目 | 値 |
|---|---|
| プロジェクト ID | `knowledge-library-prod` |
| Firebase のプラン | Blaze(従量課金) |
| 請求先アカウントの通貨 | 日本円(JPY) |
| 予算 | 月 3,000円。対象は `knowledge-library-prod` だけ |
| 予算の通知 | 実際の費用の 50%・90%・100%、予測の 100% |
| リージョン | `asia-northeast1`(東京)。Artifact Registry、Secret Manager、Cloud Run をそろえる |
| イメージの置き場(Artifact Registry) | リポジトリ `knowledge-library`(Docker 形式) |
| 動かす場所(Cloud Run) | サービス `api` |
| Rails 専用の身分証(サービスアカウント) | `api-runtime@knowledge-library-prod.iam.gserviceaccount.com` |
| 鍵の金庫(Secret Manager) | シークレット `rails-master-key`。中身は `api/config/master.key` |
| API の URL | `https://api-656607631341.asia-northeast1.run.app` |
| DB(Cloud SQL) | インスタンス `db`。接続名 `knowledge-library-prod:asia-northeast1:db`。#31 では30日間の無料お試し(2026-11-11 作成、2026-12-11 に切れる) |
| データベース、DB の利用者 | `api_production`、`api`(パスワードで認証する) |
| 鍵の金庫(Secret Manager) | シークレット `db-password`。中身は利用者 `api` のパスワード |
| 表を作るジョブ(Cloud Run) | ジョブ `migrate`。`bin/rails db:migrate` を実行する |
| 画面の URL(Firebase Hosting) | `https://knowledge-library-prod.web.app`。`/api/**` は Cloud Run のサービス `api` へ転送する(`firebase.json`) |
| Firebase Auth | ログインの方法は Google。ウェブアプリ `knowledge-library-web` |
| Rails が信じる Firebase のプロジェクト | Cloud Run の環境変数 `FIREBASE_PROJECT_ID=knowledge-library-prod` |
| 今のイメージ | `e912526`(サービス `api` とジョブ `migrate` の両方)。2026-11-24 から。自動デプロイでデプロイした |
| 自動デプロイ | `.github/workflows/deploy.yml`。main の CI が成功したときに起動する |
| Workload Identity 連携 | プール `github`、プロバイダ `github-actions`(発行元 `https://token.actions.githubusercontent.com/`) |
| デプロイ用のサービスアカウント | `deployer@knowledge-library-prod.iam.gserviceaccount.com`。GitHub Actions のジョブが権限を借用する |
| GitHub の Environment | `production`。main ブランチだけで使用できる。Vue の設定値を Variables に保存する |
| Artifact Registry のクリーンアップ ポリシー | 最新の2つのイメージを残し、それ以外を削除する |
| サービス `api` のスケール | 同時実行数 `3`、最大インスタンス数 `2`(サービス全体の値)、最小インスタンス数 `0` |
| Puma のスレッド数、接続の上限 | 環境変数 `RAILS_MAX_THREADS=3`(サービス `api` だけ)。worker は 1 つ(`WEB_CONCURRENCY` を設定していない) |

## 1. プロジェクトと課金(#29)

作業した日:2026-11-10

### 1.1 プロジェクトを作る

1. Firebase のコンソール(https://console.firebase.google.com/)で、「プロジェクトを作成」を押す
2. プロジェクト名に `knowledge-library-prod` と入れる。名前の下に出るプロジェクト ID が `knowledge-library-prod` であることを確かめる。ID は後から変えられない
3. Gemini と Google アナリティクスは、どちらも使わない
4. 作成後、ウェブアプリや Authentication はまだ追加しない(#32 で行う)

### 1.2 請求先アカウントを作り、Blaze プランに上げる

1. Firebase のコンソールで `knowledge-library-prod` を開き、左下のプラン表示(Spark)の「変更」から Blaze を選ぶ
2. 請求先アカウントを選ぶところで、Cloud Billing アカウントを新しく作る。国は日本、アカウントの種類は個人、支払い方法はクレジットカード。通貨は日本円になる(後から変えられない)
3. 「JPY の予算額」を聞かれるので、`3000` を入れる。通知の段階は 50%・90%・100% で自動で作られ、ここでは変えられない
4. 「プランの変更が正常に完了しました」と出て、左下の表示が「Blaze 従量制」になれば完了

請求先アカウントの名前は、自動で「Firebase のお支払い」になる。無料トライアルの案内は出なかった。

### 1.3 予算を直す

1.2 の 3 で作られた予算を、Google Cloud のコンソールで直す。新しくは作らない(同じ見張りが2つになる)。

1. Google Cloud のコンソール(https://console.cloud.google.com/)で、左のメニューの「お支払い」を開く
2. 「コスト管理」の「予算と上限」を開き、「Firebase Project knowledge-library-prod」を押す
3. 次のようにして、「Save」を押す

| 画面の見出し | 項目 | 値 |
|---|---|---|
| 定義 | 種類 | 「アラートのみ」。「利用額上限の適用」は選ばない(自動では止めない。仕様書 029) |
| 範囲 | 期間 | 月別 |
| 範囲 | プロジェクト | `knowledge-library-prod` だけ(初めから選ばれていて、変えられない) |
| 範囲 | コスト削減 | 「コスト削減プログラム」「その他のコスト削減」の両方のチェックを外す。クレジットを引く前の金額で見るため |
| 金額 | 予算タイプ、目標金額 | 指定額、¥3000 |
| 操作 | アラートしきい値ルール | 50%・90%・100% は「実値」のまま。「しきい値を追加」で 100%、トリガー対象「予測」を足す |
| 操作 | メール通知 | 「メール通知アラートを課金管理者とユーザーに送信する」にチェック |

### 1.4 確かめる

`gcloud` にオーナーのアカウントでログインしてから(`gcloud auth login`)、読み取りだけのコマンドで確かめる。

```bash
# 本番用と開発用のプロジェクトが別々にある
gcloud projects list --format="table(projectId,name)"

# 本番用は課金が有効(True)、開発用は無効(False)
gcloud billing projects describe knowledge-library-prod --format="value(billingEnabled)"
gcloud billing projects describe knowledge-library-dev --format="value(billingEnabled)"

# 本番用で Firebase が有効(firebase.googleapis.com と出る)
gcloud services list --enabled --project=knowledge-library-prod \
  --filter="config.name:firebase.googleapis.com" --format="value(config.name)"
```

予算は、1.3 の画面で確かめる。`gcloud billing budgets list` は、予算を読む API(Billing Budgets API)をどのプロジェクトの利用枠で呼ぶかの指定が要り、そのプロジェクトでこの API を有効にしないと動かない。#29 では API を有効にしないため、使っていない。

### 1.5 注意点

- 費用が予算に反映されるまで、数時間かかる。24 時間以上かかることもある(予算の画面の説明より)。予算のメールは即時ではない
- 予算アラートはメールを送るだけで、課金は止めない。止めるのは、メールを見たオーナーが手で行う(Cloud SQL を止める・削除する)
- 「予算と上限」の画面の「利用額上限」は、予算に達したら一部のサービスを一時停止する仕組み。#29 では使わない。Cloud SQL は対象外だった(#31 で確かめた。ADR 0007)
- #29 の時点では、本番用のプロジェクトに部品がないので、料金はかからない。課金が始まるのは #31(Cloud SQL)から

## 2. Cloud Run(#30)

作業した日:2026-11-10〜2026-11-11

Rails のイメージを Artifact Registry に置き、Cloud Run で動かし、`/up` が 200 を返すところまでを手で通す。DB はまだ繋がない(#31)。仕様は [docs/specs/030-cloud-run-deploy.md](specs/030-cloud-run-deploy.md)、仕組みの図は [docs/notes/030-cloud-run-deploy.html](notes/030-cloud-run-deploy.html)。

各節の最後に、同じことをする gcloud のコマンドを添える。#30 では、2.5 のコマンド以外は実行していない(作業はコンソールで行った)。#33 で自動にするときの下書きとして残す。

### 2.1 API を有効にする

1. Google Cloud のコンソールで「API とサービス」の「ライブラリ」を開く(https://console.cloud.google.com/apis/library?project=knowledge-library-prod)。画面の上が `knowledge-library-prod` であることを確かめる
2. 次の4つを1つずつ検索して開き、「有効にする」を押す。有効になると、ボタンが「管理」に変わる

| 検索する言葉 | API | 何に使うか |
|---|---|---|
| `Cloud Run` | Cloud Run Admin API | 動かす場所 |
| `Artifact Registry` | Artifact Registry API | イメージの置き場 |
| `Secret Manager` | Secret Manager API | 鍵の金庫 |
| `Identity and Access Management` | Identity and Access Management (IAM) API | 身分証(サービスアカウント)を作る |

次の2つは、Google が自動で有効にした。自分では有効にしない。

| API | 自動で有効になった理由 |
|---|---|
| Container Registry API | Cloud Run が使う |
| IAM Service Account Credentials API | IAM API が依存している |

「有効な API とサービス」の一覧に出ているものは、すべて有効。#29 で Firebase を追加したときに有効になったもの(BigQuery、Firestore など)も並んでいる。

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com --project=knowledge-library-prod
```

### 2.2 イメージの置き場(Artifact Registry)を作る

1. 「Artifact Registry」を開き(https://console.cloud.google.com/artifacts?project=knowledge-library-prod)、「リポジトリを作成」を押す
2. 次のように入れて、「作成」を押す

| 欄 | 値 | 理由 |
|---|---|---|
| 名前 | `knowledge-library` | |
| 形式 | Docker | Docker のイメージを置く |
| モード | 標準 | 自分でイメージを送る、普通の置き場 |
| ロケーション タイプ、リージョン | リージョン、`asia-northeast1` | Cloud Run と同じ場所にそろえる |
| 説明 | `Knowledge Library のコンテナイメージ` | |
| 暗号化 | Google が管理する暗号鍵(初めの値のまま) | |
| 不変のイメージタグ | 無効(初めの値のまま) | |
| クリーンアップ ポリシー | 「テストを実行」(初めの値のまま)。ルールは足さない | 古いイメージは手で消す。テストを実行の間は、何も消えない |
| 脆弱性スキャン | 無効 | 有効にすると、イメージごとに料金がかかることがある |

```bash
gcloud artifacts repositories create knowledge-library \
  --repository-format=docker --location=asia-northeast1 \
  --description="Knowledge Library のコンテナイメージ" --project=knowledge-library-prod
```

### 2.3 Rails 専用の身分証(サービスアカウント)を作る

1. 「IAM と管理」の「サービス アカウント」を開き(https://console.cloud.google.com/iam-admin/serviceaccounts?project=knowledge-library-prod)、「サービス アカウントを作成」を押す
2. 3つの段階を、次のように進める

| 段階 | 入れるもの |
|---|---|
| 1. サービス アカウントの詳細 | 名前 `api-runtime`(ID も `api-runtime` になる。ID は後から変えられない)、説明 `Cloud Run で Rails(サービス api)を動かす身分。権限は rails-master-key を読むことだけ。`。「作成して続行」を押す |
| 2. このサービス アカウントにプロジェクトへのアクセスを許可する | **ロールは何も選ばない**。ここで選ぶと、プロジェクト全体への権限になる。鍵を読む権限は、2.7 で鍵1本にだけ付ける。「続行」を押す |
| 3. ユーザーにこのサービス アカウントへのアクセスを許可する | 何も入れない。「完了」を押す |

```bash
gcloud iam service-accounts create api-runtime --display-name=api-runtime \
  --description="Cloud Run で Rails(サービス api)を動かす身分。権限は rails-master-key を読むことだけ。" \
  --project=knowledge-library-prod
```

API を有効にした後、Google が自動で作った既定の身分証 `656607631341-compute@developer.gserviceaccount.com` があり、プロジェクトの「編集者」(`roles/editor`)が付いていた。Cloud Run で身分証を指定しないと、これで動く。#30 では `api-runtime` を指定するので使わず、権限も変えていない。

### 2.4 鍵の金庫(Secret Manager)に master.key を入れる

鍵の値は、この文書にもコマンドの履歴にも残さない。

1. リポジトリの直下で、鍵のファイルの大きさを確かめる。表示されるのは文字数だけで、値は出ない

   ```bash
   wc -c < api/config/master.key
   ```

   `32` なら、末尾に改行がない。`33` なら改行が入っていて、そのまま入れると Rails が「鍵の長さが違う」として起動に失敗するので、改行を取り除いてから入れる。#30 では `32` だった

2. 「Secret Manager」を開き(https://console.cloud.google.com/security/secret-manager?project=knowledge-library-prod)、「シークレットを作成」を押す
3. 次のように入れて、「シークレットを作成」を押す

| 欄 | 値 | 理由 |
|---|---|---|
| 名前 | `rails-master-key` | |
| シークレットの値 | 「ファイルをアップロード」で `api/config/master.key` を選ぶ | 値を貼り付けない。クリップボードに残さないため |
| レプリケーション ポリシー | 「ロケーションを手動で管理する」、`asia-northeast1` だけ | ほかの部品と同じ場所にそろえる |
| 暗号化 | Google が管理する暗号鍵(初めの値のまま) | |
| ローテーション、有効期限、通知、ラベルなど | 設定しない | |

作成した後、「値を表示」は押さない。この画面で権限(アクセス権)も付けない。権限は、2.6 で失敗を確かめた後に付ける。

```bash
gcloud secrets create rails-master-key --replication-policy=user-managed \
  --locations=asia-northeast1 --data-file=api/config/master.key --project=knowledge-library-prod
```

### 2.5 イメージを作って、置き場に送る

コンソールではできないので、手元のターミナルで行う。リポジトリの直下で、同じターミナルで続けて実行する(`TAG` を使うため)。

```bash
# 1. Docker が置き場に送るとき、gcloud のログインを使うようにする(1回だけ)
#    ~/.docker/config.json の credHelpers に1行足される。パスワードは書かれない
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# 2. Cloud Run 向け(amd64)のイメージを作る。タグは今のコミットの短い ID
#    Mac は arm64 なので、amd64 を真似して作る。時間がかかる
TAG=$(git rev-parse --short HEAD)
docker build --platform linux/amd64 \
  -t asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:$TAG api

# 3. 置き場に送る。最後に digest: sha256:… と出れば成功
docker push asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:$TAG
```

#30 では、タグは `cc1e273`。イメージの大きさは、手元で 492MB、置き場では圧縮されて約 192MB だった。

### 2.6 権限を付けずにデプロイし、失敗することを確かめる

`api-runtime` に鍵を読む権限が**ない**状態でデプロイし、Cloud Run がその版を起動しないことを確かめる(仕様書の AC-4)。

1. 「Cloud Run」を開き(https://console.cloud.google.com/run?project=knowledge-library-prod)、「サービスを作成」(または「コンテナをデプロイ」の「サービス」)を押す
2. 次のように入れて、「作成」を押す

| 欄 | 値 | 理由 |
|---|---|---|
| デプロイの方法 | 既存のコンテナ イメージから 1 つのリビジョンをデプロイする | |
| コンテナ イメージの URL | 「選択」で Artifact Registry の `knowledge-library`、`api`、`cc1e273` | 2.5 で送ったイメージ |
| サービス名、リージョン | `api`、`asia-northeast1` | |
| 認証 | 公開アクセスを許可する | ブラウザから呼べるようにする |
| 課金 | リクエスト ベース | リクエストを処理している間だけ CPU を使い、課金する |
| サービスのスケーリング | 自動、最小 `0`、最大 `1` | 使わない間は 0 台。想定外に増えないよう最大 1 台。2.8 も見る |
| 上り(内向き)トラフィック | すべて | |
| コンテナ、ボリューム、ネットワーキング、セキュリティ → コンテナ | ポート `8080`、メモリ 512 MiB、CPU 1(どれも初めの値のまま) | Rails は `PORT` の値で待ち受ける |
| 同 → 変数とシークレット →「シークレットを参照」 | 名前 `RAILS_MASTER_KEY`、シークレット `rails-master-key`、環境変数として公開、バージョン `1` | 版は番号で指定する(`latest` にしない) |
| 同 → セキュリティ → サービス アカウント | `api-runtime` | 変えないと、既定の身分証(編集者)で動く |

シークレットを選んだときに「付与」のボタンが出ても、**押さない**。押すと権限が付き、失敗を確かめられなくなる。

起きたこと:

- 「サービスの作成」は完了し、URL も決まった。「リビジョンの作成」は失敗し、「トラフィックのルーティング」はキャンセルされた
- 版 `api-00001-w5t` は起動せず、状態は `SecretsAccessCheckFailed` だった
- 画面に出たエラー

  ```
  spec.template.spec.containers[0].env[0].value_from.secret_key_ref.name: Permission denied on secret:
  projects/656607631341/secrets/rails-master-key/versions/1 for Revision service account
  api-runtime@knowledge-library-prod.iam.gserviceaccount.com. The service account used must be granted
  the 'Secret Manager Secret Accessor' role (roles/secretmanager.secretAccessor) at the secret, project
  or higher level.
  ```

同じことをするコマンド(2.7 の権限を付けた後なら成功する):

```bash
gcloud run deploy api \
  --image=asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:cc1e273 \
  --region=asia-northeast1 --project=knowledge-library-prod \
  --service-account=api-runtime@knowledge-library-prod.iam.gserviceaccount.com \
  --set-secrets=RAILS_MASTER_KEY=rails-master-key:1 \
  --no-invoker-iam-check --cpu-throttling --min=0 --max=1
```

### 2.7 鍵1本にだけ読む権限を付けて、デプロイし直す

権限は、プロジェクトの「IAM」の画面では付けない。そこで付けると、プロジェクトのすべての鍵が読めるようになる。

1. 「Secret Manager」で `rails-master-key` を選び、「権限」の欄で「プリンシパルを追加」を押す
2. 新しいプリンシパルに `api-runtime@knowledge-library-prod.iam.gserviceaccount.com`、ロールに「Secret Manager のシークレット アクセサー」を選び、「保存」を押す
3. 「Cloud Run」で `api` を開き、右上の「再デプロイ」を押す。「新しいリビジョンのデプロイ」の画面で、「このリビジョンをすぐに利用する」にチェックが入ったまま、「新しいリビジョンをデプロイ」を押す。「サービス構成は変更されていません」と出るが、そのままでよい

起きたこと:版 `api-00002-lfr` が起動し、リクエストの 100% が届くようになった。失敗した `api-00001-w5t` は Retired(引退)になった。リクエストが届かないので、料金はかからない。

```bash
gcloud secrets add-iam-policy-binding rails-master-key \
  --member=serviceAccount:api-runtime@knowledge-library-prod.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor --project=knowledge-library-prod
```

### 2.8 インスタンスの最大数を 1 にする

2.6 で最大 `1` を入れるつもりだったが、作成した後に確かめると `20`(Cloud Run の既定値)のままだった。

1. 「Cloud Run」で `api` を開き、「スケーリング」タブで、インスタンスの最大数を `1` にする
2. 「差分を表示して再デプロイ」を押し、変わるのが最大数だけであることを確かめて、再デプロイする

最大数には、サービス全体の値と、版ごとの値がある。この画面で変わるのはサービス全体の値で、新しい版は作られず、すぐに効く。版ごとの値は `20` のまま残るが、効くのは2つのうち小さいほう(Cloud Run の文書「[最大インスタンス数](https://docs.cloud.google.com/run/docs/configuring/max-instances)」)なので、`1` が効く。

```bash
gcloud run services update api --max=1 --region=asia-northeast1 --project=knowledge-library-prod
```

### 2.9 確かめる

読み取りだけのコマンドで確かめる。

```bash
P=knowledge-library-prod; R=asia-northeast1

# /up が 200 を返す(AC-1)
curl -s -o /dev/null -w "%{http_code}\n" https://api-656607631341.asia-northeast1.run.app/up

# api-runtime で動き、鍵は rails-master-key の版 1 から受け取る。値は設定に入っていない(AC-2、AC-3)
gcloud run services describe api --region=$R --project=$P \
  --format="yaml(spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env)"

# api-runtime の権限は、rails-master-key を読むことだけ(AC-2)
gcloud secrets get-iam-policy rails-master-key --project=$P
gcloud projects get-iam-policy $P --flatten="bindings[].members" \
  --filter="bindings.members:api-runtime@" --format="value(bindings.role)"   # 何も出ない

# 失敗した版と、動いている版(AC-4)
gcloud run revisions list --service=api --region=$R --project=$P

# サービス全体の最大数が 1
gcloud run services describe api --region=$R --project=$P \
  --format="value(metadata.annotations.'run.googleapis.com/maxScale')"
```

2026-11-11 の結果:

| 確かめたこと | 結果 |
|---|---|
| `/up` | 200 |
| 身分証 | `api-runtime@knowledge-library-prod.iam.gserviceaccount.com` |
| `RAILS_MASTER_KEY` | `secretKeyRef`(名前 `rails-master-key`、版 `1`)。値はない |
| 鍵の権限 | `api-runtime` に `roles/secretmanager.secretAccessor` だけ |
| プロジェクトの権限 | `api-runtime` には何もない |
| 版 | `api-00002-lfr` の ACTIVE が `yes`。`api-00001-w5t` の ACTIVE は空(状態は Retired) |
| 最大数 | `1` |

### 2.10 注意点

- **公開の方式**:「公開アクセスを許可する」は、`allUsers` に「Cloud Run 起動元」の権限を付ける方式ではなく、「呼び出す人の権限を確かめない」方式(サービスの設定 `run.googleapis.com/invoker-iam-disabled: 'true'`)になった。そのため、`gcloud run services get-iam-policy api` には何も出ない
- **URL は2つある**:`https://api-656607631341.asia-northeast1.run.app`(コンソールに出る形)と `https://api-b2zngpwzdq-an.a.run.app`(古い形)。どちらでも同じサービスに届く。URL はサービスを作ったときに決まり、動いている版がない間は、開いてもエラーになる
- **イメージは指紋で記録される**:タグ `cc1e273` を選んでも、Cloud Run の設定には `api@sha256:64e3…` のように、イメージの指紋(digest)で記録された。あとで同じタグに別のイメージを上書きしても、動いている版は変わらない
- **タグとコードを合わせる**:タグはコミットの ID なので、コミットしていない変更があるままビルドすると、タグとイメージの中身が食い違う。ビルドの前に `git status` で、変更がないことを確かめる
- **置き場の無料枠は 0.5GB**:イメージ1つで約 192MB なので、置けるのは2つほど。新しいイメージを送ったら、動いていない古いイメージは手で消す(クリーンアップ ポリシーは「テストを実行」で、自動では消えない)
- **最大数は作成の後に確かめる**:2.8 のとおり、作成の画面で入れたつもりでも、既定の `20` が残ることがある
- **鍵を変えたら、デプロイし直す**:鍵は版の番号(`1`)で渡しているので、新しい版を作っても、デプロイし直すまで Rails は古い値を使う
- **DB はまだない**:`/up` 以外のパスはエラーになる。マイグレーションをどこで流すかは #31 で決める(起動時の `rails db:prepare` は `api/bin/docker-entrypoint` から外した)。→ #31 で DB を繋いだ(3 章)

## 3. Cloud SQL(#31)

作業した日:2026-11-11〜2026-11-13

本番の DB(Cloud SQL for PostgreSQL)を作り、Cloud Run の Rails から繋いで、`GET /api/articles` が 200 を返すところまでを手で通す。仕様は [docs/specs/031-cloud-sql.md](specs/031-cloud-sql.md)、仕組みの図は [docs/notes/031-cloud-sql-connection.html](notes/031-cloud-sql-connection.html)。表をジョブで作る理由は [ADR 0006](adr/0006-run-migrations-with-cloud-run-jobs.md)、使わない期間の扱いは [ADR 0007](adr/0007-cloud-sql-idle-periods.md)。

#31 では、Cloud SQL の30日間の無料お試しで DB を作った。お試しが切れる前に、お試しの DB を削除し、小さい DB を作り直す(3.12)。この章は、そのときの作り直しの手順書も兼ねる。

2 章と同じく、各節の最後に、同じことをする gcloud のコマンドを添える。#31 では、3.7 のコマンド以外は実行していない。

### 3.1 API を有効にする

1. 「API とサービス」の「ライブラリ」を開き(https://console.cloud.google.com/apis/library?project=knowledge-library-prod)、画面の上が `knowledge-library-prod` であることを確かめる
2. `Cloud SQL Admin` で検索し、「Cloud SQL Admin API」を開いて「有効にする」を押す

似た名前の「Cloud SQL」(`sql-component.googleapis.com`)は、#29 で Firebase を追加したときに有効になっている。今回有効にするのは、「Admin」が付いている方。

```bash
gcloud services enable sqladmin.googleapis.com --project=knowledge-library-prod
```

### 3.2 インスタンス `db` を無料お試しで作る

1. 「Cloud SQL」を開き(https://console.cloud.google.com/sql/instances?project=knowledge-library-prod)、「インスタンスを作成」を押す
2. 「Cloud SQL を 30 日間無料でお試しください」という案内の画面が出る。上のフォームに、次のように入れる

| 項目 | 値 | 理由 |
|---|---|---|
| データベース エンジン | PostgreSQL(初めは MySQL) | ローカルと同じ DB |
| インスタンス ID | `db`(初めは `free-trial-first-project`) | 作り直すときも同じ名前にして、Cloud Run の接続先を変えずに済ませる。後から変えられない |
| パスワード | 「生成」を押す。どこにも控えない | 管理用の利用者 `postgres` のもので、Rails は使わない。必要になったら、コンソールで設定し直せる |
| リージョン | `asia-northeast1`(初めは `us-east1`) | ほかの部品と同じ場所。後から変えられない |

3. 右の「含まれるもの」の欄で、版を確かめる。フォームには版を選ぶ欄がない。#31 では「PostgreSQL 18」だった
4. 「無料インスタンスを作成」を押す。作成には数分かかる(#31 では、22:18 に作成を始め、22:22 に完了の通知が出た)
5. 作成日を1日目として、29日目の予定をカレンダーに入れる(#31 では 2026-12-09。お試しが切れるのは 2026-12-11)

作った結果(お試しで決まった値):

| 項目 | 値 |
|---|---|
| 接続名 | `knowledge-library-prod:asia-northeast1:db` |
| 版 | PostgreSQL 18(`POSTGRES_18_6`)。ローカルの `compose.yaml` は 17 |
| エディション、マシン | Enterprise Plus、8 vCPU(`db-perf-optimized-N-8`)、データ キャッシュあり |
| ゾーン | 単一ゾーン(`asia-northeast1-b`)。高可用性なし |
| ストレージ | SSD 100GB、自動増加なし |
| 公開 IP | あり |
| 承認済みネットワーク | 空 |
| 内部 IP | なし |
| 自動バックアップ | なし(お試しでは選べない) |
| 削除からの保護 | 作成直後は無効。3.3 で有効にする |

お試しは1つのプロジェクトで1回だけなので、gcloud のコマンドは載せない。お試しの後に作る小さい DB のコマンドは、3.12 にある。

### 3.3 削除からの保護を有効にする

誤操作で DB を消さないための安全装置。有効の間は、削除の頼みを Cloud SQL が断る。権限ではないので、DB を変更できる人は、保護を外してから削除できる。

1. インスタンス `db` を開き、上の「編集」を押す
2. 「データ保護」の中で、「インスタンスの削除を防止する」にだけチェックを入れる。「インスタンスの削除後もバックアップを保持する」と「インスタンス削除時の最終バックアップ」には入れない(ADR 0007)。お試しでは、バックアップの欄は灰色で選べない
3. 画面のいちばん下の「保存」を押す。再起動はされない

```bash
gcloud sql instances patch db --deletion-protection --project=knowledge-library-prod
```

### 3.4 データベース `api_production` を作る

データベースはコンソールで作り、ジョブでは `rails db:migrate` だけを流す。データベースを作る権限を、Rails に持たせないため(仕様書 031)。

1. インスタンス `db` の左のメニューの「データベース」を押し、「データベースを作成」を押す
2. 名前に `api_production` と入れる。文字セットなどは初めの値のまま(UTF8)
3. 「作成」を押す

```bash
gcloud sql databases create api_production --instance=db --project=knowledge-library-prod
```

### 3.5 パスワードを作り、利用者 `api` と金庫 `db-password` に入れる

パスワードは、利用者の設定と金庫(Secret Manager)の2か所に、同じ値で入れる。値はオーナーの Mac のターミナルだけで扱い、この文書にも、Claude との会話にも出さない。

1. オーナーが自分で開いたターミナルで、パスワードを作ってファイルに入れる

   ```bash
   # この後に作るファイルを、自分だけが読めるようにする(このターミナルの中だけで効く)
   umask 077
   # 48文字のランダムなパスワードを作り、ファイルに入れる。画面には出さない
   # 英小文字と数字だけにして、記号で困らないようにする。末尾の改行は取り除く
   openssl rand -hex 24 | tr -d '\n' > ~/db-password.txt
   # 文字数だけを確かめる。48 と出れば正しい(値は出ない)
   wc -c < ~/db-password.txt
   # 中身をクリップボードに入れる(2 で貼り付けるため)
   pbcopy < ~/db-password.txt
   ```

   末尾の改行を取り除くのは、金庫に「パスワード+改行」が入り、利用者の設定の値と食い違うのを防ぐため(2.4 の master.key と同じ理由)

2. インスタンス `db` の左のメニューの「ユーザー」を押し、「ユーザー アカウントを追加」を押す。「組み込み認証」を選び(「Cloud IAM」は選ばない)、ユーザー名に `api` と入れ、パスワードの欄に Command + V で貼り付けて、「追加」を押す。「パスワードを表示」は押さない
3. 「Secret Manager」を開き(https://console.cloud.google.com/security/secret-manager?project=knowledge-library-prod)、「シークレットを作成」を押す。次のように入れて、「シークレットを作成」を押す

| 欄 | 値 |
|---|---|
| 名前 | `db-password` |
| シークレットの値 | 「ファイルをアップロード」で `~/db-password.txt` を選ぶ(見つからなければ、ファイルを選ぶ画面で Command + Shift + G を押し、`~/db-password.txt` と入れる) |
| レプリケーション ポリシー | 「ロケーションを手動で管理する」、`asia-northeast1` だけ |
| 暗号化 | Google が管理する暗号鍵(初めの値のまま) |
| ローテーション、有効期限、通知、ラベルなど | 設定しない |

4. 1 と同じターミナルで、ファイルとクリップボードを消す

   ```bash
   /bin/rm ~/db-password.txt
   ls ~/db-password.txt     # 「No such file or directory」と出れば消えている
   pbcopy < /dev/null
   ```

パスワードが合っているかは、この時点では分からない。3.8 のジョブが DB に繋げたときに分かる。合わなければ、1〜4 をやり直して新しいパスワードにする。

```bash
# 2 と 3。値を直接書かず、ファイルから読ませる(履歴には $(cat …) の文字だけが残る)
gcloud sql users create api --instance=db --password="$(cat ~/db-password.txt)" --project=knowledge-library-prod
gcloud secrets create db-password --replication-policy=user-managed \
  --locations=asia-northeast1 --data-file=$HOME/db-password.txt --project=knowledge-library-prod
```

### 3.6 Rails 専用の身分証に、2つの権限を足す

`api-runtime` に、「`db-password` を読む」権限と「Cloud SQL に繋ぐ」権限を足す。付ける場所が、それぞれ違う。

**`db-password` を読む権限(鍵1本にだけ付ける)**

1. 「Secret Manager」で `db-password` を開き、「権限」タブを開く
2. 「アクセスを許可」を押す。新しいプリンシパルに `api-runtime@knowledge-library-prod.iam.gserviceaccount.com`、ロールに「Secret Manager のシークレット アクセサー」を選び、「保存」を押す

一覧には、プロジェクトの既定の身分証(編集者)とオーナーの行も出るが、「継承」の欄にあるとおり、プロジェクト全体に付いている役割が表示されているだけ。既定の身分証の「編集者」には、シークレットの値を読む権限は含まれない。

**Cloud SQL に繋ぐ権限(プロジェクトに付ける)**

Cloud SQL には、インスタンス1つにだけ権限を付ける画面がないので、プロジェクトの「IAM」の画面で付ける(仕様書 031)。

1. 「IAM と管理」の「IAM」を開き(https://console.cloud.google.com/iam-admin/iam?project=knowledge-library-prod)、「アクセス権を付与」を押す
2. 新しいプリンシパルに `api-runtime@knowledge-library-prod.iam.gserviceaccount.com`、ロールに「Cloud SQL クライアント」を選ぶ。似た名前の「Cloud SQL 管理者」「Cloud SQL 編集者」は選ばない(DB を消したり、設定を変えたりできてしまう)
3. 条件は付けずに、「保存」を押す

```bash
gcloud secrets add-iam-policy-binding db-password \
  --member=serviceAccount:api-runtime@knowledge-library-prod.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor --project=knowledge-library-prod
gcloud projects add-iam-policy-binding knowledge-library-prod \
  --member=serviceAccount:api-runtime@knowledge-library-prod.iam.gserviceaccount.com \
  --role=roles/cloudsql.client --condition=None
```

### 3.7 イメージを作り直して、置き場に送る

`api/config/database.yml` の本番の設定を、開発と同じ環境変数(`DB_USERNAME`、`DB_PASSWORD`)で受け取るように変えたので、イメージを作り直す。手順は 2.5 と同じ。`gcloud auth configure-docker` は済んでいるので要らない。

ビルドの前に `git status` で、コミットしていない変更がないことを確かめる。#31 では、タグは `fcf8acc`、置き場では約 192MB、digest は `sha256:80e01bc5…` だった。

### 3.8 表を作るジョブ `migrate` を作って、実行する

ジョブは、サービス `api` と同じイメージ・身分証・設定で Rails を起動し、`rails db:migrate` だけを実行して終わる(ADR 0006)。

1. 「Cloud Run」の「ジョブ」を開き(https://console.cloud.google.com/run/jobs?project=knowledge-library-prod)、「ジョブを作成」を押す
2. 次のように入れて、「作成」を押す

| 画面の場所 | 項目 | 値 | 理由 |
|---|---|---|---|
| 上 | コンテナ イメージの URL | 「選択」で `knowledge-library` → `api` → `fcf8acc` | 3.7 で送ったイメージ |
| 上 | ジョブ名、リージョン | `migrate`、`asia-northeast1` | |
| 上 | タスク数 | `1` | 1回だけ流す |
| コンテナ | コンテナのコマンド | 空のまま | イメージの起動の仕組み(`bin/docker-entrypoint`)を、サービスと同じに保つ |
| コンテナ | コンテナの引数 | `./bin/rails` と `db:migrate` の2つ | イメージの初めの値(`./bin/rails server`)の代わりに、マイグレーションを流す |
| コンテナ | メモリ、CPU | 初めの値のまま(512MiB、1) | |
| 変数とシークレット | 環境変数 | `DB_HOST` = `/cloudsql/knowledge-library-prod:asia-northeast1:db`、`DB_USERNAME` = `api` | |
| 変数とシークレット →「シークレットを参照」 | | `RAILS_MASTER_KEY` ← `rails-master-key` の版 `1`、`DB_PASSWORD` ← `db-password` の版 `1`。どちらも環境変数として公開 | 版は番号で指定する(`latest` にしない) |
| 接続 | Cloud SQL 接続 | 「接続を追加」で `knowledge-library-prod:asia-northeast1:db` | Cloud Run が、コンテナの中に接続口(`/cloudsql/…`)を用意する |
| セキュリティ | サービス アカウント | `api-runtime` | 変えないと、既定の身分証で動き、パスワードを読めずに失敗する |
| 設定 | 再試行の最大回数 | `0` | 失敗したら繰り返さずに止めて、原因を見る |
| 下 | ジョブをすぐに実行する | チェックを入れない | 作成と実行を分けて、それぞれ確かめる |

シークレットを選んだときに「付与」のボタンが出ても、押さない。権限は 3.6 で付けてある。

3. ジョブ `migrate` を開き、「実行」を押す。状態が緑のチェック(成功)になるまで待つ

#31 では、実行 `migrate-tlj8b` が約16秒で成功した。ただ、ログには「Container called exit(0).」の1行しか残らず、表を作ったときに Rails が書き出すはずの行(`== CreateMembers: migrated` など)は見えなかった。表ができたことは、3.9 の後に `/api/articles` が 200 を返したことで確かめた。

```bash
gcloud run jobs create migrate \
  --image=asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:fcf8acc \
  --region=asia-northeast1 --project=knowledge-library-prod \
  --service-account=api-runtime@knowledge-library-prod.iam.gserviceaccount.com \
  --set-cloudsql-instances=knowledge-library-prod:asia-northeast1:db \
  --set-env-vars=DB_HOST=/cloudsql/knowledge-library-prod:asia-northeast1:db,DB_USERNAME=api \
  --set-secrets=RAILS_MASTER_KEY=rails-master-key:1,DB_PASSWORD=db-password:1 \
  --args=./bin/rails,db:migrate --tasks=1 --max-retries=0
gcloud run jobs execute migrate --wait --region=asia-northeast1 --project=knowledge-library-prod
```

### 3.9 サービス `api` に DB の設定を足して、デプロイし直す

イメージも `fcf8acc` に替える。前のイメージ `cc1e273` の `database.yml` は、パスワードを `API_DATABASE_PASSWORD` という別の名前で探すので、設定を足しても DB に繋げない。

サービスの設定は、詳細ページのタブ(コンテナ、ネットワーキング、セキュリティ、スケーリング)で直し、最後にまとめてデプロイする。何も変えずに右上の「再デプロイ」を押すと、「サービス構成は変更されていません」と出て、同じ設定の版を作るだけになる。

1. 「Cloud Run」でサービス `api` を開き、「コンテナ」タブを開く
2. 次のように直す。表にない項目は変えない

| 画面の場所 | 項目 | 値 |
|---|---|---|
| コンテナ設定 | コンテナ イメージの URL | 「選択」で `fcf8acc` |
| 変数とシークレット →「変数を追加」 | 環境変数 | `DB_HOST` = `/cloudsql/knowledge-library-prod:asia-northeast1:db`、`DB_USERNAME` = `api` |
| 環境変数として公開されるシークレット | | `DB_PASSWORD` ← `db-password` の版 `1` |
| 同上 | `RAILS_MASTER_KEY` | 変えない |
| 「コンテナ」タブの下の方 | Cloud SQL 接続 | 「接続を追加」で `knowledge-library-prod:asia-northeast1:db` |

ネットワーキングタブには、Cloud SQL 接続の欄はない。直している間、タブの名前は「コンテナ \*」になり、右上のボタンは「差分を表示して再デプロイ」に変わる。

3. 「差分を表示して再デプロイ」を押し、変わるのが表の4点(イメージ、環境変数2つ、シークレット1つ、Cloud SQL 接続)だけであることを確かめて、デプロイする

#31 では、版 `api-00003-w6j` が起動し、リクエストの 100% が届くようになった。

```bash
gcloud run deploy api \
  --image=asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:fcf8acc \
  --region=asia-northeast1 --project=knowledge-library-prod \
  --add-cloudsql-instances=knowledge-library-prod:asia-northeast1:db \
  --update-env-vars=DB_HOST=/cloudsql/knowledge-library-prod:asia-northeast1:db,DB_USERNAME=api \
  --update-secrets=DB_PASSWORD=db-password:1
```

### 3.10 DB を止めて確かめ、動かし直す

DB を止めたときに、DB を使わない `/up` は動き続け、DB を使う `/api/articles` だけがエラーになることを確かめる(仕様書の AC-6)。ADR 0007 で、予算アラートが来たときの応急処置として「止める」を使うため。

1. 「Cloud SQL」でインスタンス `db` を開き、「停止」を押す。状態が停止になるまで待つ
2. 3.11 の curl で、`/up` が 200、`/api/articles` が 500 であることを確かめる
3. 「開始」を押し、状態が実行中に戻るまで待つ
4. もう一度 curl で、`/api/articles` が 200 に戻ったことを確かめる。Rails を作り直さなくても、Rails が自分で DB に繋ぎ直す

止めている間、Cloud Run のログには次の行が出る。Cloud Run の接続口が、止まっている DB への通り道を開けなかったという記録。

```
Cloud SQL connection failed. ... fetch ephemeral cert failed: refresh err
```

#31 で、お試しの DB も止められることを確かめた。

```bash
gcloud sql instances patch db --activation-policy=NEVER --project=knowledge-library-prod   # 止める
gcloud sql instances patch db --activation-policy=ALWAYS --project=knowledge-library-prod  # 動かす
```

### 3.11 確かめる

読み取りだけのコマンドで確かめる。

```bash
P=knowledge-library-prod; R=asia-northeast1
U=https://api-656607631341.asia-northeast1.run.app

# 記事の一覧が 200 と {"articles":[...]} を返す。/up も 200(AC-1、AC-6)
curl -s -w "\n%{http_code}\n" $U/api/articles
curl -s -o /dev/null -w "%{http_code}\n" $U/up

# インスタンスの設定。承認済みネットワーク(authorizedNetworks)が出なければ空(AC-2)
gcloud sql instances describe db --project=$P \
  --format="yaml(state,databaseVersion,settings.edition,settings.tier,settings.dataDiskSizeGb,settings.ipConfiguration.ipv4Enabled,settings.ipConfiguration.authorizedNetworks,settings.backupConfiguration.enabled,settings.deletionProtectionEnabled,settings.activationPolicy)"

# データベースと利用者
gcloud sql databases list --instance=db --project=$P --format="value(name)"
gcloud sql users list --instance=db --project=$P --format="value(name)"

# サービスの設定。DB_PASSWORD は値ではなく、db-password の版 1 への参照(AC-3)
gcloud run services describe api --region=$R --project=$P \
  --format="yaml(spec.template.metadata.annotations.'run.googleapis.com/cloudsql-instances',spec.template.spec.containers[0].image,spec.template.spec.containers[0].env)"

# api-runtime の権限は、鍵2本を読むことと、Cloud SQL クライアントだけ(AC-4)
gcloud secrets get-iam-policy db-password --project=$P
gcloud secrets get-iam-policy rails-master-key --project=$P
gcloud projects get-iam-policy $P --flatten="bindings[].members" \
  --filter="bindings.members:api-runtime@" --format="value(bindings.role)"

# ジョブの実行の結果(AC-5)
gcloud run jobs executions list --job=migrate --region=$R --project=$P
```

2026-11-13 の結果:

| 確かめたこと | 結果 |
|---|---|
| `/api/articles` | 200、`{"articles":[]}`(記事はまだ入れていない) |
| `/up` | 200 |
| DB を止めている間 | `/api/articles` は 500、`/up` は 200 |
| DB を動かし直した後 | `/api/articles` は 200 |
| インスタンス | `RUNNABLE`、PostgreSQL 18、Enterprise Plus、SSD 100GB、公開 IP あり、承認済みネットワークなし、自動バックアップなし、削除からの保護あり |
| データベース、利用者 | `api_production` と `api`(ほかに Cloud SQL が作った `postgres`) |
| サービスの設定 | イメージ `fcf8acc`、Cloud SQL 接続 `db`、`DB_HOST`、`DB_USERNAME`、`DB_PASSWORD` は `db-password` の版 `1` への参照 |
| 権限 | `db-password` と `rails-master-key` を読めるのは `api-runtime` だけ。プロジェクトで `api-runtime` が持つのは `roles/cloudsql.client` だけ |
| ジョブ | 実行 `migrate-tlj8b` が成功(1 / 1) |

### 3.12 お試しが切れる前に、小さい DB に作り直す

お試しを有料に切り替えると、ストレージ 100GB を減らせず、月約3,300円かかって予算を超える。そのため、お試しの DB を削除して、小さい DB を作り直す(仕様書 031、ADR 0007)。作り直しの間(1時間ほど)は、本番の API が止まり、DB のデータは消える。1か月以上使わない見込みで DB を削除した後に、使い直すときも、この手順で作る。

**この節は、#31 の時点ではまだ行っていない**。小さい DB の画面の項目は、Google の文書から書いたもの。初めて行ったときに、実際の画面の名前と結果に直す。

1. インスタンス `db` を開き、「編集」の「データ保護」で、「インスタンスの削除を防止する」のチェックを外して保存する
2. 「削除」を押し、インスタンス ID `db` を入れて削除する。最終バックアップは取らない
3. 「インスタンスを作成」を押す。お試しの案内が出ても「無料インスタンスを作成」は押さず、PostgreSQL を選んで、次のように入れる

| 見出し | 項目 | 値 | 理由 |
|---|---|---|---|
| エディション | エディション | Enterprise | 初めの値は Enterprise Plus。共有コアのマシンを選べるのは Enterprise だけ |
| インスタンスの情報 | データベースのバージョン | PostgreSQL 17 | ローカルと同じ版。後から変えられない |
| インスタンスの情報 | インスタンス ID | `db` | 同じ名前にすると、接続名が変わらず、Cloud Run の接続先を変えなくてよい |
| インスタンスの情報 | パスワード(`postgres`) | 「生成」を押す。どこにも控えない | |
| リージョンとゾーン | リージョン、ゾーンの可用性 | `asia-northeast1`、シングルゾーン | 高可用性は料金が約2倍になる |
| マシンの構成 | マシンタイプ | 共有コア、1 vCPU・0.614 GB(`db-f1-micro`) | 一番小さいマシン |
| ストレージ | 種類、容量、自動増量 | SSD、10 GB、自動増量なし | 後から HDD には変えられない。思わぬ費用を防ぐ |
| 接続 | プライベート IP、パブリック IP | プライベート IP は選ばない。パブリック IP は選ぶ | |
| 接続 | 承認済みネットワーク | 何も足さない | |
| データ保護 | 自動バックアップ | 有効、7個まで保持 | |
| データ保護 | ポイントインタイム リカバリ | 使わない | 変更の記録を保存する分の料金がかかる |
| データ保護 | 削除からの保護 | 有効 | |
| データ保護 | 削除後もバックアップを保持 | 有効にしない | ADR 0007 |

4. 作成を押す前に、画面に出る月額の見積もりを確かめる(ADR 0007 の見積もりは、月約1,900円)
5. 3.4 でデータベース `api_production` を作る
6. 3.5 で新しいパスワードを作り、利用者 `api` を作る。金庫は作り直さず、`db-password` を開いて「新しいバージョン」を押し、ファイルをアップロードして版 `2` を足す
7. ジョブ `migrate` とサービス `api` の、`DB_PASSWORD` の版を `2` に変える。ジョブを先に実行して表を作り、その後にサービスをデプロイする
8. 3.11 で確かめる。版 `1` は、「無効にする」で使えなくしておく

```bash
# 3 にあたるコマンド。#31 の時点では実行していない下書き
# ポイントインタイム リカバリは、--enable-point-in-time-recovery を付けなければ使わない
gcloud sql instances create db --project=knowledge-library-prod \
  --region=asia-northeast1 --database-version=POSTGRES_17 --edition=ENTERPRISE \
  --tier=db-f1-micro --availability-type=ZONAL \
  --storage-type=SSD --storage-size=10 --no-storage-auto-increase \
  --backup --retained-backups-count=7 --deletion-protection
```

作った後に、3.11 の `describe` で `pointInTimeRecoveryEnabled` が `false` であることを確かめる。

### 3.13 注意点

- **料金**:お試しの間は、DB の料金はかからない。30日たっても自動で有料にはならず、DB が止まるだけで、データは90日残る。お試しは、有料に切り替えない(3.12)
- **版の違い**:本番は PostgreSQL 18、ローカルは 17。このアプリは普通の列と外部キーしか使わないので、版の違いの影響を受けない見込み。3.12 で 17 に作り直せば、そろう
- **暗号化しない接続も受け付ける設定**:お試しの DB は `sslMode: ALLOW_UNENCRYPTED_AND_ENCRYPTED` になっている。承認済みネットワークが空なので、直接繋ぐ道はなく、Rails は Cloud Run の接続口を通るので、通信は暗号化される。変えていない
- **ジョブの出力がログに残らない**:3.8 のとおり、`db:migrate` の出力はログに見えなかった。ジョブが成功しても、表ができたかは `/api/articles` で確かめる
- **サービスとジョブは、同じイメージで動かす**:イメージを作り直したら、ジョブとサービスの両方を新しいイメージに替える。`database.yml` が違うイメージでは、同じ環境変数を渡しても DB に繋げないことがある
- **古いイメージを消す**:置き場の無料枠は 0.5GB。サービスとジョブが `fcf8acc` を使うようになったので、`cc1e273` は使われていない。「Artifact Registry」の `knowledge-library` → `api` で、タグ `cc1e273` のイメージを選んで削除する。#31 では 2026-11-13 に消し、`fcf8acc` だけが残った
- **パスワードを変えたら、ジョブとサービスの版の番号を変える**:2.10 の鍵と同じく、新しい版を足しても、版の番号を変えてデプロイし直すまで、Rails は古いパスワードを使う

## 4. Firebase Hosting(#32)

作業した日:2026-11-16

Vue を Firebase Hosting から配り、本番でログイン → 記事の投稿 → 一覧の表示が通るところまでを手で通す。仕様は [docs/specs/032-firebase-hosting.md](specs/032-firebase-hosting.md)、`/api` を Firebase Hosting から転送する理由は [ADR 0008](adr/0008-proxy-api-through-firebase-hosting.md)、仕組みの図は [docs/notes/032-vue-firebase-hosting.html](notes/032-vue-firebase-hosting.html)。Firebase のコンソールと Google Cloud のコンソールの関係は [docs/notes/firebase-and-google-cloud.html](notes/firebase-and-google-cloud.html)。

Firebase Hosting と Firebase Auth の API は、#29 で Firebase のプロジェクトを作ったときに有効になっていた。有効にする作業は要らない。

### 4.1 Firebase Auth で Google ログインを有効にし、ウェブアプリを登録する

Firebase のコンソール(https://console.firebase.google.com/)で、`knowledge-library-prod` を開いて行う。開発用のプロジェクトと取り違えないよう、画面の上のプロジェクト名を確かめる。

1. 「構築」の「Authentication」を開き、「始める」を押す。「ログイン方法」タブで「Google」を選び、有効にして、プロジェクトのサポートメールを選び、保存する
2. 歯車の「プロジェクトの設定」の「マイアプリ」で、ウェブのアイコン(`</>`)を押す。ニックネームに `knowledge-library-web` と入れる。「このアプリの Firebase Hosting も設定します」のチェックは入れない(Firebase Hosting の設定は `firebase.json` で行う)。「アプリを登録」を押す
3. 表示された `firebaseConfig` の値は、4.2 で使う。いつでも「プロジェクトの設定」の「マイアプリ」で見直せる
4. 「Authentication」の「設定」タブの「承認済みドメイン」に、`localhost`、`knowledge-library-prod.firebaseapp.com`、`knowledge-library-prod.web.app` の3つがあることを確かめる。足すものはない

確かめるときは、Firebase Management API と Identity Toolkit API を、オーナーのアカウントで読む。設定値(API キーなど)は表示しない。

```bash
P=knowledge-library-prod; T=$(gcloud auth print-access-token)
H=(-H "Authorization: Bearer $T" -H "x-goog-user-project: $P")
# ウェブアプリの名前と状態(knowledge-library-web ACTIVE)
curl -s "${H[@]}" "https://firebase.googleapis.com/v1beta1/projects/$P/webApps" \
  | python3 -c "import json,sys;[print(a['displayName'],a['state']) for a in json.load(sys.stdin)['apps']]"
# ログインの方法(google.com enabled= True)
curl -s "${H[@]}" "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/defaultSupportedIdpConfigs" \
  | python3 -c "import json,sys;[print(c['name'].split('/')[-1],'enabled=',c.get('enabled')) for c in json.load(sys.stdin)['defaultSupportedIdpConfigs']]"
# 承認済みドメイン
curl -s "${H[@]}" "https://identitytoolkit.googleapis.com/admin/v2/projects/$P/config" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['authorizedDomains'])"
```

### 4.2 設定値を `web/.env.production.local` に書く

オーナーが、`web/` の中に `.env.production.local` を作り、4.1 の `firebaseConfig` の値を書く。値は引用符で囲まない。このファイルは `web/.gitignore` の `*.local` でコミットされず、Claude は読まない。

```
VITE_FIREBASE_PROJECT_ID=      # projectId(knowledge-library-prod)
VITE_FIREBASE_API_KEY=         # apiKey
VITE_FIREBASE_AUTH_DOMAIN=     # authDomain(knowledge-library-prod.firebaseapp.com)
VITE_FIREBASE_APP_ID=          # appId
```

コメントの部分は書かない。Vite は、本番のビルド(`vite build`)のときだけ、このファイルを読む。開発用の値は、リポジトリの直下の `.env` にあり、`compose.yaml` を通って `web` のコンテナに渡る。この2つは別のファイルで、互いに影響しない。

### 4.3 イメージを作り直し、ジョブとサービスを新しいイメージに替える

#40 で puma を 8.0.3 に上げた分を、本番に入れる。Rails のデプロイは 4.4 の `FIREBASE_PROJECT_ID` と一緒に行う。

1. 3.7 と同じ手順で、イメージを作って push する。#32 では、タグは `4f5855b`、digest は `sha256:668f1626…` だった
2. 「Cloud Run」の「ジョブ」で `migrate` を開き、「編集」で、コンテナ イメージの URL を `4f5855b` に替えて保存し、「実行」する。新しいマイグレーションはないので、表は変わらない。デプロイの順番(ジョブ → サービス)を守り、ジョブとサービスのイメージをそろえるために行う(ADR 0006)。#32 では、実行 `migrate-zncr6` が成功した
3. サービス `api` は、4.4 でイメージを替える
4. 4.4 の後、使われなくなった古いイメージ `fcf8acc` を、Artifact Registry から消す(3.13)。#32 では、`4f5855b` だけが残った

### 4.4 Rails に `FIREBASE_PROJECT_ID` を足す

Rails は、ID トークンの `aud` と `iss` が、この値のプロジェクトのものかを確かめる(`api/app/lib/firebase_id_token_verifier.rb`)。値がないと、ID トークンを確かめる処理が例外で止まり、ログインが要る API は 500 を返す。プロジェクト ID は公開の値なので、Secret Manager ではなく、普通の環境変数で渡す。

1. 「Cloud Run」でサービス `api` を開き、「コンテナ」タブを開く
2. コンテナ イメージの URL を `4f5855b` に替え、「変数とシークレット」の「変数を追加」で、`FIREBASE_PROJECT_ID` = `knowledge-library-prod` を足す
3. 「差分を表示して再デプロイ」を押し、変わるのがイメージと `FIREBASE_PROJECT_ID` の2点だけであることを確かめて、デプロイする

#32 では、版 `api-00004-w7p` が起動した。偽の ID トークン(`Authorization: Bearer dummy`)で `POST /api/articles` を送ると、401 が返るようになった(足す前は、確かめる処理が止まるので 500 になる)。

```bash
gcloud run jobs update migrate \
  --image=asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:4f5855b \
  --region=asia-northeast1 --project=knowledge-library-prod
gcloud run jobs execute migrate --wait --region=asia-northeast1 --project=knowledge-library-prod
gcloud run deploy api \
  --image=asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api:4f5855b \
  --update-env-vars=FIREBASE_PROJECT_ID=knowledge-library-prod \
  --region=asia-northeast1 --project=knowledge-library-prod
```

### 4.5 Vue を本番の設定値でビルドする

リポジトリの直下で実行する。

```bash
docker run --rm -v "$PWD/web":/app -w /app node:24.22.0-slim npm run build
```

- `docker compose run web` は使わない。`compose.yaml` が、開発用の Firebase の値を環境変数で渡し、Vite はファイルより環境変数を優先するので、開発用の値が埋め込まれる
- Node のイメージは、`web/Dockerfile.dev` と CI と同じ版にする。`web/node_modules` は Linux のコンテナの中で入れたものなので、Mac の上ではなく、コンテナの中でビルドする
- 出力は `web/dist`。`web/.gitignore` でコミットされない

ビルドした JavaScript に、本番のプロジェクト ID だけが入ったことを確かめる。プロジェクト ID は公開の値。

```bash
grep -o 'knowledge-library-[a-z]*' web/dist/assets/*.js | sort | uniq -c   # knowledge-library-prod だけが出る
```

### 4.6 Firebase Hosting にデプロイする

Firebase CLI は、Mac に入れずに、版を決めて `npx` で動かす。`.firebaserc` は作らず、デプロイ先を毎回 `--project` で書く。

```bash
# 1. ログインする(初回だけ)。ブラウザが開くので、オーナーの Google アカウントを選ぶ
npx --yes firebase-tools@15.34.2 login
# 2. デプロイする。最後に「Deploy complete!」と Hosting URL が出る
npx --yes firebase-tools@15.34.2 deploy --only hosting --project knowledge-library-prod
```

`login` の途中で、次の2つを聞かれた。どちらも `n` にした。

| 質問 | 答え | 理由 |
|---|---|---|
| Enable Gemini in Firebase features? | `n` | 使わない(1.1 と同じ) |
| Allow Firebase to collect CLI and Emulator Suite usage and error reporting information? | `n` | 送らなくても、動きは変わらない |

ログインの情報は、Mac のホームフォルダ(`~/.config/configstore/`)に保存され、リポジトリには入らない。

### 4.7 確かめる

```bash
U=https://knowledge-library-prod.web.app

# 画面(AC-1、AC-2)。どちらも 200 で、同じ index.html が返る
curl -s -o /dev/null -w "%{http_code}\n" $U/
curl -s -o /dev/null -w "%{http_code}\n" $U/articles/new

# API の転送とキャッシュ(AC-3)。200 と {"articles":[...]}。Cache-Control は private、X-Cache は MISS
curl -s -D - $U/api/articles | grep -iE "^HTTP|cache-control|^x-cache|^\{"

# ログインせずに投稿すると 401(AC-5)
curl -s -X POST -H "Content-Type: application/json" -d '{}' -w " %{http_code}\n" $U/api/articles
```

AC-4(ログインして投稿し、一覧に出る)は、オーナーがブラウザで確かめる。

2026-11-16 の結果:

| 確かめたこと | 結果 |
|---|---|
| `/`、`/articles/new` | どちらも 200、`text/html`。ビルドした `index-CdY7-fFQ.js` を読み込む `index.html` |
| `/api/articles` | 200、`{"articles":[]}`(投稿の前)。`Cache-Control: max-age=0, private, must-revalidate`、2回続けても `X-Cache: MISS` |
| ログインせずに `POST /api/articles` | 401、`{"error":"unauthorized"}` |
| ブラウザでログインして投稿 | 投稿でき、一覧に出た(オーナーが確かめた)。投稿の後、`/api/articles` の件数は 2(中身は読んでいない) |

### 4.8 注意点

- **Vue の設定値を変えたら、ビルドからやり直す**:Vue は、Firebase の設定値をビルドのときにファイルへ埋め込む。Rails のように、デプロイし直すだけでは変わらない
- **画面の `index.html` は、ブラウザに1時間キャッシュされる**:Firebase Hosting の初めの値で、`/` のレスポンスに `Cache-Control: max-age=3600` が付いていた。Vue をデプロイし直した直後は、ブラウザによっては、最大1時間、前の画面が出ることがある。困ったら、`firebase.json` に、`index.html` だけキャッシュしない `headers` の設定を足す
- **`/api` のレスポンスの `Vary`**:Firebase Hosting は、転送したレスポンスの `Vary` に、`cookie` と `need-authorization` を足していた。Firebase の文書では「`Authorization` を足す」と説明されている。`private` でキャッシュされないので、どちらでも結論は変わらない
- **`firebase.json` を変えたら、Firebase Hosting をデプロイし直す**:`rewrites` などの設定は、デプロイのときに Firebase Hosting に写される
- **Rails をデプロイし直しても、Firebase Hosting はデプロイし直さなくてよい**:`rewrites` は Cloud Run のサービスを名前で指し、`pinTag` を使っていないので、Cloud Run でいま動いている版に転送される
- **投稿した記事は、DB の作り直しで消える**:3.12 で DB を作り直したら、画面から入れ直す

## 5. 自動デプロイ(#33)

作業した日:2026-11-18〜19

main にマージすると、GitHub Actions が、3 章と 4 章で手で行っていたデプロイ(イメージのビルドと保存、ジョブ `migrate` の実行、サービス `api` の更新、Firebase Hosting へのデプロイ)を、同じ順に実行する。この章は、そのための準備の手順と、前のバージョンに戻す手順を記載する。仕様は [docs/specs/033-auto-deploy.md](specs/033-auto-deploy.md)、Workload Identity 連携と借用を許可する相手の絞り方の判断は [ADR 0009](adr/0009-deploy-with-workload-identity-federation.md)、仕組みの図は [docs/notes/033-auto-deploy.html](notes/033-auto-deploy.html)、OIDC トークンの中身は [docs/notes/033-oidc-token.html](notes/033-oidc-token.html)、IAM ポリシーとサービスアカウントの関係は [docs/notes/033-google-cloud-map.html](notes/033-google-cloud-map.html)。

5.1〜5.3 と 5.5 は Google Cloud のコンソールで、5.4 は GitHub の画面で、オーナーが行う。

### 5.1 Security Token Service API を有効にする

「API とサービス」の「ライブラリ」で「Security Token Service API」を探し、「有効にする」を押す。Workload Identity 連携が、OIDC トークンを連携トークンに交換するときに使用する。#33 では、2026-11-18 に有効にした。

連携トークンを `deployer` のアクセストークンに交換するときに使用する IAM Service Account Credentials API は、すでに有効になっていた。

### 5.2 Workload Identity 連携を設定する

「IAM と管理」の「Workload Identity 連携」で、プールとプロバイダを作成する。

| 項目 | 値 |
|---|---|
| プールの名前 | `github`。説明は「GitHub Actions から本番にデプロイするための外部 ID」 |
| プロバイダの種類 | OpenID Connect(OIDC) |
| プロバイダの名前 | `github-actions` |
| 発行元(URL) | `https://token.actions.githubusercontent.com/`。コンソールが末尾に `/` を付けて保存した |
| オーディエンス | デフォルトのオーディエンス |
| 属性のマッピング | 下の表 |
| 属性の条件 | `assertion.repository_id == "1409915528" && assertion.environment == "production"` |

| Google の属性 | OIDC トークンの項目 |
|---|---|
| `google.subject` | `assertion.sub` |
| `attribute.repository_id` | `assertion.repository_id` |
| `attribute.environment` | `assertion.environment` |
| `attribute.repo_env` | `assertion.repository_id + "_" + assertion.environment` |

`1409915528` は、このリポジトリの ID である。リポジトリの名前は変更でき、削除後に別の人が同じ名前で作成することもできるが、ID は変わらない。`attribute.repo_env` は、5.3 の 2-6 で「リポジトリ ID と Environment の両方が一致するジョブ」を1行で指定するために作った属性である。

### 5.3 サービスアカウント `deployer` を作成し、ロールを付与する

「IAM と管理」の「サービス アカウント」で、`deployer` を作成する。説明は「GitHub Actions が本番にデプロイするときに使う」。鍵は作成しない。

次の 2-1〜2-6 の順に、ロールを付与する。2-1 は作成の画面の「ロールを選択」で、2-2〜2-6 は各リソースの画面の「権限」で、プリンシパルとロールを追加する。

| 順 | リソース | プリンシパル | ロール |
|---|---|---|---|
| 2-1 | プロジェクト `knowledge-library-prod` | `deployer` | Firebase Hosting 管理者(`roles/firebasehosting.admin`) |
| 2-2 | Artifact Registry のリポジトリ `knowledge-library` | `deployer` | Artifact Registry 書き込み(`roles/artifactregistry.writer`) |
| 2-3 | Cloud Run のジョブ `migrate` | `deployer` | Cloud Run デベロッパー(`roles/run.developer`) |
| 2-4 | Cloud Run のサービス `api` | `deployer` | Cloud Run デベロッパー(`roles/run.developer`) |
| 2-5 | サービスアカウント `api-runtime` | `deployer` | サービス アカウント ユーザー(`roles/iam.serviceAccountUser`) |
| 2-6 | サービスアカウント `deployer` | 下の `principalSet` | Workload Identity ユーザー(`roles/iam.workloadIdentityUser`) |
| 2-7 | プロジェクト `knowledge-library-prod` | `deployer` | Service Usage 閲覧者(`roles/serviceusage.serviceUsageViewer`) |

2-6 のプリンシパルには、次の文字列を入力する。このリポジトリの、Environment `production` を宣言したジョブを表す。

```
principalSet://iam.googleapis.com/projects/656607631341/locations/global/workloadIdentityPools/github/attribute.repo_env/1409915528_production
```

2-1 と 2-7 は、プロジェクト全体に付与している。Firebase Hosting のロールはサイトの単位では、Service Usage のロールは API の単位では付与できないためである。

2-7 は、初めての自動デプロイ(2026-11-24)で不足が分かり、追加した(5.6)。Firebase CLI は、デプロイの前に、Firebase Hosting の API が有効かを Service Usage API で確認する。

### 5.4 GitHub の Environment `production` を作成する

GitHub のリポジトリの「Settings」の「Environments」で、「New environment」を押し、`production` を作成する。

1. 「Deployment branches and tags」で「Selected branches and tags」を選び、`main` だけを追加する。main 以外のブランチのジョブは、`production` を宣言できなくなる
2. 「Environment variables」で、4.2 と同じ4つの名前の変数を追加する。値は、オーナーが `web/.env.production.local` から転記する。値はブラウザに配信される公開情報なので、Secrets ではなく Variables に保存する

```
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_APP_ID
```

### 5.5 Artifact Registry にクリーンアップ ポリシーを設定する

「Artifact Registry」で `knowledge-library` を開き、「編集」で、次の2つのポリシーを追加する。マージのたびにイメージ(約 192MB)が1つ増えるため、無料枠(0.5GB)に収める。

| ポリシーの名前 | 種類 | 条件 |
|---|---|---|
| `delete-all` | 削除 | タグの状態:すべて |
| `keep-latest-2` | 保持 | 最新のバージョンを 2 つ保持 |

保持のポリシーは、削除のポリシーより優先される。そのため、最新の2つ以外が削除される。2つ残すのは、現在動作しているイメージと、5.7 で戻すための1つ前のイメージである。

「テストを実行」(削除せずに記録だけを残す)は選ばず、実際に削除する設定にする。削除は定期的に実行されるため、すぐには削除されない。

### 5.6 確認する

読み取りだけのコマンドで確認する。

```bash
P=knowledge-library-prod; D=serviceAccount:deployer@$P.iam.gserviceaccount.com; R=asia-northeast1
F=(--flatten='bindings[].members' --filter="bindings.members=$D" --format='value(bindings.role)')

# プロバイダの発行元、属性のマッピング、属性の条件
gcloud iam workload-identity-pools providers describe github-actions \
  --workload-identity-pool=github --location=global --project=$P
# deployer の権限を借用できる相手(2-6)
gcloud iam service-accounts get-iam-policy deployer@$P.iam.gserviceaccount.com --project=$P
# deployer に、利用者が作成した鍵がない(Listed 0 items.)
gcloud iam service-accounts keys list --iam-account=deployer@$P.iam.gserviceaccount.com --managed-by=user --project=$P
# deployer のロール(2-1〜2-5、2-7)
gcloud projects get-iam-policy $P "${F[@]}"
gcloud artifacts repositories get-iam-policy knowledge-library --location=$R --project=$P "${F[@]}"
gcloud run jobs get-iam-policy migrate --region=$R --project=$P "${F[@]}"
gcloud run services get-iam-policy api --region=$R --project=$P "${F[@]}"
gcloud iam service-accounts get-iam-policy api-runtime@$P.iam.gserviceaccount.com --project=$P "${F[@]}"
# クリーンアップ ポリシー。cleanupPolicyDryRun が出なければ、実際に削除する設定
gcloud artifacts repositories describe knowledge-library --location=$R --project=$P

# Environment production。使用できるブランチ、変数の名前、Secrets の数
G=repos/tomooshima0828/portfolio-rails-vue-firebase-gcp-library
gh api $G/environments/production/deployment-branch-policies --jq '.branch_policies[].name'
gh api $G/environments/production/variables --jq '.variables[].name'
gh api $G/environments/production/secrets --jq '.total_count'
gh api $G/actions/secrets --jq '.total_count'
```

2026-11-20 の結果:

| 確認したこと | 結果 |
|---|---|
| プロバイダ | 5.2 の表のとおり。状態は `ACTIVE` |
| `deployer` の権限を借用できる相手 | 5.3 の `principalSet` だけ(Workload Identity ユーザー) |
| `deployer` の鍵 | 0 個 |
| `deployer` のロール | 5.3 の 2-1〜2-5 のとおり。ほかにはない |
| クリーンアップ ポリシー | `delete-all` と `keep-latest-2`。テストの実行ではない |
| Environment `production` | 使用できるブランチは `main` だけ。変数は4つ。Secrets は、Environment とリポジトリのどちらも 0 個 |
| API | Security Token Service API と IAM Service Account Credentials API が有効 |

2026-11-20 の時点では、2-7 はまだ付与していない。

**初めての自動デプロイ(2026-11-24)**

PR #44 のマージで、実行 `45353708027` が起動した(コミット `590ad7f`)。

1. 1回目の実行は、Firebase Hosting へのデプロイのステップで失敗した。エラーは 403 で、`deployer` に `serviceusage.services.get` の権限がなかった。この時点で、ジョブ `migrate` の実行(`migrate-9bpst`)と、サービス `api` の更新(版 `api-00005-mjn`)は、すでに完了していた
2. オーナーが、`deployer` に 2-7 を付与した
3. GitHub の「Actions」で「Re-run jobs」を押し、2回目の実行が成功した(ジョブの実行 `migrate-rxjlq`、版 `api-00006-l9k`)
4. 再実行でイメージが作り直され、タグ `590ad7f` は新しいイメージに移った。1回目のイメージはタグのないまま残ったため、オーナーが削除した(5.8)

上の確認のコマンドに加えて、次のコマンドで確認した。

```bash
U=https://knowledge-library-prod.web.app
# サービス api の版とイメージ、ジョブ migrate のイメージと実行
gcloud run services describe api --region=$R --project=$P --format='value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)'
gcloud run jobs describe migrate --region=$R --project=$P --format='value(spec.template.spec.template.spec.containers[0].image)'
gcloud run jobs executions list --job=migrate --region=$R --project=$P --limit=3
# 残っているイメージ
gcloud artifacts docker images list $R-docker.pkg.dev/$P/knowledge-library/api --include-tags --project=$P
# 画面、API、ログインせずに投稿すると 401
curl -s -o /dev/null -w "%{http_code}\n" $U/
curl -s -o /dev/null -w "%{http_code}\n" $U/api/articles
curl -s -X POST -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}\n" $U/api/articles
```

2026-11-24 の結果:

| 完了条件 | 確認したこと | 結果 |
|---|---|---|
| AC-1 | Rails のデプロイ | サービス `api`(版 `api-00006-l9k`)とジョブ `migrate` のイメージが、どちらも `590ad7f`。ジョブの実行 `migrate-rxjlq` が成功 |
| AC-1 | Vue のデプロイ | Firebase Hosting の「リリース履歴」に、`deployer` による 2026-11-24 のリリースがある |
| AC-6 | `deployer` のロール | 5.3 の 2-1〜2-7 のとおり。ほかにはない |
| AC-7 | 画面と API | `/` は 200、`/api/articles` は 200、ログインせずに `POST /api/articles` は 401 |
| AC-7 | ログインして投稿する | オーナーがブラウザで投稿し、一覧に表示された |
| - | 残っているイメージ | `4f5855b`(1つ前)と `590ad7f`(今)の2つ |

### 5.7 前のバージョンに戻す

デプロイの後に本番で問題が見つかったときは、次のどちらかで戻す。

**基本:問題の PR を revert する**

1. GitHub で、問題の PR を開き、「Revert」を押す。revert のブランチと PR が作成される
2. revert の PR の CI が成功したら、main にマージする
3. 自動デプロイで、前のコードがデプロイされる

「main の最新のコミットが本番で動作している」という状態が保たれるので、こちらを基本にする。

**急ぐとき:手で、1つ前のイメージに戻す**

Rails は、サービス `api` とジョブ `migrate` のイメージを、1つ前のタグに戻す。ジョブは実行しない。両方を同じイメージにそろえるために、ジョブのイメージも替える(3.13)。

```bash
IMAGE=asia-northeast1-docker.pkg.dev/knowledge-library-prod/knowledge-library/api
# 残っているイメージのタグ(最新の2つ)
gcloud artifacts docker images list $IMAGE --include-tags --project=knowledge-library-prod
# 1つ前のタグに戻す。<前のタグ> は、上の一覧の古い方
gcloud run services update api --image=$IMAGE:<前のタグ> --region=asia-northeast1 --project=knowledge-library-prod
gcloud run jobs update migrate --image=$IMAGE:<前のタグ> --region=asia-northeast1 --project=knowledge-library-prod
```

Vue は、Firebase のコンソールの「Hosting」の「リリース履歴」で、1つ前のリリースを選び、「ロールバック」を押す。

手で戻した後も、main には問題のコードが残っている。次のマージで、そのコードが再びデプロイされるので、続けて revert か修正の PR を作成する。

- **表(DB のスキーマ)は戻らない**:どちらの方法でも、ジョブ `migrate` が変更した表は元に戻らない。マイグレーションを含む PR を戻すときは、前のコードが新しい表で動作するかを確認する
- **Cloud Run の「トラフィックの管理」で、前の版に切り替えない**:切り替えると、トラフィックが特定の版に固定され、次の自動デプロイで作成された版にトラフィックが移らなくなる

### 5.8 注意点

- **初めての自動デプロイは、#33 の PR のマージで実行される**:`workflow_run` は、main にあるワークフローのファイルしか使わない。そのため、マージの前には実行できない
- **DB がない間は、デプロイが失敗する**:Cloud SQL を削除している間(ADR 0007)や、3.12 の作り直しの最中は、ジョブ `migrate` が DB に接続できずに失敗し、デプロイはそこで停止する。サービス `api` と Firebase Hosting は更新されない。DB を作り直した後に、GitHub の「Actions」で失敗した実行を開き、「Re-run jobs」を押す
- **Firebase CLI に必要なロールは、Firebase Hosting 管理者と Service Usage 閲覧者の2つ**:初めての自動デプロイで確認した(5.6)。`firebase-tools` の版を上げて、ほかの権限が必要になった場合も、失敗したときのエラーを確認してからロールを追加し、この章に記録する(仕様書の判断 C)
- **再実行の後は、タグのないイメージを削除する**:「Re-run jobs」は、イメージのビルドからやり直す。同じタグ(コミットの短い ID)が新しいイメージに移り、前のイメージはタグのないまま残る。残したままにすると、クリーンアップ ポリシーの「最新の2つ」にこのイメージが数えられ、5.7 で戻すための1つ前のイメージが先に削除される。再実行の後に、5.7 のコマンドでイメージの一覧を確認し、タグのないイメージを Artifact Registry の画面で削除する
- **手作業のデプロイの手順は残す**:3 章と 4 章の手順は、自動デプロイが使えないとき(GitHub Actions の障害、権限の不足など)に使う。手作業でデプロイしても、次のマージで main の最新のコードに戻る
- **Vue の設定値を変えたら、Environment の Variables も変える**:自動デプロイは、`web/.env.production.local` ではなく、Environment `production` の Variables からビルドする

## 6. スケールの設定(#35)

作業した日:2026-11-27

アクセスが増えて Cloud Run のインスタンスが増えても、Cloud SQL の接続数が最大接続数を超えないように、サービス `api` のスケールの設定を決める。決める値は、同時実行数、最大インスタンス数、Puma のスレッド数、接続の上限の4つ。この章は、接続数の計算と、設定の手順、計測の結果を記載する。仕様は [docs/specs/035-cloud-run-scaling.md](specs/035-cloud-run-scaling.md)、仕組みの図は [docs/notes/035-cloud-run-scaling.html](notes/035-cloud-run-scaling.html)。

Rails のコードは変更しない。`api/config/puma.rb` のスレッド数と、`api/config/database.yml` の接続の上限(`max_connections`)は、どちらも環境変数 `RAILS_MAX_THREADS` を読むので、Cloud Run にこの環境変数を足すだけで、2つの値がそろう。

### 6.1 接続数を計算する

計算の相手は、2026-12-11 までに作り直す `db-f1-micro` の最大接続数 25(初めの値)にする(3.12)。今の無料お試しの DB より、最大接続数が小さいため。

| 使う側 | 計算 | 接続数 |
|---|---|---|
| サービス `api` | 最大インスタンス数 2 × 接続の上限 3 本 | 6 |
| ジョブ `migrate` | 接続の上限 5 本(ジョブには `RAILS_MAX_THREADS` がないため、`database.yml` の初めの値) | 5 |
| 管理者用の予約 | PostgreSQL が管理者のために残しておく接続(`superuser_reserved_connections` の初めの値) | 3 |
| 合計 | | 14 |

合計 14 は、最大接続数 25 に収まる。残りの 11 は、Cloud SQL が内部で使う接続と、作業のために手で接続するときの余裕にする。

同じ式で、DB の側から決まる最大インスタンス数の上限は、(25 − 5(ジョブ)− 5(予約と余裕))÷ 3 = 5 台。

この計算は、Puma の worker(プロセス)が 1 つである前提。環境変数 `WEB_CONCURRENCY` を設定していないため、worker は初めの値の 1 になる。

### 6.2 サービス `api` のスケールの設定を変更する

3つの値を、1回のデプロイでまとめて変更する。

1. 「Cloud Run」でサービス `api` を開き、「コンテナ」タブの「変数とシークレット」→「変数を追加」で、`RAILS_MAX_THREADS` = `3` を足す。シークレットではなく、ふつうの環境変数にする
2. 「スケーリング」タブを開き、次のように直す。表にない項目は変えない

| 画面の場所 | 項目 | 値 |
|---|---|---|
| リクエスト | インスタンスあたりの最大同時リクエスト数 | `80` → `3` |
| サービスのスケーリング | インスタンスの最大数 | `1` → `2` |
| サービスのスケーリング | インスタンスの最小数 | `0` のまま |

同時実行数(インスタンスあたりの最大同時リクエスト数)は、「コンテナ」タブではなく「スケーリング」タブにある。

3. 「差分を表示して再デプロイ」を押し、変わるのが3点(環境変数、同時実行数、最大インスタンス数)だけであることを確認して、デプロイする

#35 では、今のイメージ `e912526` のまま、版 `api-00009-6zk` が起動し、リクエストの 100% が届くようになった。

```bash
gcloud run services update api \
  --region=asia-northeast1 --project=knowledge-library-prod \
  --update-env-vars=RAILS_MAX_THREADS=3 \
  --concurrency=3
# サービス全体の最大インスタンス数は、2.8 と同じく、コンソールの「スケーリング」タブで変更する
```

### 6.3 確認する

読み取りだけのコマンドで確認する。環境変数は、秘密の値を表示しないように、`RAILS_MAX_THREADS` だけを取り出す。

```bash
P=knowledge-library-prod; R=asia-northeast1
# 同時実行数、サービス全体の最大インスタンス数、最小インスタンス数(3	2	0 と出る)
gcloud run services describe api --region=$R --project=$P \
  --format="value(spec.template.spec.containerConcurrency, metadata.annotations.'run.googleapis.com/maxScale', spec.template.metadata.annotations.'autoscaling.knative.dev/minScale')"
# 環境変数 RAILS_MAX_THREADS(RAILS_MAX_THREADS,3 と出る)
gcloud run services describe api --region=$R --project=$P \
  --flatten='spec.template.spec.containers[].env[]' \
  --format='csv[no-heading](spec.template.spec.containers.env.name,spec.template.spec.containers.env.value)' \
  | grep '^RAILS_MAX_THREADS,'
# Puma の起動のログ。Min threads: 3、Max threads: 3 と出る
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND textPayload:"threads"' \
  --project=$P --freshness=1d --limit=2 --format='value(timestamp, textPayload)'
```

#35 では、次のとおりだった。

- 同時実行数 `3`、サービス全体の最大インスタンス数 `2`、最小インスタンス数 `0`、`RAILS_MAX_THREADS` は `3`
- 版ごとの最大インスタンス数は `20` のまま。効くのは、小さいほうのサービス全体の値 `2`(2.8)
- イメージ、CPU(`1000m`)、メモリ(`512Mi`)、ほかの環境変数は変わっていない
- Puma の起動のログに、`Puma starting in single mode`(worker 1 つ)、`Min threads: 3`、`Max threads: 3` と出た
- オーナーがブラウザで本番の URL を開き、記事の一覧の表示、Google でのログイン、記事の投稿ができた

### 6.4 コールドスタートを計測する

最小インスタンス数を 0 にしているので、リクエストがない状態が続くと、インスタンスは 0 台になる。その後の最初のリクエストは、インスタンスの起動を待つ(コールドスタート)。この待ち時間を計測する。

1. リクエストがない状態で、15分以上待つ。Cloud Run は、リクエストがなくなってから最大15分、インスタンスを残す
2. `/up` を2回続けて呼び、応答までの時間を測る

```bash
for i in 1 2; do
  curl -s -o /dev/null -w "call$i http=%{http_code} total=%{time_total}s\n" \
    https://api-656607631341.asia-northeast1.run.app/up
done
```

3. Cloud Logging で、1回目の呼び出しのときに、新しいインスタンスが起動したこと(`Starting new instance`)を確認する

#35 では、リクエストがない状態が約1時間続いた後(2026-11-27 10:06)に計測した。

| 呼び出し | 応答までの時間 |
|---|---|
| 1回目(インスタンス 0 台から) | 13.71 秒 |
| 2回目(続けて呼んだとき) | 0.15 秒 |

1回目の内訳(Cloud Logging の時刻から)は、次のとおり。

| 経過 | できごと |
|---|---|
| 0 秒 | Cloud Run が新しいインスタンスを起動し始める(`Starting new instance`) |
| 約 7.7 秒 | Rails と Puma の起動が始まる(`Booting Puma`)。ここまでは、コンテナの用意など、Cloud Run の側の時間 |
| 約 13.3 秒 | Puma がリクエストを受け付け始める。Rails の起動は約 5.6 秒 |
| 約 13.6 秒 | `/up` に応答する(Rails の中の処理は 0.006 秒) |

最小インスタンス数を 1 にすると、この待ち時間はなくなるが、リクエストがない間もインスタンスが動き続け、課金される。改善が必要かは、フェーズ3以降の速度改善で判断する(仕様書の判断 D)。

### 6.5 注意点

- **CPU を増やして worker を増やすときは、計算をやり直す**:`RAILS_MAX_THREADS` は worker 1つあたりの値なので、インスタンス1台の接続の上限は「worker の数 × 接続の上限」になる。worker の数は `WEB_CONCURRENCY` で決まり、CPU を増やしても自動では増えない。同時実行数も「worker の数 × スレッド数」にそろえる。増やし方は [ノートの「参考」の節](notes/035-cloud-run-scaling.html)
- **Issue #49 で DB を作り直した後に、最大接続数を確認する**:`SHOW max_connections` と `SHOW superuser_reserved_connections` で確認する。25 と 3 でなかった場合は、6.1 の計算をやり直す
- **自動デプロイは、この設定を上書きしない**:`deploy.yml` は `gcloud run services update` に `--image` だけを渡すので、それ以外の設定は前の版から引き継がれる。#35 の PR のマージの後に確認する
- **ジョブ `migrate` の設定は変えていない**:ジョブには `RAILS_MAX_THREADS` がないので、接続の上限は 5 本のまま。ジョブの設定を変えるときは、サービスと同じ値にそろえ、6.1 の計算を直す
