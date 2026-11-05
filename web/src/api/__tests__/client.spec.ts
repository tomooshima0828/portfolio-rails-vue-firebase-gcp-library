import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { apiFetch } from '../client'

// Firebase の Auth を偽物に差し替える。currentUser に偽物の会員を入れると、ログイン中として扱われる
const fakeAuth = vi.hoisted(() => ({
  currentUser: null as { getIdToken: () => Promise<string> } | null,
}))
vi.mock('@/firebase', () => ({ auth: fakeAuth }))

// ブラウザの fetch の代わり。Rails には通信しない
const fetchMock = vi.fn()

function signIn() {
  fakeAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue('fake-id-token') }
}

// 最後に fetch へ渡されたオプション
function sentInit(): RequestInit {
  return fetchMock.mock.lastCall?.[1]
}

function sentHeaders(): Headers {
  return new Headers(sentInit().headers)
}

describe('apiFetch', () => {
  beforeEach(() => {
    fakeAuth.currentUser = null
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ログインしている間、ID トークンを Authorization: Bearer に付けて送る', async () => {
    signIn()

    await apiFetch('/api/me')

    expect(fetchMock.mock.lastCall?.[0]).toBe('/api/me')
    expect(sentHeaders().get('Authorization')).toBe('Bearer fake-id-token')
  })

  it('未ログインの間、Authorization を付けない', async () => {
    await apiFetch('/api/articles')

    expect(fetchMock.mock.lastCall?.[0]).toBe('/api/articles')
    expect(sentHeaders().has('Authorization')).toBe(false)
  })

  it('呼ぶ側が渡したオプションは、そのまま送る', async () => {
    signIn()
    const body = JSON.stringify({ article: { title: 'タイトル', body: '本文' } })

    await apiFetch('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    expect(sentInit().method).toBe('POST')
    expect(sentInit().body).toBe(body)
    expect(sentHeaders().get('Content-Type')).toBe('application/json')
    expect(sentHeaders().get('Authorization')).toBe('Bearer fake-id-token')
  })

  it('fetch が返した Response を、そのまま返す', async () => {
    const response = new Response('{"error":"unauthorized"}', { status: 401 })
    fetchMock.mockResolvedValue(response)

    expect(await apiFetch('/api/me')).toBe(response)
  })
})
