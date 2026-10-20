import { zodResolver } from '@hookform/resolvers/zod'
import { Contact, MessagesSquare, Pencil, Plus, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useCustomer, useCustomers, useCustomerSummary, useDeleteCustomer, useSaveCustomer } from '@/api/leads'
import { PageHero } from '@/components/panel/PageHero'
import { StatCard, StatGrid } from '@/components/panel/StatCard'
import { FilterSelect, SearchInput, Toolbar } from '@/components/panel/Toolbar'
import { Button } from '@/components/ui/Button'
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/features/business/BusinessContext'
import { Avatar, ContactActions, EnquiryStatusPill } from '@/features/leads/LeadBits'
import { formatDateTime } from '@/features/leads/leadFormat'
import { RequirePermission } from '@/routes/guards'
import type { Customer } from '@/types/leads'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name.').max(150),
    phone: z.string().trim().regex(/^$|^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid phone number.'),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email.')]),
    company: z.string().max(150),
    city: z.string().max(100),
    notes: z.string().max(2000),
  })
  .refine((v) => v.phone || v.email, { path: ['phone'], message: 'Enter a phone number or an email address.' })
type FormValues = z.infer<typeof schema>
const FIELDS = ['name', 'phone', 'email', 'company', 'city', 'notes']

function CustomerForm({ customer, open, onClose }: { customer: Customer | null; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const save = useSaveCustomer()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) })
  useEffect(() => {
    if (open) reset({ name: customer?.name ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', company: customer?.company ?? '', city: customer?.city ?? '', notes: customer?.notes ?? '' })
    setFormError(null)
  }, [open, customer, reset])
  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ id: customer?.id, ...v })
      toast.show(customer ? 'Customer updated.' : 'Customer added.')
      onClose()
    } catch (error) {
      setFormError(applyApiErrors(error, setError, FIELDS))
    }
  })
  return (
    <Modal open={open} onClose={onClose} title={customer ? `Edit ${customer.name}` : 'Add customer'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="customer-form" loading={isSubmitting}>Save</Button></>}>
      <form id="customer-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField label="Name" required error={errors.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Company" error={errors.company?.message} {...register('company')} />
          <TextField label="City" error={errors.city?.message} {...register('city')} />
        </div>
        <TextAreaField label="Notes" hint="Internal only." error={errors.notes?.message} {...register('notes')} />
      </form>
    </Modal>
  )
}

