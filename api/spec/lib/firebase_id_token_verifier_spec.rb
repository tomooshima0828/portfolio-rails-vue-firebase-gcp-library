require "rails_helper"

# 公開鍵のキャッシュを確かめる。トークンの中身の確認(AC-1〜9)は spec/requests/api/me_spec.rb で行う
RSpec.describe FirebaseIdTokenVerifier do
  include ActiveSupport::Testing::TimeHelpers

  let(:verifier) { described_class.new }

  context "キャッシュの期間(max-age)の間" do
    before { stub_firebase_public_keys(max_age: 3600) }

    it "公開鍵を取得し直さない" do
      verifier.verify!(firebase_id_token)
      verifier.verify!(firebase_id_token)

      expect(described_class).to have_received(:download_jwks).once
    end
  end

  context "キャッシュの期間(max-age)が過ぎた場合" do
    before { stub_firebase_public_keys(max_age: 60) }

    it "公開鍵を取得し直す" do
      verifier.verify!(firebase_id_token)
      travel(61.seconds) { verifier.verify!(firebase_id_token) }

      expect(described_class).to have_received(:download_jwks).twice
    end
  end

  context "キャッシュにない kid のトークンが届いた場合(Google が鍵を入れ替えたとき)" do
    let(:new_key) { OpenSSL::PKey::RSA.generate(2048) }

    before do
      described_class.clear_jwks_cache!
      # 1回目は入れ替える前の鍵、2回目は入れ替えた後の鍵を返す
      allow(described_class).to receive(:download_jwks).and_return(
        [ firebase_jwks(FirebaseIdTokenHelper::FIREBASE_KID => firebase_signing_key), 3600 ],
        [ firebase_jwks("new-kid" => new_key), 3600 ]
      )
    end

    it "公開鍵を取得し直し、新しい鍵で確かめる" do
      verifier.verify!(firebase_id_token)
      payload = verifier.verify!(firebase_id_token(uid: "uid-2", key: new_key, kid: "new-kid"))

      expect(payload["sub"]).to eq("uid-2")
      expect(described_class).to have_received(:download_jwks).twice
    end
  end

  context "キャッシュにない kid のトークンが続けて届いた場合(偽物のトークンを大量に送られたとき)" do
    before { stub_firebase_public_keys }

    it "取得し直してから5分の間は、公開鍵を取得し直さない" do
      verifier.verify!(firebase_id_token)
      expect { verifier.verify!(firebase_id_token(kid: "fake-kid-1")) }.to raise_error(described_class::InvalidToken)
      travel(4.minutes) do
        expect { verifier.verify!(firebase_id_token(kid: "fake-kid-2")) }.to raise_error(described_class::InvalidToken)
      end

      # 最初の取得と、fake-kid-1 での取り直しの2回。fake-kid-2 では取り直さない
      expect(described_class).to have_received(:download_jwks).twice
    end

    it "5分が過ぎたら、公開鍵を取得し直す" do
      verifier.verify!(firebase_id_token)
      expect { verifier.verify!(firebase_id_token(kid: "fake-kid-1")) }.to raise_error(described_class::InvalidToken)
      travel(5.minutes + 1.second) do
        expect { verifier.verify!(firebase_id_token(kid: "fake-kid-2")) }.to raise_error(described_class::InvalidToken)
      end

      expect(described_class).to have_received(:download_jwks).exactly(3).times
    end
  end
end
