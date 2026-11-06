import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// .env の設定値を渡して、どの Firebase のプロジェクトとやりとりするかを覚えた app を作る
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

// ログインの窓口。ストアと apiFetch が同じ1つの auth を見るように、ここで1回だけ作る
export const auth = getAuth(app)
