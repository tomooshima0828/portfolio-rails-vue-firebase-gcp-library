# テストで、本物の Firebase と Google を使わずに ID トークンの検証を試すための道具。
# テストが Google の役を演じる。テストが作った秘密鍵でトークンに署名し、
# FirebaseIdTokenVerifier が Google から取り寄せる公開鍵を、その鍵と対になる公開鍵に差し替える。
# 鍵はテストの実行中にメモリの中で作るだけで、ファイルには保存しない。
module FirebaseIdTokenHelper
  # config/environments/test.rb の Firebase のプロジェクト ID と同じ値
  FIREBASE_PROJECT_ID = "test-project"
  FIREBASE_KID = "test-kid"

  # 鍵を作るのに時間がかかるので、テストの実行中に1回だけ作って使い回す
  SIGNING_KEY = OpenSSL::PKey::RSA.generate(2048)

  # Firebase の代わりに、トークンに署名する秘密鍵
  def firebase_signing_key
    SIGNING_KEY
  end

  # Firebase と同じ形の ID トークンを作る。何も指定しなければ、すべての項目が正しいトークンになる。
  # claims で項目を1つ変えると、確かめたい「おかしいトークン」を作れる(例:exp: 1.hour.ago.to_i)
  def firebase_id_token(uid: "test-uid", key: firebase_signing_key, kid: FIREBASE_KID, algorithm: "RS256", **claims)
    now = Time.current.to_i
    payload = {
      iss: "https://securetoken.google.com/#{FIREBASE_PROJECT_ID}",
      aud: FIREBASE_PROJECT_ID,
      sub: uid,
      iat: now - 60,
      auth_time: now - 60,
      exp: now + 3600
    }.merge(claims)

    JWT.encode(payload, key, algorithm, { kid: kid })
  end

  # FirebaseIdTokenVerifier が Google から公開鍵を取り寄せる処理を差し替え、keys(kid => 秘密鍵)と対になる公開鍵を返させる。
  # 前のテストで保存された鍵が残らないよう、検証のクラスが保存している鍵も消す
  def stub_firebase_public_keys(keys = { FIREBASE_KID => firebase_signing_key }, max_age: 3600)
    FirebaseIdTokenVerifier.clear_jwks_cache!
    allow(FirebaseIdTokenVerifier).to receive(:download_jwks).and_return([ firebase_jwks(keys), max_age ])
  end

  # Google の JWKS の URL が返すものと同じ形(JSON を読み込んだ Hash)にする
  def firebase_jwks(keys)
    jwks = keys.map { |kid, key| JWT::JWK.new(key.public_key, kid: kid) }
    JSON.parse(JWT::JWK::Set.new(jwks).export.to_json)
  end

  def auth_header(token)
    { "Authorization" => "Bearer #{token}" }
  end
end

RSpec.configure do |config|
  config.include FirebaseIdTokenHelper
end
