import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { User } from 'firebase/auth'

import { auth } from '@/firebase'
import { useAuthStore } from '../auth'

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

// ストアが onAuthStateChanged に登録した関数を呼んで、Firebase からの知らせを再現する
function notifyAuthState(user: User | null) {
  const listener = firebaseAuth.onAuthStateChanged.mock.lastCall?.[1]
  listener(user)
}

const member = { uid: 'uid-1' } as User

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('Firebase からログイン状態が知らされるまでは、確認中で、未ログインとして扱う', () => {
    const store = useAuthStore()

    expect(store.ready).toBe(false)
    expect(store.user).toBeNull()
  })

  it('ログインしている会員が知らされたとき、その会員を持ち、確認を終える', () => {
    const store = useAuthStore()

    notifyAuthState(member)

    expect(store.user).toEqual(member)
    expect(store.ready).toBe(true)
  })

  it('未ログインが知らされたとき、未ログインのまま、確認を終える', () => {
    const store = useAuthStore()

    notifyAuthState(null)

    expect(store.user).toBeNull()
    expect(store.ready).toBe(true)
  })

  it('ログインするとき、Google のプロバイダーで signInWithPopup を呼ぶ', async () => {
    const store = useAuthStore()

    await store.signIn()

    expect(firebaseAuth.signInWithPopup).toHaveBeenCalledWith(
      auth,
      expect.any(firebaseAuth.GoogleAuthProvider),
    )
  })

  it('ログアウトするとき、Firebase の signOut を呼ぶ', async () => {
    const store = useAuthStore()

    await store.signOut()

    expect(firebaseAuth.signOut).toHaveBeenCalledWith(auth)
  })
})
