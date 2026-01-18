"use client"

import { useLayoutEffect } from 'react'

type ScrollPosition = { top: number; left: number }

function parseScrollPosition(raw: string): ScrollPosition | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<ScrollPosition>
      const top = Number(parsed.top)
      const left = Number(parsed.left)
      if (!Number.isFinite(top) || !Number.isFinite(left)) return null
      return {
        top: Math.max(0, Math.floor(top)),
        left: Math.max(0, Math.floor(left)),
      }
    } catch {
      return null
    }
  }

  const top = Number.parseInt(trimmed, 10)
  if (Number.isNaN(top)) return null
  return { top: Math.max(0, top), left: 0 }
}

export function usePersistentScroll(
  key: string | null | undefined,
  enabled = true,
  getScrollElement?: () => HTMLElement | null,
) {
  useLayoutEffect(() => {
    if (!enabled || !key || typeof window === 'undefined') return

    const storageKey = `xplan:scroll:${key}`
    let restoreFrame = 0
    let saveFrame = 0
    let attachFrame = 0
    let attachedElement: HTMLElement | null = null

    const readPosition = (): ScrollPosition | null => {
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        if (raw == null) return null
        return parseScrollPosition(raw)
      } catch (error) {
        console.warn('[xplan] failed to read scroll position', storageKey, error)
        return null
      }
    }

    const writePosition = () => {
      try {
        if (getScrollElement) {
          const element = attachedElement ?? getScrollElement()
          if (!element) return
          attachedElement = element
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              top: Math.max(0, Math.floor(element.scrollTop)),
              left: Math.max(0, Math.floor(element.scrollLeft)),
            }),
          )
          return
        }

        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            top: Math.max(0, Math.floor(window.scrollY)),
            left: Math.max(0, Math.floor(window.scrollX)),
          }),
        )
      } catch (error) {
        console.warn('[xplan] failed to persist scroll position', storageKey, error)
      }
    }

    const scheduleSave = () => {
      if (saveFrame) cancelAnimationFrame(saveFrame)
      saveFrame = requestAnimationFrame(writePosition)
    }

    const restorePosition = (): boolean => {
      try {
        const position = readPosition()
        if (!position) return true

        if (getScrollElement) {
          const element = attachedElement ?? getScrollElement()
          if (!element) return false
          attachedElement = element
          element.scrollTop = position.top
          element.scrollLeft = position.left
          return true
        }

        window.scrollTo({ top: position.top, left: position.left })
        return true
      } catch (error) {
        console.warn('[xplan] failed to restore scroll position', storageKey, error)
        return true
      }
    }

    const attachListener = () => {
      if (!getScrollElement) return
      const element = getScrollElement()
      if (!element) {
        attachFrame = requestAnimationFrame(attachListener)
        return
      }
      attachedElement = element
      element.addEventListener('scroll', scheduleSave, { passive: true })
      restorePosition()
    }

    const attemptRestore = (attempt = 0) => {
      if (attempt > 24) return
      if (!restorePosition()) {
        restoreFrame = requestAnimationFrame(() => attemptRestore(attempt + 1))
      }
    }

    if (getScrollElement) {
      attachListener()
    } else {
      window.addEventListener('scroll', scheduleSave, { passive: true })
    }
    window.addEventListener('beforeunload', writePosition)
    window.addEventListener('pagehide', writePosition)

    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => attemptRestore())
    })

    return () => {
      if (restoreFrame) cancelAnimationFrame(restoreFrame)
      if (saveFrame) cancelAnimationFrame(saveFrame)
      if (attachFrame) cancelAnimationFrame(attachFrame)
      if (attachedElement && getScrollElement) {
        attachedElement.removeEventListener('scroll', scheduleSave)
      } else {
        window.removeEventListener('scroll', scheduleSave)
      }
      window.removeEventListener('beforeunload', writePosition)
      window.removeEventListener('pagehide', writePosition)
      writePosition()
    }
  }, [enabled, getScrollElement, key])
}
