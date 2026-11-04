# 0004. ローカルの Google ログインにも、本物の Firebase を使う

- 日付:2026-11-04
- 状態:採用

## 背景

#11 で、Vue から Firebase Auth で Google ログインできるようにする。ローカルで、どの Firebase にログインするかを決める必要があった。

#8 で、Rails は Firebase の ID トークンを、Google の公開鍵で署名を確かめてから受け付けるようにした。署名がない(`alg: none`)トークンは 401 にしている(#8 の AC-5)。

一方、architecture.md には「ローカル環境の Firebase は Emulator Suite を使う」と書いていた。Emulator Suite のうち、ログインを受け持つ Auth Emulator が発行する ID トークンには、署名がない。そのため、Auth Emulator でログインしたトークンは、今の Rails では 401 になる。

## 選択肢

1. 本物の Firebase を使う。開発用のプロジェクトを作り、ローカルの Vue からもそこへログインする
2. Auth Emulator を使う。Rails の開発環境では、署名を確かめずにトークンを受け付ける

## 決定

1 を選ぶ。Auth Emulator の署名のないトークンは、どの環境でも受け付けない。

## 理由

- **認証のコードに、確かめない道を作らない**。2 では、Rails の検証に「開発環境なら署名を確かめない」分岐が要る。これは #8 の AC-5 と逆の動きになる。環境の判定を間違える(本番で環境変数を設定し忘れるなど)と、本番でも署名なしのトークンが通り、誰でも好きな会員になりすませてしまう。
- **本物のトークンが Rails の検証を通ることを、ローカルで確かめられる**。#8 では、Ruby 向けの Firebase Admin SDK がないため、トークンの検証を自前で作った。テストでは自分で作った鍵で署名したトークンを使っているので、Google が実際に発行するトークンで確かめられるのは、本物の Firebase を使う場合だけになる。
- **費用がかからない**。Firebase Auth の Google ログインは、無料の Spark プランで使える。

2 は、Google アカウントがなくてもログインでき、オフラインでも動き、テスト用の会員をいくつでも作れる。1 を選ぶことで、これらの利点は捨てる。

## 影響

- オーナーが Firebase のコンソールで、開発用のプロジェクトを作り、Google ログインを有効にする。手順は README に書く。
- Firebase の設定値は、リポジトリ直下の `.env` に置き、コミットしない(#11 の仕様書)。
- ローカルの DB の `members` に、本物の Google アカウントの uid が入る。ai-guideline.md の「Firebase Auth の実ユーザー情報」として扱い、AI に渡さない。
- ネットにつながっていないと、ローカルでもログインできない。
- Emulator Suite は、フェーズ4で Firestore のルールのテストに使う。architecture.md の「ローカル環境」の行は、#11 で直す。
- 本番用の Firebase のプロジェクトを、開発用と分けるかどうかは、フェーズ2で決める。

## 参考

- 仕様書:[docs/specs/011-vue-google-login.md](../specs/011-vue-google-login.md)
- 署名なしのトークンを拒む確認:[docs/specs/008-verify-id-token.md](../specs/008-verify-id-token.md) の AC-5
