import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/** Confirmation that requires a written reason (stored in the audit log and shown to the business). */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  tone = 'danger',
  loading,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  loading: boolean
  error?: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const valid = reason.trim().length >= 5
  return (
    <Modal open onClose={onClose} title={title} description={description}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={tone} loading={loading} disabled={!valid} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </>}>
      <label className="block text-sm font-medium">Reason <span className="font-normal text-muted">(required, at least 5 characters — recorded in the audit log)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} autoFocus
          className="mt-1.5 block w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" />
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  )
}
