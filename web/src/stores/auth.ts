import { shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'

import { auth } from '@/firebase'

// ログイン状態を画面のために写しておくストア。ログイン状態の本体は Firebase の SDK が持つ
export const useAuthStore = defineStore('auth', () => {
  // SDK が作った会員のオブジェクトを入れるので、入れ替わりだけを見張る shallowRef にする
  const user = shallowRef<User | null>(null)
  // 最初の知らせが来るまでは、ログインしているかどうかがまだ分からない
  const ready = shallowRef(false)

  // SDK からの「未ログイン」「ログイン中」の知らせを受けて、ログイン状態を写す。user を書き換えるのはここだけ
  onAuthStateChanged(auth, (currentUser) => {
    user.value = currentUser
    ready.value = true
  })

  // SDK にログインを頼む。失敗(ポップアップを閉じた、など)は、呼んだ画面に伝わる
  async function signIn() {
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  // SDK にログアウトを頼む
  async function signOut() {
    await firebaseSignOut(auth)
  }

  return { user, ready, signIn, signOut }
})
