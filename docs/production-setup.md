# 本番環境の作り方

本番環境(Google Cloud / Firebase)を一から作り直せるように、実際に行った手順を残す。章は Issue ごとに足していく。

- 作業はオーナーがコンソールで行う。画面の名前は、作業した日のもの。コンソールは見た目が変わることがあるので、名前が違ったら、意味の近いものを探す
- カード番号や請求先アカウントの ID など、支払いの情報はこの文書に書かない
- 開発用と本番用でプロジェクトを分ける理由は [ADR 0005](adr/0005-separate-dev-prod-projects.md)、全体の図は [docs/notes/gcp-projects-and-billing.html](notes/gcp-projects-and-billing.html)

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

Rails のイメージを Artifact Registry に置き、Cloud Run で動かし、`/up` が 200 を返すところまでを手で通す。DB はまだ繋がない(#31)。仕様は [docs/specs/030-cloud-run-deploy.md](specs/030-cloud-run-deploy.md)、仕組みの図は [docs/notes/cloud-run-deploy.html](notes/cloud-run-deploy.html)。

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

本番の DB(Cloud SQL for PostgreSQL)を作り、Cloud Run の Rails から繋いで、`GET /api/articles` が 200 を返すところまでを手で通す。仕様は [docs/specs/031-cloud-sql.md](specs/031-cloud-sql.md)、仕組みの図は [docs/notes/cloud-sql-connection.html](notes/cloud-sql-connection.html)。表をジョブで作る理由は [ADR 0006](adr/0006-run-migrations-with-cloud-run-jobs.md)、使わない期間の扱いは [ADR 0007](adr/0007-cloud-sql-idle-periods.md)。

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
- **古いイメージを消す**:置き場の無料枠は 0.5GB。サービスとジョブが `fcf8acc` を使うようになったので、`cc1e273` は使われていない。「Artifact Registry」の `knowledge-library` → `api` で、タグ `cc1e273` のイメージを選んで削除する
- **パスワードを変えたら、ジョブとサービスの版の番号を変える**:2.10 の鍵と同じく、新しい版を足しても、版の番号を変えてデプロイし直すまで、Rails は古いパスワードを使う
