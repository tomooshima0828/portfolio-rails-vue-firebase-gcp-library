import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import type { User } from 'firebase/auth'

import { apiFetch } from '@/api/client'
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

// API を呼ぶ関数を偽物に差し替える。トークンを付ける処理は client.spec.ts で確かめている
vi.mock('@/api/client', () => ({ apiFetch: vi.fn() }))

// ストアが onAuthStateChanged に登録した関数を呼んで、Firebase からの知らせを再現する
async function notifyAuthState(user: User | null) {
  const listener = firebaseAuth.onAuthStateChanged.mock.lastCall?.[1]
  listener(user)
  // 画面の更新と、/api/me の応答を待つ
  await flushPromises()
}

function mountApp() {
  return mount(App, { global: { plugins: [createPinia()] } })
}

const member = { uid: 'uid-1' } as User

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 1, firebase_uid: 'uid-1' }), { status: 200 }),
    )
  })

  it('ログイン状態の確認中は、ボタンを出さない', () => {
    const wrapper = mountApp()

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

  it('ログイン中は、/api/me が返した会員の id と、ログアウトのボタンを出す', async () => {
    const wrapper = mountApp()

    await notifyAuthState(member)

    expect(apiFetch).toHaveBeenCalledWith('/api/me')
    expect(wrapper.text()).toContain('会員 ID:1')
    expect(wrapper.find('button').text()).toBe('ログアウト')
  })

  it('ログアウトのボタンを押したとき、ログアウトする', async () => {
    const wrapper = mountApp()
    await notifyAuthState(member)

    await wrapper.find('button').trigger('click')

    expect(firebaseAuth.signOut).toHaveBeenCalled()
  })

  it('/api/me が失敗したとき、エラーを出す', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response('{"error":"unauthorized"}', { status: 401 }),
    )
    const wrapper = mountApp()

    await notifyAuthState(member)

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})
