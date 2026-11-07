import { describe, it, expect, vi, beforeEach } from 'vitest'

import { apiFetch } from '@/api/client'
import { createArticle, fetchArticles } from '../articles'

// apiFetch を偽物に差し替える。ID トークンを付ける処理は client.spec.ts で確かめている
vi.mock('@/api/client', () => ({ apiFetch: vi.fn() }))

const article = {
  id: 1,
  title: 'タイトル',
  body: '本文',
  member_id: 1,
  created_at: '2026-11-07T10:00:00.000Z',
  updated_at: '2026-11-07T10:00:00.000Z',
}

// apiFetch が返す Rails の応答を決める
function respond(body: unknown, status: number) {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

// 最後に apiFetch へ渡されたパスとオプション
function sent() {
  const [path, init = {}] = vi.mocked(apiFetch).mock.lastCall!
  return { path, init, headers: new Headers(init.headers) }
}

describe('fetchArticles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /api/articles が返した記事の配列を返す', async () => {
    respond({ articles: [article] }, 200)

    expect(await fetchArticles()).toEqual([article])
    expect(sent().path).toBe('/api/articles')
    expect(sent().init.method ?? 'GET').toBe('GET')
  })

  it('失敗した場合、エラーを投げる', async () => {
    respond({}, 500)

    await expect(fetchArticles()).rejects.toThrow()
  })
})

describe('createArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('タイトルと本文を JSON にして、POST /api/articles に送る', async () => {
    respond(article, 201)

    await createArticle({ title: 'タイトル', body: '本文' })

    expect(sent().path).toBe('/api/articles')
    expect(sent().init.method).toBe('POST')
    expect(sent().headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(sent().init.body as string)).toEqual({
      article: { title: 'タイトル', body: '本文' },
    })
  })

  it('保存されたとき、保存した記事を返す', async () => {
    respond(article, 201)

    expect(await createArticle({ title: 'タイトル', body: '本文' })).toEqual({
      ok: true,
      article,
    })
  })

  it('422 の場合、項目ごとのエラーを返す', async () => {
    const errors = { title: ["can't be blank"] }
    respond({ errors }, 422)

    expect(await createArticle({ title: '', body: '本文' })).toEqual({ ok: false, errors })
  })

  it('422 以外の失敗の場合、エラーを投げる', async () => {
    respond({ error: 'unauthorized' }, 401)

    await expect(createArticle({ title: 'タイトル', body: '本文' })).rejects.toThrow()
  })
})
