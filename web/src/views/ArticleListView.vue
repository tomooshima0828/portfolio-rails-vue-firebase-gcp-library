<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

import { fetchArticles, type Article } from '@/api/articles'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
// 取ってくるまでは null。「まだ取っていない」と「記事が0件」を区別するため
const articles = shallowRef<Article[] | null>(null)
const error = shallowRef<string | null>(null)

// Rails は UTC で返すので、日本時間に固定して出す。固定しないと、ブラウザと CI で表示が変わる
function formatDate(value: string) {
  return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

// 画面が出たときに、記事の一覧を取ってくる
onMounted(async () => {
  try {
    articles.value = await fetchArticles()
  } catch {
    error.value = '記事を取得できませんでした'
  }
})
</script>

<template>
  <section>
    <h1>記事の一覧</h1>
    <RouterLink v-if="authStore.user" to="/articles/new">記事を書く</RouterLink>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-else-if="articles">
      <p v-if="articles.length === 0">記事はまだありません</p>
      <article v-for="article in articles" :key="article.id">
        <h2>{{ article.title }}</h2>
        <p>{{ article.body }}</p>
        <time :datetime="article.created_at">{{ formatDate(article.created_at) }}</time>
      </article>
    </template>
  </section>
</template>
