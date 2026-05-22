export function punkSearchHref(text: string) {
  return { path: '/punks', query: { q: text } }
}

export function quoteIfMultiword(text: string) {
  return /\s/.test(text) ? `"${text}"` : text
}
