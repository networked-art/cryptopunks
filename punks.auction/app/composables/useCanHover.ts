/**
 * Whether the *last* pointer used was hover-capable. The `(hover: hover)` media
 * query only describes the primary pointer, so it stays true on hybrid
 * touch+mouse laptops even mid-tap — which leaves CSS `:hover` sticking to a
 * recycled cell on touch. Following the last `pointerType` instead suppresses
 * hover on a touch tap and restores it on the next mouse move.
 *
 * The state is a module-level singleton: the listeners attach once for the
 * whole app (input-type tracking is genuinely global) and live for its
 * lifetime, so there is nothing to tear down per component.
 */
const canHover = ref(true)
let started = false

function onPointer(event: PointerEvent) {
  canHover.value = event.pointerType !== 'touch'
}

export function useCanHover() {
  if (import.meta.client && !started) {
    started = true
    canHover.value = window.matchMedia('(hover: hover)').matches
    const opts = { passive: true, capture: true } as const
    window.addEventListener('pointerdown', onPointer, opts) // catches the tap
    window.addEventListener('pointerover', onPointer, opts) // restores on mouse move
  }
  return readonly(canHover)
}
