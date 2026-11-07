import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia } from 'pinia'
import type { User } from 'firebase/auth'

import { fetchArticles, type Article } from '@/api/articles'
import ArticleListView from '../ArticleListView.vue'

// Firebase の SDK を偽物に差し替える。ストアがログイン状態を受け取る入口(App.spec.ts と同じ)
// vi.mock は import より先に動くので、偽物は vi.hoisted で先に作っておく
const firebaseAuth = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: class {},
}))
vi.mock('firebase/auth', () => firebaseAuth)
vi.mock('@/firebase', () => ({ auth: { name: 'fake-auth' } }))

// 記事の API を呼ぶ関数を偽物に差し替える。Rails とのやりとりは articles.spec.ts で確かめている
vi.mock('@/api/articles', () => ({ fetchArticles: vi.fn() }))

// API が返す順(新しい順)の記事
const articles: Article[] = [
  {
    id: 2,
    title: '新しい記事',
    body: '新しい本文',
    member_id: 1,
    created_at: '2026-11-07T10:00:00.000Z',
    updated_at: '2026-11-07T10:00:00.000Z',
  },
  {
    id: 1,
    title: '古い記事',
    body: '古い本文',
    member_id: 1,
    created_at: '2026-11-06T10:00:00.000Z',
    updated_at: '2026-11-06T10:00:00.000Z',
  },
]

// ストアが onAuthStateChanged に登録した関数を呼んで、Firebase からの知らせを再現する
async function notifyAuthState(user: User | null) {
  const listener = firebaseAuth.onAuthStateChanged.mock.lastCall?.[1]
  listener(user)
  await flushPromises()
}

// RouterLink は、本物の router なしで描けるように、行き先(to)だけを持つ偽物にする
async function mountView() {
  const wrapper = mount(ArticleListView, {
    global: { plugins: [createPinia()], stubs: { RouterLink: RouterLinkStub } },
  })
  // fetchArticles の結果を待つ
  await flushPromises()
  return wrapper
}

const member = { uid: 'uid-1' } as User

describe('ArticleListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchArticles).mockResolvedValue(articles)
  })

  it('記事のタイトル、本文、投稿日時を、API が返した順に表示する', async () => {
    const wrapper = await mountView()

    const items = wrapper.findAll('article')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('新しい記事')
    expect(items[0]!.text()).toContain('新しい本文')
    // Rails は UTC で返す。画面は日本時間で出す
    expect(items[0]!.text()).toContain('2026/11/7 19:00:00')
    expect(items[1]!.text()).toContain('古い記事')
  })

  it('記事が1件もない場合、「記事はまだありません」と表示する', async () => {
    vi.mocked(fetchArticles).mockResolvedValue([])

    const wrapper = await mountView()

    expect(wrapper.findAll('article')).toHaveLength(0)
    expect(wrapper.text()).toContain('記事はまだありません')
  })

  it('記事の一覧を取れなかった場合、エラーを表示する', async () => {
    vi.mocked(fetchArticles).mockRejectedValue(new Error('500'))

    const wrapper = await mountView()

    expect(wrapper.find('[role="alert"]').text()).toBe('記事を取得できませんでした')
  })

  it('ログインしている間、「記事を書く」のリンクを表示する', async () => {
    const wrapper = await mountView()

    await notifyAuthState(member)

    const link = wrapper.findComponent(RouterLinkStub)
    expect(link.text()).toBe('記事を書く')
    expect(link.props('to')).toBe('/articles/new')
  })

  it('未ログインの間、「記事を書く」のリンクを表示しない', async () => {
    const wrapper = await mountView()

    await notifyAuthState(null)

    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
