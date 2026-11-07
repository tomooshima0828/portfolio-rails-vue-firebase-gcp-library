import { createRouter, createWebHistory } from 'vue-router'

import { auth } from '@/firebase'
import ArticleListView from '@/views/ArticleListView.vue'
import ArticleNewView from '@/views/ArticleNewView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: ArticleListView },
    // ログインが必要な画面には requiresAuth を付ける。下のガードがこれを見る
    { path: '/articles/new', component: ArticleNewView, meta: { requiresAuth: true } },
  ],
})

// 画面を開く前に通る関所。ログインが必要な画面は、未ログインなら一覧画面に移す
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return
  // 開き直した直後は、SDK が保存したログイン状態をまだ読み込んでいない。読み込み終わるまで待つ
  await auth.authStateReady()
  if (!auth.currentUser) return '/'
})

export default router
