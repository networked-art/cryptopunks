import { effectScope, type Ref } from 'vue'

const YEAR_SECONDS = 60 * 60 * 24 * 365

// The networked.art API returns its Adonis bearer token in the JSON body of the
// email/SIWE verify calls; we persist that copy here and replay it as an
// `Authorization: Bearer` header. This is punks.auction's own first-party
// cookie — distinct from the API's `na_bearer`, which is httpOnly and on the
// API origin, so JS here could never read it. We reuse networked.art's app
// cookie name (`na_auth_token`) only for cross-app consistency.
export const NETWORKED_API_TOKEN_COOKIE = 'na_auth_token'

type TokenNuxtApp = ReturnType<typeof useNuxtApp> & {
  _naAuthTokenRef?: Ref<string | null>
}

/**
 * `useCookie` returns a fresh ref per call, and sibling refs only resync via an
 * async BroadcastChannel — so a write in one ref isn't visible to a read in
 * another within the same tick. Sign-in sets the token and immediately reads it
 * back to fetch `/auth/me`, so we cache a single ref on the Nuxt app (in a
 * detached effect scope so a component unmounting never disposes it) and hand
 * it to every caller. Mirrors networked.art's `useAuthToken`.
 */
export const useNetworkedArtToken = (): Ref<string | null> => {
  const nuxtApp = useNuxtApp() as TokenNuxtApp
  if (nuxtApp._naAuthTokenRef) return nuxtApp._naAuthTokenRef

  const scope = effectScope(true)
  const cookie = scope.run(() =>
    useCookie<string | null>(NETWORKED_API_TOKEN_COOKIE, {
      default: () => null,
      maxAge: YEAR_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: !import.meta.dev,
      watch: true,
    }),
  )!
  nuxtApp._naAuthTokenRef = cookie
  return cookie
}
