import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

import { createArticle } from '@/api/articles'
import ArticleNewView from '../ArticleNewView.vue'

// 記事の API を呼ぶ関数を偽物に差し替える。Rails とのやりとりは articles.spec.ts で確かめている
vi.mock('@/api/articles', () => ({ createArticle: vi.fn() }))

// 画面を移す頼み(router.push)を受け取る偽物。どこへ移ろうとしたかだけを見る
// vi.mock は import より先に動くので、偽物は vi.hoisted で先に作っておく
const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const article = {
  id: 1,
  title: 'タイトル',
  body: '本文',
  member_id: 1,
  created_at: '2026-11-07T10:00:00.000Z',
  updated_at: '2026-11-07T10:00:00.000Z',
}

// タイトルと本文を入れて、フォームを送る
async function submit(wrapper: VueWrapper, title = 'タイトル', body = '本文') {
  await wrapper.find('input[name="title"]').setValue(title)
  await wrapper.find('textarea[name="body"]').setValue(body)
  await wrapper.find('form').trigger('submit')
  // createArticle の結果を待つ
  await flushPromises()
}

describe('ArticleNewView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createArticle).mockResolvedValue({ ok: true, article })
  })

  it('タイトルと本文は空では送れず、タイトルは100文字までしか入らない', () => {
    const wrapper = mount(ArticleNewView)

    const title = wrapper.find('input[name="title"]')
    expect(title.attributes('required')).toBeDefined()
    expect(title.attributes('maxlength')).toBe('100')
    expect(wrapper.find('textarea[name="body"]').attributes('required')).toBeDefined()
  })

  it('記事が保存されたとき、一覧画面に移る', async () => {
    const wrapper = mount(ArticleNewView)

    await submit(wrapper, 'タイトル', '本文')

    expect(createArticle).toHaveBeenCalledWith({ title: 'タイトル', body: '本文' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('送ってから応答が返るまで、送るボタンを押せない', async () => {
    // 返事が来ないままの createArticle にして、応答を待っている状態を作る
    vi.mocked(createArticle).mockReturnValue(new Promise(() => {}))
    const wrapper = mount(ArticleNewView)
    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeUndefined()

    await submit(wrapper)

    expect(button.attributes('disabled')).toBeDefined()
  })

  it('422 の場合、項目ごとのエラーを表示し、投稿画面に留まる', async () => {
    vi.mocked(createArticle).mockResolvedValue({
      ok: false,
      errors: { title: ["can't be blank"], body: ["can't be blank"] },
    })
    const wrapper = mount(ArticleNewView)

    await submit(wrapper)

    expect(wrapper.text()).toContain("タイトル:can't be blank")
    expect(wrapper.text()).toContain("本文:can't be blank")
    expect(push).not.toHaveBeenCalled()
  })

  it('記事を保存できなかった場合、エラーを表示し、投稿画面に留まる', async () => {
    vi.mocked(createArticle).mockRejectedValue(new Error('401'))
    const wrapper = mount(ArticleNewView)

    await submit(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toBe('投稿できませんでした')
    expect(push).not.toHaveBeenCalled()
  })
})
