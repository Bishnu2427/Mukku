/**
 * Per-route document metadata.
 *
 * Until now every route shared the single <title> baked into index.html, so
 * Google saw one page and browser tabs were indistinguishable. This sets the
 * title, description, canonical URL and robots directive per route, and
 * restores the previous values on unmount so navigating back never leaves
 * stale metadata behind.
 *
 * Deliberately not react-helmet: that is ~16 kB for what amounts to four DOM
 * writes, and this app renders client-side so there is no SSR benefit to buy.
 *
 * Note this does not help crawlers that do not execute JavaScript. The landing
 * page keeps its full metadata and JSON-LD hard-coded in index.html for that
 * reason; this is for the routes a crawler reaches after hydration.
 */

import { useEffect } from 'react'

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  const previous = el.getAttribute('content')
  el.setAttribute('content', value)
  return () => {
    if (previous === null) el?.remove()
    else el?.setAttribute('content', previous)
  }
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  const created = !el
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  const previous = el.getAttribute('href')
  el.setAttribute('href', href)
  return () => {
    if (created) el?.remove()
    else if (previous) el?.setAttribute('href', previous)
  }
}

export function Seo({
  title,
  description,
  canonical,
  noindex = false,
}: {
  title: string
  description?: string
  /** Path only, e.g. "/privacy". Resolved against the current origin. */
  canonical?: string
  /** Set on pages that should stay out of search results. */
  noindex?: boolean
}) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const undo: Array<() => void> = []

    if (description) {
      undo.push(setMeta('meta[name="description"]', 'name', 'description', description))
      undo.push(setMeta('meta[property="og:description"]', 'property', 'og:description', description))
    }
    undo.push(setMeta('meta[property="og:title"]', 'property', 'og:title', title))

    if (canonical) {
      const href = new URL(canonical, window.location.origin).toString()
      undo.push(setLink('canonical', href))
      undo.push(setMeta('meta[property="og:url"]', 'property', 'og:url', href))
    }

    if (noindex) {
      undo.push(setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow'))
    }

    return () => {
      document.title = previousTitle
      // Unwind in reverse so nested writes restore cleanly.
      for (let i = undo.length - 1; i >= 0; i--) undo[i]()
    }
  }, [title, description, canonical, noindex])

  return null
}
