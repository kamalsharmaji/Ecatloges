/**
 * Razorpay Checkout launcher — PREPARED, NOT VERIFIED against a Razorpay account.
 *
 * The handler only posts Razorpay's signed response to /confirm/, which verifies the signature
 * server-side and then reconciles with the Razorpay API. The browser never activates anything.
 */
import type { CheckoutPayload } from '@/types/billing'

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

interface RazorpayResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open: () => void
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'))
    document.body.appendChild(script)
  })
}

export async function openRazorpayCheckout(
  payload: CheckoutPayload,
  options: { businessName: string; description: string; email?: string; onPaid: (response: RazorpayResponse) => void; onDismiss: () => void },
) {
  await loadScript()
  if (!window.Razorpay) throw new Error('Payment window unavailable.')
  new window.Razorpay({
    key: payload.key_id,
    order_id: payload.order_id,
    amount: payload.amount,
    currency: payload.currency,
    name: options.businessName,
    description: options.description,
    prefill: options.email ? { email: options.email } : undefined,
    theme: { color: '#1d4ed8' },
    handler: options.onPaid,
    modal: { ondismiss: options.onDismiss },
  }).open()
}
