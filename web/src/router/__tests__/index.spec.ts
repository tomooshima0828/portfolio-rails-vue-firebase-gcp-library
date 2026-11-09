import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import router from '..'

// Firebase の Auth を偽物に差し替える。currentUser に会員を入れると、ログイン中として扱われる
const fakeAuth = vi.hoisted(() => ({
  currentUser: null as object | null,
  authStateReady: vi.fn(),
}))
vi.mock('@/firebase', () => ({ auth: fakeAuth }))

// 画面の中身は、このテストでは使わない。何も描かない画面に差し替える
vi.mock('@/views/ArticleListView.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/ArticleNewView.vue', () => ({ default: { render: () => null } }))

// 今開いている画面の、登録したときのパス。登録していないパスに移った場合は undefined になる
// (router は、登録していないパスにも移れてしまうため、currentRoute.value.path では確かめられない)
function openedRoutePath() {
  return router.currentRoute.value.matched[0]?.path
}

describe('ログインのガード', () => {
  beforeEach(async () => {
    fakeAuth.currentUser = null
    fakeAuth.authStateReady.mockResolvedValue(undefined)
    // router はテストの間で1つを使い回すので、毎回、一覧画面から始める
    await router.push('/')
  })

  it('未ログインの会員が /articles/new を開いたとき、一覧画面に移す', async () => {
    await router.push('/articles/new')

    expect(openedRoutePath()).toBe('/')
  })

  it('ログインしている会員が /articles/new を開いたとき、投稿画面を開く', async () => {
    fakeAuth.currentUser = { uid: 'uid-1' }

    await router.push('/articles/new')

    expect(openedRoutePath()).toBe('/articles/new')
  })

  it('ログイン状態の確認が終わるのを待ってから、開くかどうかを決める', async () => {
    // 確認が終わったと知らせる関数を、テストの側で持っておく
    let finishCheck!: () => void
    fakeAuth.authStateReady.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCheck = resolve
      }),
    )

    const navigation = router.push('/articles/new')
    await flushPromises()
    // 確認中は、まだどの画面にも移らない
    expect(openedRoutePath()).toBe('/')

    // 確認が終わり、ログインしていると分かった
    fakeAuth.currentUser = { uid: 'uid-1' }
    finishCheck()
    await navigation

    expect(openedRoutePath()).toBe('/articles/new')
  })
})
