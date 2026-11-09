import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import type { User } from 'firebase/auth'

import App from '../App.vue'

// Firebase の SDK を偽物に差し替える。本物の Firebase には通信しない。
// vi.mock は import より先に動くので、偽物は vi.hoisted で先に作っておく
const firebaseAuth = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: class {},
}))
vi.mock('firebase/auth', () => firebaseAuth)
vi.mock('@/firebase', () => ({ auth: { name: 'fake-auth' } }))

// 画面を移す頼み(router.push)を受け取る偽物(ArticleNewView.spec.ts と同じ)
const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

// ストアが onAuthStateChanged に登録した関数を呼んで、Firebase からの知らせを再現する
async function notifyAuthState(user: User | null) {
  const listener = firebaseAuth.onAuthStateChanged.mock.lastCall?.[1]
  listener(user)
  await flushPromises()
}

// <RouterView> は、何も描かない偽物にする。差し込まれる画面は、それぞれのテストで確かめている
function mountApp() {
  return mount(App, { global: { plugins: [createPinia()], stubs: { RouterView: true } } })
}

const member = { uid: 'uid-1' } as User

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ログイン状態の確認中は、ボタンを出さない', () => {
    const wrapper = mountApp()

    // あえて notifyAuthState を呼ばない。Firebase の最初の知らせがまだ届いていない「確認中」の状態になる

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('未ログインのとき、「Google でログイン」のボタンを出す', async () => {
    const wrapper = mountApp()

    await notifyAuthState(null)

    expect(wrapper.find('button').text()).toBe('Google でログイン')
  })

  it('ログインのボタンを押したとき、Google のポップアップでログインする', async () => {
    const wrapper = mountApp()
    await notifyAuthState(null)

    await wrapper.find('button').trigger('click')

    expect(firebaseAuth.signInWithPopup).toHaveBeenCalled()
  })

  it('ログイン中は、ログアウトのボタンを出す', async () => {
    const wrapper = mountApp()

    await notifyAuthState(member)

    expect(wrapper.find('button').text()).toBe('ログアウト')
  })

  it('ログアウトのボタンを押したとき、ログアウトして一覧画面に移る', async () => {
    const wrapper = mountApp()
    await notifyAuthState(member)

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(firebaseAuth.signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
  })
})
