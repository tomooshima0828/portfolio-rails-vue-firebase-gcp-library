<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import { createArticle, type ArticleErrors } from '@/api/articles'

const router = useRouter()
const title = shallowRef('')
const body = shallowRef('')
// 送ってから応答が返るまで true。ボタンを2回押して、同じ記事が2件保存されるのを防ぐ
const submitting = shallowRef(false)
// 422 のときに Rails が返した、項目ごとのエラー
const fieldErrors = shallowRef<ArticleErrors>({})
// 422 以外で保存できなかったときの文
const error = shallowRef<string | null>(null)

// Rails の項目名を、画面の言葉にする
const fieldLabels: Record<string, string> = { title: 'タイトル', body: '本文' }

// 項目ごとのエラーを、「タイトル:can't be blank」の形の文の並びにする
const fieldErrorMessages = computed(() =>
  Object.entries(fieldErrors.value).flatMap(([field, messages]) =>
    messages.map((message) => `${fieldLabels[field] ?? field}:${message}`),
  ),
)

async function submit() {
  submitting.value = true
  fieldErrors.value = {}
  error.value = null
  try {
    const result = await createArticle({ title: title.value, body: body.value })
    if (result.ok) {
      await router.push('/')
      return
    }
    fieldErrors.value = result.errors
  } catch {
    error.value = '投稿できませんでした'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section>
    <h1>記事を書く</h1>
    <form @submit.prevent="submit">
      <label>
        タイトル
        <input v-model="title" name="title" required maxlength="100" />
      </label>
      <label>
        本文
        <textarea v-model="body" name="body" required></textarea>
      </label>
      <button type="submit" :disabled="submitting">投稿する</button>
    </form>
    <ul v-if="fieldErrorMessages.length > 0">
      <li v-for="message in fieldErrorMessages" :key="message">{{ message }}</li>
    </ul>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
