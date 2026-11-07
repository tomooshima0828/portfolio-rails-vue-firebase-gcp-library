<script setup lang="ts">
import { shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const error = shallowRef<string | null>(null)

async function signIn() {
  error.value = null
  try {
    await authStore.signIn()
  } catch {
    error.value = 'ログインできませんでした'
  }
}

// ログアウトしたら一覧画面に移す。ガードは画面を開くときにしか働かないので、投稿画面に残らないようにする
async function signOut() {
  await authStore.signOut()
  await router.push('/')
}
</script>

<template>
  <header>
    <!-- ログイン状態の確認が終わるまでは、ボタンを出さない -->
    <template v-if="authStore.authStateReady">
      <button v-if="authStore.user" type="button" @click="signOut">ログアウト</button>
      <button v-else type="button" @click="signIn">Google でログイン</button>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </header>
  <main>
    <RouterView />
  </main>
</template>
