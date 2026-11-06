import { auth } from '@/firebase'

// Rails の API を呼ぶ。ログインしていれば、ID トークンを Authorization に付けて送る
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const user = auth.currentUser
  if (user) {
    // 呼ぶたびに SDK に頼む。期限が近ければ、SDK が取り直してから渡す
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`)
  }
  return fetch(path, { ...init, headers })
}
