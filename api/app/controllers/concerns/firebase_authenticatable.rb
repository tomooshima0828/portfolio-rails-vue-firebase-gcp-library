# Firebase の ID トークンで、リクエストした会員を特定する。
# コントローラーで before_action :authenticate_member! と書くと、トークンがない、または確かめられないリクエストに 401 を返す
module FirebaseAuthenticatable
  extend ActiveSupport::Concern

  private

  def authenticate_member!
    token = request.authorization.to_s[/\ABearer (.+)\z/, 1]
    return render_unauthorized("Authorization ヘッダーが Bearer の形ではありません") if token.nil?

    payload = FirebaseIdTokenVerifier.new.verify!(token)
    @current_member = Member.create_or_find_by!(firebase_uid: payload["sub"])
  rescue FirebaseIdTokenVerifier::InvalidToken => e
    render_unauthorized(e.message)
  end

  def current_member
    @current_member
  end

  # どの確認で失敗したかは返さない(偽造を試す人に手がかりを与えないため)。理由はログに残す
  def render_unauthorized(reason)
    Rails.logger.info("401 を返します: #{reason}")
    render json: { error: "unauthorized" }, status: :unauthorized
  end
end
