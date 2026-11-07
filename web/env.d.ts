/// <reference types="vite/client" />

interface ViteTypeOptions {
  // 宣言していない名前の import.meta.env を、型のエラーにする
  strictImportMetaEnv: unknown
}

// compose.yaml から渡す、Firebase の設定値(見本は .env.example)
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
