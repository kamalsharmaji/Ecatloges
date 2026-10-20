import { Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

/** Reply textarea; clears only after the server accepted the message. */
export function ReplyBox({
  onSend,
  loading,
  placeholder = 'Type your reply here…',
  label = 'Send Reply',
  extra,
}: {
  onSend: (body: string, done: () => void) => void
  loading: boolean
  placeholder?: string
  label?: string
  extra?: ReactNode
}) {
  const [body, setBody] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (body.trim()) onSend(body.trim(), () => setBody(''))
      }}
      className="space-y-2"
    >
      <label className="sr-only" htmlFor="reply-body">Reply</label>
      <textarea id="reply-body" rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder}
        className="block w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {extra}
        <Button type="submit" size="sm" loading={loading} disabled={!body.trim()} icon={<Send className="size-4" />}>{label}</Button>
      </div>
    </form>
  )
}
