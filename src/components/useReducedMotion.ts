import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(cb: () => void) {
  if (typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia(QUERY)
  mq.addEventListener?.('change', cb)
  return () => mq.removeEventListener?.('change', cb)
}

const get = () => (typeof matchMedia === 'function' ? matchMedia(QUERY).matches : false)

/** True when the person has asked for reduced motion; updates live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, get, () => false)
}
