# Knowledge Library(仮)

会員がノウハウ記事を投稿・検索・ブックマークできる「ノウハウ図書館」風の Web サービス。
Rails API + Vue 3 の SPA を、Firebase(認証・リアルタイム機能)と Google Cloud(実行基盤・運用)の上で動かす構成にしている。

> 作成中。現時点では「使う技術の一覧」と「求人要件との対応」だけを定義している。

## 目的

リベシティ「Railsエンジニア」求人(業務委託・フルリモート)の要件を、動くもので示すためのポートフォリオ。

- 求人:https://libegroup.com/job.html?id=nl443jkkx8a
- 担当サービス:ノウハウ図書館、スキルマーケットなどのリベシティ関連 Web サービスの開発・保守

## 求人要件と、このポートフォリオでの示し方

### 必須スキル

| 求人の要件 | このリポジトリで示すこと |
|---|---|
| Firebase / Google Cloud を使った開発経験 | Firebase Auth のログインを Rails 側で検証、Firestore でリアルタイム機能、Rails を Cloud Run + Cloud SQL で本番運用 |
| Git / GitHub の操作経験 | GitHub Flow、Issue 起点の PR、PR テンプレート、ブランチ保護 |
| チーム開発経験(スクラムなど) | GitHub Projects でスプリントを回す(バックログ、見積もり、ふりかえりを docs に残す) |
| セキュリティの基礎知識 | ID トークン検証の自前実装、Firestore セキュリティルールとそのテスト、Secret Manager、最小権限の IAM、鍵ファイルを使わない CI デプロイ |
| Web サービスのインフラに関する知識 | Docker → Artifact Registry → Cloud Run、Cloud SQL、Cloud Storage、Firebase Hosting の構成図と、選んだ理由 |
| 大規模サービスの開発運用(負荷 / 障害対策) | 負荷試験、N+1 検出、インデックス設計、Cloud Run のスケール設定と DB 接続数の計算、監視とアラート、障害対応手順書 |
| Ruby on Rails での開発経験(3年以上) | 実務経験 + 本リポジトリのコード品質(テスト、静的解析、設計の説明) |
| AI を日常的に開発に取り入れている | Claude Code を使った開発フローを docs に記録 |
| 機密情報を扱う際の AI 利用ガイドライン | AI に渡さない情報の線引きと、それを仕組みで守る設定(後述) |

### 歓迎スキル

| 求人の要件 | このリポジトリで示すこと |
|---|---|
| 大規模 Rails アプリの保守・改善 | 計測 → 改善 → 再計測の記録(改善前後の数値を残す) |
| リードエンジニア経験 | 設計判断の記録(ADR)、レビュー観点の明文化 |
| AI を活用した開発ワークフローの改善提案 | プロジェクト用の CLAUDE.md、カスタムコマンド / スキル、プロンプトの整備 |

## 技術一覧

優先度の意味:
- **A**:必須要件に直結。必ず入れる
- **B**:入れると説明に厚みが出る。A が終わったら入れる
- **C**:余力があれば

### バックエンド(Rails)

| 技術 | 用途 | 優先度 |
|---|---|---|
| Ruby 3.4 / Rails 8(API モード) | 記事・タグ・ブックマークの API | A |
| PostgreSQL | 本番は Cloud SQL、ローカルは Docker | A |
| jwt gem(Firebase ID トークンの検証を自前実装) | Firebase Auth のログインを Rails 側で受ける | A |
| Active Storage + Cloud Storage | 記事のサムネイル画像 | A |
| rack-cors | Vue(別オリジン)からの呼び出し | A |
| RSpec / FactoryBot | request spec 中心のテスト | A |
| RuboCop / Brakeman / bundler-audit | 静的解析、脆弱性チェック | A |
| Bullet | N+1 の検出 | B |
| Rack::Attack | レート制限(連投・総当たり対策) | B |
| pg_search など | 記事の全文検索 | B |
| Solid Queue または Cloud Tasks | 非同期処理(画像処理、通知など) | C |

### フロントエンド(Vue)

| 技術 | 用途 | 優先度 |
|---|---|---|
| Vue 3 / TypeScript / Vite | SPA 本体 | A |
| Vue Router / Pinia | 画面遷移、ログイン状態の管理 | A |
| Firebase JS SDK | ログイン、Firestore の読み書き | A |
| Vitest / vue-tsc | 単体テスト、型チェック | A |
| ESLint / Prettier | 静的解析、整形 | B |

