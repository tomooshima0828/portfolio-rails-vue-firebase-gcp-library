<script setup lang="ts">
import { shallowRef, watch } from 'vue'

import { apiFetch } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const memberId = shallowRef<number | null>(null)
const error = shallowRef<string | null>(null)

// ログイン中になったら、Rails に会員の id を聞く(場面 3)。未ログインになったら消す
// ログインしたとき(場面 2)と、開き直したとき(場面 5)の両方を、user の変化で拾う
watch(
  () => authStore.user,
  async (user) => {
    memberId.value = null
    error.value = null
    if (!user) return
    try {
      const response = await apiFetch('/api/me')
      if (!response.ok) {
        error.value = `会員の情報を取得できませんでした(${response.status})`
        return
      }
      const member = (await response.json()) as { id: number }
      memberId.value = member.id
    } catch {
      error.value = '会員の情報を取得できませんでした'
    }
  },
  { immediate: true },
)

async function signIn() {
  error.value = null
  try {
    await authStore.signIn()
  } catch {
    error.value = 'ログインできませんでした'
  }
}
</script>

<template>
  <!-- ログイン状態の確認が終わるまでは、何も出さない -->
  <main v-if="authStore.ready">
    <template v-if="authStore.user">
      <p v-if="memberId !== null">会員 ID:{{ memberId }}</p>
      <button type="button" @click="authStore.signOut()">ログアウト</button>
    </template>
    <button v-else type="button" @click="signIn">Google でログイン</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </main>
</template>
