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
