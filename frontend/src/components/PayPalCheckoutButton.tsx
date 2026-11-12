import { useState } from 'react'
import { PayPalButtons } from '@paypal/react-paypal-js'
import { ApiError, cancelPaypalOrder, capturePaypalOrder, createPaypalOrder } from '../lib/api'

export function PayPalCheckoutButton({
  milestoneId,
  onPaymentConfirmed,
}: {
  milestoneId: string
  onPaymentConfirmed: () => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'success' | 'warning' | 'error' | null>(null)

  return (
    <div className="mt-3 w-full sm:max-w-[220px]">
      <PayPalButtons
        style={{ layout: 'vertical', shape: 'rect', height: 40, label: 'paypal' }}
        createOrder={async () => {
          setMessage('')
          setTone(null)
          const { orderId } = await createPaypalOrder(milestoneId)
          return orderId
        }}
        onApprove={async (data) => {
          if (typeof data.orderID !== 'string') {
            setTone('error')
            setMessage('PayPal did not return an order ID. No payment status was changed.')
            return
          }
          try {
            await capturePaypalOrder(data.orderID)
          } catch (error) {
            setTone('error')
            setMessage(error instanceof ApiError ? error.message : 'Payment capture could not be verified.')
            return
          }
          setTone('success')
          setMessage('PayPal confirmed the capture. Refreshing project status…')
          try {
            await onPaymentConfirmed()
            setMessage('PayPal capture verified and project status refreshed.')
          } catch {
            setMessage('PayPal capture was verified, but project status could not refresh. Reload this page.')
          }
        }}
        onCancel={async (data) => {
          setTone('warning')
          setMessage('Checkout was canceled. No capture was completed.')
          if (typeof data.orderID === 'string') {
            try {
              await cancelPaypalOrder(data.orderID)
              await onPaymentConfirmed()
            } catch {
              setMessage('Checkout was canceled, but its status could not be refreshed. Reload the page before trying again.')
            }
          }
        }}
        onError={() => {
          setTone('error')
          setMessage('PayPal checkout failed. No payment is marked as paid; please try again.')
        }}
      />
      {message && (
        <p
          aria-live="polite"
          className={`mt-2 text-xs leading-5 ${
            tone === 'success' ? 'text-emerald-700' :
            tone === 'warning' ? 'text-amber-700' : 'text-rose-700'
          }`}
          role={tone === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
    </div>
  )
}
