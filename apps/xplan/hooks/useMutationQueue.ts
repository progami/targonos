import { MutableRefObject, useCallback, useRef } from 'react'

export interface MutationQueueOptions<TKey, TValue> {
  debounceMs?: number
  onFlush: (payload: TValue[]) => Promise<void> | void
  onError?: (error: unknown) => void
  makeKey?: (value: TValue) => TKey
}

export interface MutationQueueHandle<TKey, TValue> {
  pendingRef: MutableRefObject<Map<TKey, TValue>>
  scheduleFlush: () => void
  flushNow: () => Promise<void>
  cancelFlush: () => void
}

export function useMutationQueue<TKey, TValue>(
  options: MutationQueueOptions<TKey, TValue>,
): MutationQueueHandle<TKey, TValue> {
  const { debounceMs = 600, onFlush, onError } = options
  const pendingRef = useRef<Map<TKey, TValue>>(new Map())
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const flushNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const payload = Array.from(pendingRef.current.values())
    pendingRef.current.clear()
    if (payload.length === 0) return
    try {
      await onFlush(payload)
    } catch (error) {
      onError?.(error)
    }
  }, [onFlush, onError])

  const scheduleFlush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      flushNow().catch(() => {
        // error already routed via onError
      })
    }, debounceMs)
  }, [debounceMs, flushNow])

  const cancelFlush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  return { pendingRef, scheduleFlush, flushNow, cancelFlush }
}
