import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, videos } from '@/lib/api'
import { POLL_MS, PROMPT_MAX, PROMPT_MIN, WAIT_MESSAGES } from '@/lib/constants'
import type { ProjectStatus, Settings } from '@/lib/types'

export type Phase = 'idle' | 'running' | 'done' | 'failed'

export interface GenerationState {
  phase: Phase
  projectId: string | null
  status: ProjectStatus | null
  /** Inline error for the composer (validation, quota, network). */
  error: string | null
  /** Terminal pipeline failure — shown on the error card. */
  failure: string | null
  quotaExceeded: boolean
  waitMessage: string
}

/**
 * Owns the full generate → poll → resolve lifecycle.
 *
 * Mirrors the legacy script.js behaviour exactly:
 *   · POST /generate (JSON, or multipart when files are attached)
 *   · 401 → caller redirects to /login
 *   · 402 quota_exceeded → inline upgrade prompt, not a thrown error
 *   · poll GET /status/{id} every 3s until completed | failed
 *   · rotate an encouraging message every 5s while a stage runs
 */
export function useGeneration(onUnauthorized: () => void) {
  const [state, setState] = useState<GenerationState>({
    phase: 'idle',
    projectId: null,
    status: null,
    error: null,
    failure: null,
    quotaExceeded: false,
    waitMessage: '',
  })

  const pollRef = useRef<number | null>(null)
  const msgRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stepRef = useRef<string>('')
  const msgIndexRef = useRef(0)

  const stopTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (msgRef.current) { clearInterval(msgRef.current); msgRef.current = null }
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => stopTimers, [stopTimers])

  /** Rotate reassurance copy whenever the pipeline enters a new stage. */
  const startWaitMessages = useCallback((step: string) => {
    if (stepRef.current === step) return
    stepRef.current = step
    msgIndexRef.current = 0
    if (msgRef.current) { clearInterval(msgRef.current); msgRef.current = null }

    const pool = WAIT_MESSAGES[step]
    if (!pool?.length) {
      setState((s) => ({ ...s, waitMessage: '' }))
      return
    }
    const show = () => {
      const list = WAIT_MESSAGES[stepRef.current] ?? []
      if (!list.length) return
      setState((s) => ({ ...s, waitMessage: list[msgIndexRef.current % list.length] }))
      msgIndexRef.current += 1
    }
    show()
    msgRef.current = window.setInterval(show, 5000)
  }, [])

  const poll = useCallback(
    async (projectId: string) => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const data = await videos.status(projectId, ac.signal)
        setState((s) => ({ ...s, status: data }))

        if (data.current_step && data.status === 'processing') {
          startWaitMessages(data.current_step)
        }

        if (data.status === 'completed') {
          stopTimers()
          setState((s) => ({ ...s, phase: 'done', waitMessage: '' }))
        } else if (data.status === 'failed') {
          stopTimers()
          setState((s) => ({
            ...s,
            phase: 'failed',
            waitMessage: '',
            failure: data.error || 'An unknown error occurred during generation.',
          }))
        }
      } catch (err) {
        // Transient poll failures are normal on a long job — keep polling
        // rather than tearing the UI down. Only abort is silent.
        if ((err as Error)?.name === 'AbortError') return
        console.warn('status poll failed', err)
      }
    },
    [startWaitMessages, stopTimers],
  )

  const start = useCallback(
    async (prompt: string, settings: Settings, files: File[]) => {
      const trimmed = prompt.trim()
      if (!trimmed) {
        setState((s) => ({ ...s, error: 'Please describe your video before generating.' }))
        return
      }
      if (trimmed.length < PROMPT_MIN) {
        setState((s) => ({ ...s, error: 'Your prompt is too short — add a little more detail.' }))
        return
      }
      if (trimmed.length > PROMPT_MAX) {
        setState((s) => ({ ...s, error: `Prompt is too long (max ${PROMPT_MAX} characters).` }))
        return
      }

      stopTimers()
      stepRef.current = ''
      setState({
        phase: 'running', projectId: null, status: null,
        error: null, failure: null, quotaExceeded: false, waitMessage: '',
      })

      try {
        const res = await videos.generate(trimmed, settings, files)
        setState((s) => ({ ...s, projectId: res.project_id }))
        void poll(res.project_id)
        pollRef.current = window.setInterval(() => void poll(res.project_id), POLL_MS)
      } catch (err) {
        stopTimers()
        if (err instanceof ApiError) {
          if (err.status === 401) { onUnauthorized(); return }
          if (err.status === 402) {
            setState((s) => ({
              ...s,
              phase: 'idle',
              quotaExceeded: true,
              error:
                (typeof err.payload.message === 'string' && err.payload.message) ||
                'You have used all the videos included in your plan this month.',
            }))
            return
          }
        }
        setState((s) => ({
          ...s,
          phase: 'idle',
          error: err instanceof Error ? err.message : 'Could not start generation.',
        }))
      }
    },
    [onUnauthorized, poll, stopTimers],
  )

  const reset = useCallback(() => {
    stopTimers()
    stepRef.current = ''
    setState({
      phase: 'idle', projectId: null, status: null,
      error: null, failure: null, quotaExceeded: false, waitMessage: '',
    })
  }, [stopTimers])

  const clearError = useCallback(
    () => setState((s) => ({ ...s, error: null, quotaExceeded: false })),
    [],
  )

  return { ...state, start, reset, clearError }
}
