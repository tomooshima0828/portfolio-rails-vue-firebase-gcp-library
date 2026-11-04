module Api
  # 記事の作成と一覧。一覧はログインなしで呼べ、作成だけログインが必要
  class ArticlesController < ApplicationController
    include FirebaseAuthenticatable

    before_action :authenticate_member!, only: :create

    def index
      articles = Article.order(created_at: :desc, id: :desc)
      render json: { articles: articles.map { |article| article_json(article) } }
    end

    def create
      article = current_member.articles.build(article_params)
      if article.save
        render json: article_json(article), status: :created
      else
        render json: { errors: article.errors.to_hash }, status: :unprocessable_content
      end
    end

    private

    def article_params
      params.expect(article: [ :title, :body ])
    end

    # API の外に出す項目。articles にカラムが増えても、ここに足さない限り外に出ない
    def article_json(article)
      article.as_json(only: %i[id title body member_id created_at updated_at])
    end
  end
end
