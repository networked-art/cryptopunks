import { getApiUrl, isApiConfigured } from '~/utils/api'

export interface NetworkedArtAddress {
  address: `0x${string}`
  is_primary: boolean
  verified_at: string | null
  ens_name: string | null
}

export interface NetworkedArtUser {
  username: string | null
  display_name: string | null
  email: string | null
  email_verified_at: string | null
  addresses: NetworkedArtAddress[]
}

export interface NetworkedArtSession {
  token: string
  expires_at: string | null
  user: NetworkedArtUser
}

function statusOf(error: unknown): number | undefined {
  const e = error as { statusCode?: number; response?: { status?: number } }
  return e.statusCode ?? e.response?.status
}

type ApiNuxtApp = ReturnType<typeof useNuxtApp> & {
  _naApi?: ReturnType<typeof $fetch.create>
}

/**
 * The punks.auction ↔ networked.art account link. The API issues an Adonis
 * bearer token after email or SIWE sign-in; we keep it in the `na_auth_token`
 * cookie (see useNetworkedArtToken) and send it as a Bearer header. Cross-origin
 * SIWE also needs the API's `adonis-session` cookie (it holds the nonce) to
 * round-trip, so every request includes credentials.
 *
 * Everything here assumes `isConfigured` — callers gate the whole feature on it.
 */
export const useNetworkedArt = () => {
  const token = useNetworkedArtToken()
  const user = useState<NetworkedArtUser | null>('na:user', () => null)
  const ready = useState<boolean>('na:ready', () => false)
  const pending = useState<boolean>('na:pending', () => false)

  const isConfigured = isApiConfigured()
  const isAuthenticated = computed(() => !!user.value)

  // One shared client across every useNetworkedArt()/useWatchlist() call, cached
  // on the Nuxt app (per-request on the server). It reads the latest token off
  // the same cached ref on each request, and includes credentials so the API's
  // `adonis-session` cookie (which holds the SIWE nonce) round-trips.
  const nuxtApp = useNuxtApp() as ApiNuxtApp
  const api = (nuxtApp._naApi ??= $fetch.create({
    baseURL: getApiUrl(),
    credentials: 'include',
    onRequest({ options }) {
      const value = token.value
      if (!value) return
      const headers = new Headers(options.headers as HeadersInit | undefined)
      if (!headers.has('authorization')) {
        headers.set('authorization', `Bearer ${value}`)
      }
      options.headers = headers
    },
  }))

  const applySession = (session: NetworkedArtSession) => {
    token.value = session.token
    user.value = session.user
    ready.value = true
  }

  /** Load the linked account from the stored token; drop it on 401/403. */
  const refresh = async () => {
    if (!isConfigured) return
    const current = token.value
    if (!current) {
      user.value = null
      ready.value = true
      return
    }
    pending.value = true
    try {
      const { user: me } = await api<{ user: NetworkedArtUser }>('/auth/me')
      // A newer sign-in/sign-out may have replaced the token mid-flight.
      if (token.value !== current) return
      user.value = me
    } catch (error) {
      if (token.value !== current) return
      user.value = null
      const status = statusOf(error)
      if (status === 401 || status === 403) token.value = null
    } finally {
      ready.value = true
      pending.value = false
    }
  }

  // ---- SIWE ----

  /** Challenge from the API; the nonce is also stashed in its session cookie. */
  const getNonce = async () => {
    const { nonce } = await api<{ nonce: string }>('/auth/nonce')
    return nonce
  }

  /** `verify` callback for the layer's `useSiwe().signIn()`; signs us in. */
  const verifySiwe = async (message: string, signature: string) => {
    const session = await api<NetworkedArtSession>('/auth/siwe/verify', {
      method: 'POST',
      body: { message, signature },
    })
    applySession(session)
    return true
  }

  // ---- Email PIN ----

  const requestEmailCode = (email: string) =>
    api<{ ok: true; expires_at: string }>('/auth/email/request', {
      method: 'POST',
      body: { email },
    })

  const verifyEmailCode = async (email: string, code: number) => {
    const session = await api<NetworkedArtSession>('/auth/email/verify', {
      method: 'POST',
      body: { email, code },
    })
    applySession(session)
    return session
  }

  const signOut = async () => {
    try {
      if (token.value) await api('/auth/signout', { method: 'POST' })
    } catch {
      // Best-effort server-side revoke; we clear locally regardless.
    }
    token.value = null
    user.value = null
  }

  return {
    isConfigured,
    token,
    user,
    ready,
    pending,
    isAuthenticated,
    api,
    refresh,
    getNonce,
    verifySiwe,
    requestEmailCode,
    verifyEmailCode,
    signOut,
  }
}