function CustomerPanel({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: Customer) => void }) {
  const { businessId, can } = useActiveBusiness()
  const toast = useToast()
  const customer = useCustomer(businessId, id)
  const del = useDeleteCustomer()
  const [confirm, setConfirm] = useState(false)
  return (
    <aside className="rounded-2xl bg-white p-5 shadow-panel" aria-label="Customer details">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-ink">Customer Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-canvas"><X className="size-5" /></button>
      </div>
      {customer.isPending ? <Spinner /> : customer.isError ? <ErrorState error={customer.error} onRetry={() => customer.refetch()} /> : (
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <Avatar name={customer.data.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{customer.data.name}</p>
              {customer.data.company && <p className="text-muted">{customer.data.company}</p>}
              <div className="mt-1"><ContactActions phone={customer.data.phone} email={customer.data.email} /></div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div><dt className="text-muted">Phone</dt><dd className="truncate">{customer.data.phone || '—'}</dd></div>
            <div><dt className="text-muted">Email</dt><dd className="truncate">{customer.data.email || '—'}</dd></div>
            <div><dt className="text-muted">City</dt><dd>{customer.data.city || '—'}</dd></div>
            <div><dt className="text-muted">Customer since</dt><dd>{formatDateTime(customer.data.created_at)}</dd></div>
          </dl>
          {customer.data.notes && <p className="rounded-lg bg-canvas p-3 whitespace-pre-line">{customer.data.notes}</p>}
          <div>
            <p className="mb-2 font-semibold">Enquiry history ({customer.data.enquiry_count})</p>
            {customer.data.enquiries.length === 0 ? <p className="text-muted">No enquiries.</p> : (
              <ul className="space-y-2">
                {customer.data.enquiries.map((e) => (
                  <li key={e.id}>
                    <Link to={`/app/enquiries?enquiry=${e.id}`} className="block rounded-lg border border-border p-2.5 hover:border-brand-300">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{e.product_name || e.catalogue_name || 'General enquiry'}</span>
                        <EnquiryStatusPill status={e.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">{formatDateTime(e.created_at)} · {e.message}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {can('customer.manage') && (
            <div className="flex gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => onEdit(customer.data)}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-red-600" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>Delete</Button>
            </div>
          )}
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={del.isPending} confirmLabel="Delete customer"
            title={`Delete ${customer.data.name}?`}
            description="The customer record is removed. Their enquiries are kept, with the contact details they submitted."
            onConfirm={() => del.mutate(id, { onSuccess: () => { toast.show('Customer deleted. Enquiries were kept.'); setConfirm(false); onClose() } })} />
        </div>
      )}
    </aside>
  )
}

export function CustomersPage() {
  const { businessId, can } = useActiveBusiness()
  const [searchParams, setSearchParams] = useSearchParams()
  const [params, setParams] = useState({ page: 1, search: '', ordering: '-last_enquiry_at', has_open_enquiries: '' })
  const [editing, setEditing] = useState<{ customer: Customer | null } | null>(null)
  const openId = searchParams.get('customer')
  const list = useCustomers(businessId, { ...params, page_size: 10 })
  const summary = useCustomerSummary(businessId)
  const set = (patch: Partial<typeof params>) => setParams((p) => ({ ...p, page: 1, ...patch }))
  const s = summary.data

  return (
    <RequirePermission codes={['customer.view']}>
      <PageHero icon={Contact} title="Customers" description="Everyone who has enquired about your products, with their contact details and enquiry history."
        highlights={['Created automatically from enquiries', 'No duplicate contacts', 'Full enquiry history', 'Reply via WhatsApp, email or phone']}
        action={can('customer.manage') && <Button size="lg" icon={<Plus className="size-5" />} onClick={() => setEditing({ customer: null })}>Add Customer</Button>} />
      <StatGrid>
        <StatCard icon={Users} label="Total customers" value={s?.total ?? '—'} loading={summary.isPending} />
        <StatCard icon={UserPlus} tone="pink" label="New this month" value={s?.new_this_month ?? '—'} loading={summary.isPending} />
        <StatCard icon={MessagesSquare} tone="amber" label="With open enquiries" value={s?.with_open_enquiries ?? '—'} loading={summary.isPending} />
        <StatCard icon={UserCheck} tone="green" label="Converted customers" value={s?.converted ?? '—'} loading={summary.isPending} />
      </StatGrid>
      <div className={openId ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}>
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={params.search} onChange={(search) => set({ search })} placeholder="Search name, phone, email, city…" />
            <FilterSelect label="Filter" value={params.has_open_enquiries} onChange={(has_open_enquiries) => set({ has_open_enquiries })}
              options={[{ value: '', label: 'All customers' }, { value: 'true', label: 'With open enquiries' }]} />
            <FilterSelect label="Sort" value={params.ordering} onChange={(ordering) => set({ ordering })}
              options={[{ value: '-last_enquiry_at', label: 'Sort: Latest enquiry' }, { value: '-created_at', label: 'Sort: Newest customers' }, { value: 'name', label: 'Sort: Name A–Z' }, { value: '-enquiry_count', label: 'Sort: Most enquiries' }]} />
          </Toolbar>
          {list.isPending ? <Spinner label="Loading customers…" /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.results.length === 0 ? (
            <EmptyState icon={Users} title={params.search || params.has_open_enquiries ? 'No customers match your filters' : 'No customers yet'}
              description="Customers are created automatically when someone sends an enquiry from your catalogue." />
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-panel">
              <table className="w-full text-left text-sm">
                <thead className="bg-thead text-[13px] font-semibold text-ink">
                  <tr>
                    <th scope="col" className="px-4 py-3">Customer</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">City</th>
                    <th scope="col" className="px-3 py-3">Enquiries</th>
                    <th scope="col" className="hidden px-3 py-3 lg:table-cell">Latest enquiry</th>
                    <th scope="col" className="px-3 py-3"><span className="sr-only">Contact</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.data.results.map((c) => (
                    <tr key={c.id} onClick={() => setSearchParams({ customer: c.id })} className={`cursor-pointer hover:bg-canvas ${openId === c.id ? 'bg-brand-50/60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.name} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-muted md:table-cell">{c.city || '—'}</td>
                      <td className="px-3 py-3 tabular-nums">
                        {c.enquiry_count}
                        {c.open_enquiry_count > 0 && <span className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{c.open_enquiry_count} open</span>}
                      </td>
                      <td className="hidden px-3 py-3 text-xs text-muted lg:table-cell">{formatDateTime(c.last_enquiry_at)}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><ContactActions phone={c.phone} email={c.email} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.data && list.data.count > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{list.data.count} customers</span>
              <Pagination page={params.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={list.data.page_size} noun="customers" onPage={(page) => setParams((p) => ({ ...p, page }))} />
            </div>
          )}
        </div>
        {openId && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <CustomerPanel id={openId} onClose={() => setSearchParams({})} onEdit={(customer) => setEditing({ customer })} />
          </div>
        )}
      </div>
      <CustomerForm open={editing !== null} customer={editing?.customer ?? null} onClose={() => setEditing(null)} />
    </RequirePermission>
  )
}
