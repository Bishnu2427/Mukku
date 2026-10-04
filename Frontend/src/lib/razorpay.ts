/**
 * Razorpay Checkout integration.
 *
 * The script is injected on demand rather than in index.html, so a deployment
 * without payments configured never loads third-party code at all — which is
 * what lets the CSP stay `script-src 'self'` in that case.
 *
 * Important: the browser result is treated as advisory only. The plan is
 * upgraded by the server when Razorpay's signed webhook arrives, never by
 * anything this file returns. On success we simply re-fetch the user.
 */

import { billing } from './api'

const SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

let sdkPromise: Promise<void> | null = null

function loadSdk(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SDK_URL
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      sdkPromise = null
      reject(new Error('Could not load the payment provider. Check your connection.'))
    }
    document.head.appendChild(el)
  })
  return sdkPromise
}

export interface CheckoutResult {
  /** Payment reached Razorpay. Fulfilment still depends on the webhook. */
  submitted: boolean
  paymentId?: string
  dismissed?: boolean
}

/**
 * Opens Razorpay Checkout for a plan.
 *
 * Resolves when the modal closes — either because the payment was submitted
 * or because the user dismissed it. Rejects only on setup failure.
 */
export async function startCheckout(plan: string): Promise<CheckoutResult> {
  const order = await billing.createOrder(plan)
  await loadSdk()

  if (!window.Razorpay) {
    throw new Error('Payment provider unavailable.')
  }

  return new Promise<CheckoutResult>((resolve, reject) => {
    try {
      const rzp = new window.Razorpay!({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Mukku AI Studio',
        description: `${plan[0].toUpperCase()}${plan.slice(1)} plan`,
        image: '/static/mukku_logo.png',
        prefill: { name: order.name, email: order.email },
        theme: { color: '#6478D4' },
        handler: (res: { razorpay_payment_id?: string }) =>
          resolve({ submitted: true, paymentId: res?.razorpay_payment_id }),
        modal: {
          ondismiss: () => resolve({ submitted: false, dismissed: true }),
        },
      })
      rzp.open()
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Could not open checkout.'))
    }
  })
}

/**
 * Polls /api/auth/me until the webhook has flipped the plan.
 *
 * Razorpay's webhook usually lands within a couple of seconds, but it is
 * asynchronous and independent of the browser — so we wait briefly and give up
 * gracefully rather than blocking the UI. The plan will still update on the
 * next page load if the webhook is slow.
 */
export async function awaitPlanChange(
  currentPlan: string,
  fetchPlan: () => Promise<string>,
  { attempts = 10, intervalMs = 1500 } = {},
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    try {
      const plan = await fetchPlan()
      if (plan && plan !== currentPlan) return plan
    } catch {
      /* transient — keep waiting */
    }
  }
  return null
}
