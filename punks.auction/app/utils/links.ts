import type { RouteLocationRaw } from 'vue-router'

/// `target`/`rel` for a link that may leave the app (e.g. V1 punks →
/// OpenSea): absolute URLs open in a new tab, internal routes get nothing.
export function linkTarget(to?: RouteLocationRaw): {
  target?: '_blank'
  rel?: string
} {
  return typeof to === 'string' && to.startsWith('http')
    ? { target: '_blank', rel: 'noopener' }
    : {}
}
