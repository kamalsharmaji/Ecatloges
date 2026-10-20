import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCreateTicket } from '@/api/workspace'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { TicketCategory, TicketDetail, TicketPriority } from '@/types/workspace'
import { applyApiErrors } from '@/utils/formErrors'
import { TICKET_CATEGORY, TICKET_PRIORITY } from './format'

const schema = z.object({
  subject: z.string().trim().min(5, 'Use at least 5 characters.').max(150),
  category: z.enum(Object.keys(TICKET_CATEGORY) as [TicketCategory, ...TicketCategory[]]),
  priority: z.enum(Object.keys(TICKET_PRIORITY) as [TicketPriority, ...TicketPriority[]]),
  description: z.string().trim().min(10, 'Describe the problem in at least 10 characters.').max(5000),
})
type Values = z.infer<typeof schema>

const field = 'mt-1.5 block w-full rounded-lg border border-border px-3 text-sm focus:border-brand-600 focus:outline-none'

/** Mounted only while open, so each opening gets a fresh form and idempotency key. */
export function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ticket: TicketDetail) => void }) {
  // One key per form: a double click or network retry returns the same ticket instead of a duplicate.
  const [clientKey] = useState(() => crypto.randomUUID())
  const create = useCreateTicket()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { subject: '', category: 'technical', priority: 'medium', description: '' },
  })

  const submit = handleSubmit((values) => {
    setFormError(null)
    create.mutate({ ...values, client_key: clientKey }, {
      onSuccess: onCreated,
      onError: (error) => setFormError(applyApiErrors(error, setError, ['subject', 'category', 'priority', 'description'])),
    })
  })

  return (
    <Modal open onClose={onClose} size="lg" title="Create support ticket" description="Our support team usually replies within one business day. Don’t include passwords or card numbers."
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
        <Button type="submit" form="new-ticket" loading={create.isPending}>Submit ticket</Button>
      </>}>
      <form id="new-ticket" onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <label className="block text-sm font-medium">Subject *
          <input className={`${field} h-10`} aria-invalid={Boolean(errors.subject)} {...register('subject')} />
          {errors.subject && <span className="text-xs text-red-600">{errors.subject.message}</span>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Category *
            <select className={`${field} h-10 bg-white`} {...register('category')}>
              {Object.entries(TICKET_CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Priority
            <select className={`${field} h-10 bg-white`} {...register('priority')}>
              {Object.entries(TICKET_PRIORITY).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">Description *
          <textarea rows={6} maxLength={5000} className={`${field} py-2`} aria-invalid={Boolean(errors.description)}
            placeholder="What happened, what you expected, and the steps to reproduce it." {...register('description')} />
          {errors.description && <span className="text-xs text-red-600">{errors.description.message}</span>}
        </label>
      </form>
    </Modal>
  )
}
