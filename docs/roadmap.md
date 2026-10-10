# ロードマップ(Roadmap)

フェーズと、その順番・目標を置く。各フェーズは GitHub の Milestone に対応し、フェーズ名をそのまま Milestone 名にする。
タスクの一覧はここに書かず、Issue だけで管理する。機能と構成は [architecture.md](architecture.md)、使う技術と優先度は [README.md](../README.md) にある。

順番の考え方:小さく動かす → 早く本番に出す → 機能をそろえる → リアルタイム機能 → 優先度 B。
本番へのデプロイを早めに行うのは、求人の必須要件(Firebase / Google Cloud、セキュリティ、インフラ)を早く示し、インフラの問題を早く見つけるため。

## フェーズ1:縦一本を動かす(ローカル)+ CI

- 目標:Google ログイン(Firebase Auth)→ ID トークンを Rails が検証 → 記事を1件投稿 → 一覧で表示、がローカルで動く
- 範囲:Firebase Auth、Rails API、Vue 3、PostgreSQL(Docker)、GitHub Actions の CI(RSpec、RuboCop、Brakeman、bundler-audit、Vitest、vue-tsc)、GitHub Projects(スプリントのボード)
- 完了の目安:縦一本が手動確認で通る。PR ごとに CI が動き、Ruleset で CI の成功を必須にしている。Issue を GitHub Projects のボードで管理し、スプリントの記録を docs に残し始めている

GitHub Projects は、必須要件「チーム開発経験」を示す手段なので、最初のフェーズから使う。スプリントの記録は途中から始めると、チームのやり方で進めてきたことを示しにくいため。

## フェーズ2:本番にデプロイする

- 目標:フェーズ1の縦一本が、本番(Google Cloud / Firebase)で動く
- 範囲:Cloud Run、Artifact Registry、Cloud SQL、Secret Manager、IAM(最小権限)、GitHub Actions の CD(Workload Identity 連携)、Cloud Logging / Error Reporting、予算アラート、Cloud Run のスケール設定、Vue の配信(Firebase Hosting)
- 完了の目安:`main` へのマージで自動デプロイされ、本番でログインから一覧表示まで通る。予算アラートを設定している。Cloud Run のスケール設定と Cloud SQL の最大接続数の関係を docs に残している

Firebase Hosting は優先度 B だが、本番で Vue を配る場所が必要なので、例外としてこのフェーズに入れる。
`/api` を Firebase Hosting から Cloud Run へ転送するか、ブラウザから Cloud Run を直接呼ぶかは、このフェーズのタスクで ADR に残して決める。判断材料は [docs/notes/vue-production-hosting.html](notes/vue-production-hosting.html)。

このフェーズから Cloud SQL の課金が始まる。使わない期間は停止または削除する。

## フェーズ3:記事機能をそろえる

- 目標:題材の中心である投稿・検索・ブックマークがそろい、記事が増えても遅くならない
- 範囲:記事の編集・削除、タグ、検索、ブックマーク、サムネイル画像(Active Storage + Cloud Storage)、ページネーション、インデックス設計、counter cache
- 完了の目安:architecture.md の機能一覧のうち、コメント・リアクション以外が実装済みになる

検索の方式(pg_search などは優先度 B)は、このフェーズのタスクで決める。

## フェーズ4:リアルタイム機能(Firestore)

- 目標:記事へのコメントとリアクションがリアルタイムに反映され、本人以外が書き込めないことをテストで保証している
- 範囲:Cloud Firestore、Firestore セキュリティルール、ルールのテスト、Firebase Emulator Suite(CI でも使う)
- 完了の目安:ルールのテストが CI で動く。architecture.md の機能一覧がすべて実装済みになる

## フェーズ5:運用・負荷対策(優先度 B)

- 目標:負荷と障害への備えを、計測の数値と手順書で示す
- 範囲:Cloud Monitoring(稼働時間チェック、アラート)、k6 による負荷試験、Bullet、Rack::Attack、ヘルスチェックと SIGTERM 時の終了処理、runbook、その他の優先度 B(Dependabot、ESLint / Prettier)
- 完了の目安:負荷試験の改善前後の数値と、runbook を docs に残している

## その後:優先度 C(余力があれば)

Solid Queue または Cloud Tasks、Cloud Trace、Terraform。
