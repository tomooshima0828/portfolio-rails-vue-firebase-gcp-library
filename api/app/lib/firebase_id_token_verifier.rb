# Firebase の ID トークンを確かめ、トークンの中身(payload)を返す。
# Firebase 公式の「サードパーティの JWT ライブラリで ID トークンを検証する」手順のとおりに確かめる
class FirebaseIdTokenVerifier
  class InvalidToken < StandardError; end

  JWKS_URL = URI("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
  # 知らない kid での取り直しの間隔。偽物のトークンで、Google への通信を増やされないため
  KID_NOT_FOUND_REFETCH_INTERVAL = 5.minutes
  # 複数のスレッドが同時に公開鍵を取り直さないようにする
  MUTEX = Mutex.new

  class << self
    # jwt gem が、トークンの kid に合う公開鍵を探すときに呼ぶ。
    # 1回目は { kid: }、そこで見つからなければ { kid_not_found: true, ... } で、もう一度呼ばれる
    def fetch_jwks(options)
      MUTEX.synchronize do
        if jwks_expired? || (options[:kid_not_found] && kid_not_found_refetch_allowed?)
          @jwks, max_age = download_jwks
          @jwks_expires_at = Time.current + max_age
          @kid_not_found_refetched_at = Time.current if options[:kid_not_found]
        end
        @jwks
      end
    end

    # Google から公開鍵の一覧と、キャッシュの期間(秒)を取ってくる。テストでは差し替える
    def download_jwks
      response = Net::HTTP.get_response(JWKS_URL)
      response.value
      [ JSON.parse(response.body), response["Cache-Control"][/max-age=(\d+)/, 1].to_i ]
    end

    # 保存した公開鍵を消す。テストで、前のテストの鍵が残らないようにするために使う
    def clear_jwks_cache!
      MUTEX.synchronize { @jwks = @jwks_expires_at = @kid_not_found_refetched_at = nil }
    end

    private

    def jwks_expired?
      @jwks.nil? || Time.current >= @jwks_expires_at
    end

    def kid_not_found_refetch_allowed?
      @kid_not_found_refetched_at.nil? || Time.current >= @kid_not_found_refetched_at + KID_NOT_FOUND_REFETCH_INTERVAL
    end
  end

  def initialize
    @project_id = Rails.configuration.x.firebase.project_id
    raise "Firebase のプロジェクト ID が設定されていません(FIREBASE_PROJECT_ID)" if @project_id.blank?
  end

  def verify!(token)
    payload, _header = JWT.decode(
      token, # 確かめるトークン
      nil, # 署名を確かめる鍵。下の jwks: で渡すので、ここでは渡さない
      true, # 署名を確かめるか
      algorithms: [ "RS256" ],
      jwks: self.class.method(:fetch_jwks),
      aud: @project_id, verify_aud: true,
      iss: "https://securetoken.google.com/#{@project_id}", verify_iss: true,
      verify_iat: true
    )
    raise InvalidToken, "sub が空です" if payload["sub"].blank?
    raise InvalidToken, "auth_time が未来です" if payload["auth_time"].to_i > Time.current.to_i

    payload
  rescue JWT::DecodeError => e
    raise InvalidToken, e.message
  end
end
