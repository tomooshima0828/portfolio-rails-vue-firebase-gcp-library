import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // /api へのリクエストを、Docker Compose のネットワークの中の Rails へ転送する
      '/api': {
        target: 'http://api:3000',
        // Host ヘッダーを書き換えない。文字列だけの書き方('/api': 'http://api:3000')だと
        // Vite は true にし、Host が api:3000 になって、Rails の開発環境の Host の確認で弾かれる
        changeOrigin: false,
      },
    },
  },
})
