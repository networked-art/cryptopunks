import { type Ref, onScopeDispose, readonly, ref, watch } from 'vue'

export function useDebounced<T>(source: Ref<T>, delay: number) {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = value
      timer = null
    }, delay)
  })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return readonly(debounced) as Readonly<Ref<T>>
}
