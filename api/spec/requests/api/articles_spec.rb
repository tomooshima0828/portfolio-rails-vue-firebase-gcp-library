require "rails_helper"

RSpec.describe "記事の API", type: :request do
  # API が返す記事と同じ形の Hash にする
  def article_json(article)
    {
      "id" => article.id,
      "title" => article.title,
      "body" => article.body,
      "member_id" => article.member_id,
      "created_at" => article.created_at.as_json,
      "updated_at" => article.updated_at.as_json
    }
  end

  describe "POST /api/articles" do
    before { stub_firebase_public_keys }

    let(:headers) { auth_header(firebase_id_token(uid: "uid-1")) }
    let(:params) { { article: { title: "タイトル", body: "本文" } } }

    context "ログイン済みの会員が、タイトルと本文を送った場合" do
      it "その会員の記事として保存し、201 と保存した記事を返す" do
        expect {
          post "/api/articles", params:, headers:, as: :json
        }.to change(Article, :count).by(1)

        article = Article.last
        expect(article).to have_attributes(title: "タイトル", body: "本文")
        expect(article.member.firebase_uid).to eq("uid-1")
        expect(response).to have_http_status(:created)
        expect(response.parsed_body).to eq(article_json(article))
      end
    end

    context "リクエストに、別の会員の member_id が含まれている場合" do
      let(:other_member) { Member.create!(firebase_uid: "uid-2") }
      let(:params) { { article: { title: "タイトル", body: "本文", member_id: other_member.id } } }

      it "それを使わず、ログインしている会員の記事として保存する" do
        post "/api/articles", params:, headers:, as: :json

        expect(response).to have_http_status(:created)
        expect(Article.last.member.firebase_uid).to eq("uid-1")
      end
    end

    shared_examples :validation_failure do |field|
      it "422 と、#{field} のエラーを返し、記事を保存しない" do
        expect {
          post "/api/articles", params:, headers:, as: :json
        }.not_to change(Article, :count)
        expect(response).to have_http_status(:unprocessable_content)
        expect(response.parsed_body["errors"].keys).to eq([ field ])
      end
    end

    context "タイトルが空の場合" do
      let(:params) { { article: { title: "", body: "本文" } } }

      it_behaves_like :validation_failure, "title"
    end

    context "タイトルが101文字の場合" do
      let(:params) { { article: { title: "あ" * 101, body: "本文" } } }

      it_behaves_like :validation_failure, "title"
    end

    context "本文が空の場合" do
      let(:params) { { article: { title: "タイトル", body: "" } } }

      it_behaves_like :validation_failure, "body"
    end

    context "記事の項目が1つもない場合" do
      let(:params) { {} }

      it "400 を返し、記事を保存しない" do
        expect {
          post "/api/articles", params:, headers:, as: :json
        }.not_to change(Article, :count)
        expect(response).to have_http_status(:bad_request)
      end
    end

    shared_examples :authentication_failure do
      it "401 を返し、記事を保存しない" do
        expect {
          post "/api/articles", params:, headers:, as: :json
        }.not_to change(Article, :count)
        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "Authorization ヘッダーがない場合" do
      let(:headers) { {} }

      it_behaves_like :authentication_failure
    end

    context "別の鍵で署名されている場合" do
      let(:headers) { auth_header(firebase_id_token(key: OpenSSL::PKey::RSA.generate(2048))) }

      it_behaves_like :authentication_failure
    end
  end

  describe "GET /api/articles" do
    context "複数の会員の記事がある場合" do
      it "すべての会員の記事を、新しい順に返す" do
        member1 = Member.create!(firebase_uid: "uid-1")
        member2 = Member.create!(firebase_uid: "uid-2")
        # id の順と作成日時の順をずらし、作成日時で並べていることを確かめる
        oldest = Article.create!(member: member1, title: "2日前", body: "本文", created_at: 2.days.ago)
        newest = Article.create!(member: member2, title: "1時間前", body: "本文", created_at: 1.hour.ago)
        middle = Article.create!(member: member1, title: "1日前", body: "本文", created_at: 1.day.ago)

        get "/api/articles"

        expect(response.parsed_body).to eq("articles" => [ article_json(newest), article_json(middle), article_json(oldest) ])
      end

      it "作成日時が同じ記事は、id の大きい順に返す" do
        member = Member.create!(firebase_uid: "uid-1")
        created_at = 1.hour.ago
        first = Article.create!(member:, title: "先", body: "本文", created_at:)
        second = Article.create!(member:, title: "後", body: "本文", created_at:)

        get "/api/articles"

        expect(response.parsed_body["articles"].pluck("id")).to eq([ second.id, first.id ])
      end
    end

    it "ログインしていなくても、200 を返す" do
      get "/api/articles"

      expect(response).to have_http_status(:ok)
    end

    context "記事が1件もない場合" do
      it "空の articles を返す" do
        get "/api/articles"

        expect(response.parsed_body).to eq("articles" => [])
      end
    end
  end
end
