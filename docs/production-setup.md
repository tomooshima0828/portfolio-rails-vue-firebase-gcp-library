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
- 「予算と上限」の画面の「利用額上限」は、予算に達したら一部のサービスを一時停止する仕組み。#29 では使わない。Cloud SQL が対象かは、#31 で確かめる
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
- **DB はまだない**:`/up` 以外のパスはエラーになる。マイグレーションをどこで流すかは #31 で決める(起動時の `rails db:prepare` は `api/bin/docker-entrypoint` から外した)
