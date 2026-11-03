require "rails_helper"

RSpec.describe Article, type: :model do
  let(:member) { Member.create!(firebase_uid: "uid-1") }
  let(:article) { Article.new(member:, title: "タイトル", body: "本文") }

  it "タイトル、本文、書いた会員があれば、保存できる" do
    expect(article.save).to be(true)
  end

  context "タイトルが空の場合" do
    before { article.title = "" }

    it "保存しない" do
      expect(article.save).to be(false)
      expect(article.errors).to include(:title)
    end
  end

  context "タイトルが100文字の場合" do
    before { article.title = "あ" * 100 }

    it "保存できる" do
      expect(article.save).to be(true)
    end
  end

  context "タイトルが101文字の場合" do
    before { article.title = "あ" * 101 }

    it "保存しない" do
      expect(article.save).to be(false)
      expect(article.errors).to include(:title)
    end
  end

  context "本文が空の場合" do
    before { article.body = "" }

    it "保存しない" do
      expect(article.save).to be(false)
      expect(article.errors).to include(:body)
    end
  end

  context "書いた会員がない場合" do
    before { article.member = nil }

    it "保存しない" do
      expect(article.save).to be(false)
      expect(article.errors).to include(:member)
    end
  end

  describe "会員の記事(member.articles)" do
    it "その会員が書いた記事だけを返す" do
      own = Article.create!(member:, title: "自分の記事", body: "本文")
      other = Member.create!(firebase_uid: "uid-2")
      Article.create!(member: other, title: "別の会員の記事", body: "本文")

      expect(member.articles).to contain_exactly(own)
    end
  end
end
