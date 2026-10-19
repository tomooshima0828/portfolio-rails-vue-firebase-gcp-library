require "rails_helper"

RSpec.describe "GET /api/me", type: :request do
  before { stub_firebase_public_keys }

  context "有効な ID トークンの場合" do
    it "200 と、会員の id と firebase_uid を返す" do
      get "/api/me", headers: auth_header(firebase_id_token(uid: "uid-1"))

      member = Member.find_by!(firebase_uid: "uid-1")
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("id" => member.id, "firebase_uid" => "uid-1")
    end

    it "初めての uid なら、会員を作る" do
      expect {
        get "/api/me", headers: auth_header(firebase_id_token(uid: "uid-1"))
      }.to change(Member, :count).by(1)
    end

    it "同じ uid なら、会員を新しく作らず、同じ会員を返す" do
      token = firebase_id_token(uid: "uid-1")
      get "/api/me", headers: auth_header(token)
      first_id = response.parsed_body["id"]

      expect {
        get "/api/me", headers: auth_header(token)
      }.not_to change(Member, :count)
      expect(response.parsed_body["id"]).to eq(first_id)
    end
  end

  shared_examples :authentication_failure do
    it "401 と、本文に unauthorized を返し、会員を作らない" do
      expect {
        get "/api/me", headers: headers
      }.not_to change(Member, :count)
      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body).to eq("error" => "unauthorized")
    end
  end

  context "Authorization ヘッダーがない場合" do
    let(:headers) { {} }

    it_behaves_like :authentication_failure
  end

  context "Authorization ヘッダーが Bearer の形でない場合" do
    let(:headers) { { "Authorization" => "Basic #{firebase_id_token}" } }

    it_behaves_like :authentication_failure
  end

  context "別の鍵で署名されている場合" do
    let(:headers) { auth_header(firebase_id_token(key: OpenSSL::PKey::RSA.generate(2048))) }

    it_behaves_like :authentication_failure
  end

  context "公開鍵の一覧にない kid の場合" do
    let(:headers) { auth_header(firebase_id_token(kid: "unknown-kid")) }

    it_behaves_like :authentication_failure
  end

  context "署名の方式が HS256 で、公開鍵を共通の鍵として使っている場合" do
    let(:headers) { auth_header(firebase_id_token(algorithm: "HS256", key: firebase_signing_key.public_key.to_pem)) }

    it_behaves_like :authentication_failure
  end

  context "署名がない(none)場合" do
    let(:headers) { auth_header(firebase_id_token(algorithm: "none", key: nil)) }

    it_behaves_like :authentication_failure
  end

  context "有効期限(exp)が切れている場合" do
    let(:headers) { auth_header(firebase_id_token(exp: 1.minute.ago.to_i)) }

    it_behaves_like :authentication_failure
  end

  context "発行時刻(iat)が未来の場合" do
    let(:headers) { auth_header(firebase_id_token(iat: 1.hour.from_now.to_i)) }

    it_behaves_like :authentication_failure
  end

  context "ログイン時刻(auth_time)が未来の場合" do
    let(:headers) { auth_header(firebase_id_token(auth_time: 1.hour.from_now.to_i)) }

    it_behaves_like :authentication_failure
  end

  context "宛先(aud)が別のプロジェクトの場合" do
    let(:headers) { auth_header(firebase_id_token(aud: "other-project")) }

    it_behaves_like :authentication_failure
  end

  context "発行元(iss)が別のプロジェクトの場合" do
    let(:headers) { auth_header(firebase_id_token(iss: "https://securetoken.google.com/other-project")) }

    it_behaves_like :authentication_failure
  end

  context "uid(sub)が空の場合" do
    let(:headers) { auth_header(firebase_id_token(uid: "")) }

    it_behaves_like :authentication_failure
  end
end
