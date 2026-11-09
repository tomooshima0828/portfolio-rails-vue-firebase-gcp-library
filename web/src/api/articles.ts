import { apiFetch } from '@/api/client'

// GET /api/articles が返す記事の項目。Rails の ArticlesController#article_json に合わせる
export type Article = {
  id: number
  title: string
  body: string
  member_id: number
  created_at: string
  updated_at: string
}

// 422 のときに Rails が返す、項目ごとのエラー。{ title: ["can't be blank"] } の形
export type ArticleErrors = Record<string, string[]>

export type CreateArticleResult =
  | { ok: true; article: Article }
  | { ok: false; errors: ArticleErrors }

// 記事の一覧を、Rails が返した順(新しい順)で返す
export async function fetchArticles(): Promise<Article[]> {
  const response = await apiFetch('/api/articles')
  if (!response.ok) {
    throw new Error(`記事の一覧を取得できませんでした(${response.status})`)
  }
  const data = (await response.json()) as { articles: Article[] }
  return data.articles
}

// 記事を作る。422 は会員が直せる失敗なので戻り値で返し、それ以外の失敗はエラーを投げる
export async function createArticle(input: {
  title: string
  body: string
}): Promise<CreateArticleResult> {
  const response = await apiFetch('/api/articles', {
    method: 'POST',
    // これがないと、Rails は本文を JSON として読まず、params.expect が 400 を返す
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article: input }),
  })
  if (response.status === 422) {
    const data = (await response.json()) as { errors: ArticleErrors }
    return { ok: false, errors: data.errors }
  }
  if (!response.ok) {
    throw new Error(`記事を作成できませんでした(${response.status})`)
  }
  return { ok: true, article: (await response.json()) as Article }
}