### Firebase

| 技術 | 用途 | 優先度 |
|---|---|---|
| Firebase Authentication | Google ログイン。発行された ID トークンを Rails が検証する | A |
| Cloud Firestore | 記事へのコメントやリアクションなど、リアルタイム反映したい部分 | A |
| Firestore セキュリティルール + ルールのテスト | 本人以外が書き込めないことをテストで保証 | A |
| Firebase Emulator Suite | ローカル開発、CI でのルールテスト | A |
| Firebase Hosting | Vue の配信。`/api` は Cloud Run へ転送 | B |

### Google Cloud

| 技術 | 用途 | 優先度 |
|---|---|---|
| Cloud Run | Rails の実行基盤 | A |
| Artifact Registry | Docker イメージの置き場 | A |
| Cloud SQL for PostgreSQL | 本番 DB | A |
| Secret Manager | `RAILS_MASTER_KEY`、DB パスワードなど | A |
| Cloud Storage | Active Storage の保存先 | A |
| IAM(サービスアカウント、最小権限) | Cloud Run・CI それぞれに必要な権限だけを付与 | A |
| Cloud Logging / Error Reporting | 構造化ログ、例外の通知 | A |
| Cloud Monitoring | 稼働時間チェック、レイテンシ・エラー率のアラート | B |
| 予算アラート | 想定外の課金を防ぐ | A |
| Cloud Trace | 遅いリクエストの原因調査 | C |
| Terraform | 上記インフラのコード化 | C |

### CI/CD・チーム開発

| 技術 | 用途 | 優先度 |
|---|---|---|
| Git / GitHub(GitHub Flow、ブランチ保護、PR テンプレート) | 変更は必ず PR 経由 | A |
| GitHub Actions(CI) | RSpec、RuboCop、Brakeman、Vitest、vue-tsc、ルールテストを PR ごとに実行 | A |
| GitHub Actions(CD)+ Workload Identity 連携 | サービスアカウントの鍵ファイルを使わずに Cloud Run へデプロイ | A |
| GitHub Projects | スプリントのボード、バックログ | B |
| Dependabot | 依存ライブラリの更新 | B |

### 負荷・障害対策

| 技術 / 取り組み | 用途 | 優先度 |
|---|---|---|
| k6 | 負荷試験(記事一覧・検索 API) | B |
| Cloud Run の設定(最小 / 最大インスタンス、同時実行数) | スケール時の挙動と、Cloud SQL の最大接続数との関係を説明できるようにする | A |
| インデックス設計、ページネーション、counter cache | 記事が増えても遅くならないこと | A |
| ヘルスチェック(`/up`)、SIGTERM 時の終了処理 | Cloud Run の入れ替え時にリクエストを落とさない | B |
| 障害対応手順書(runbook) | 「DB に繋がらない」「エラー率が上がった」ときの確認手順 | B |

### AI 活用

| 技術 / 取り組み | 用途 | 優先度 |
|---|---|---|
| Claude Code | 設計の壁打ち、実装、レビュー | A |
| CLAUDE.md(プロジェクト用) | 設計方針・コーディング規約を AI と共有 | A |
| AI 利用ガイドライン(`docs/ai-guideline.md`) | 機密情報(鍵、`.env`、本番データ、個人情報)を AI に渡さないルール | A |
| Claude Code の permissions 設定 | `.env` や `config/master.key` を読めないように deny する(ルールを仕組みで守る) | A |
| カスタムコマンド / スキル | PR 作成、レビュー観点チェックなど、繰り返す作業の定型化 | B |

## 想定するディレクトリ構成

```
.
├── api/        # Rails API
├── web/        # Vue 3 SPA
├── firebase/   # firestore.rules、ルールのテスト、firebase.json
├── infra/      # Cloud Run・Cloud SQL などの設定(余力があれば Terraform)
├── docs/       # 構成図、ADR、AI 利用ガイドライン、runbook、スプリントの記録
└── .github/    # GitHub Actions、PR テンプレート
```

## 費用の目安

- Firebase(Auth、Firestore、Hosting)、Cloud Run、Artifact Registry:無料枠の範囲に収まる見込み
- Cloud SQL:最小構成でも月 1,500 円前後(概算)。予算アラートを設定し、使わない期間は停止または削除する
