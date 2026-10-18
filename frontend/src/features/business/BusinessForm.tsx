import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { BUSINESS_CATEGORIES } from '@/features/business/constants'
import type { Business, BusinessCategory, BusinessInput } from '@/types/api'
import { applyApiErrors } from '@/utils/formErrors'

const schema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(150),
  owner_name: z.string().trim().min(2, "Enter the owner's name.").max(150),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s\-()]{6,18}$/, 'Enter a valid mobile number.'),
  email: z.string().trim().email('Enter a valid business email.'),
  category: z.enum(['retail', 'wholesale', 'manufacturer', 'distributor', 'seller', 'services', 'other'], {
    errorMap: () => ({ message: 'Choose a business category.' }),
  }),
  address_line1: z.string().trim().min(1, 'Enter the street address.').max(255),
  address_line2: z.string().trim().max(255),
  city: z.string().trim().min(1, 'Enter the city.').max(100),
  state: z.string().trim().max(100),
  postal_code: z.string().trim().max(20),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use a 2-letter country code, e.g. IN.'),
  website: z.union([z.literal(''), z.string().trim().url('Enter a full URL, e.g. https://example.com')]),
  description: z.string().max(2000, 'Keep the description under 2000 characters.'),
})
type FormValues = z.infer<typeof schema>
const FIELDS = Object.keys(schema.shape)

const EMPTY: FormValues = {
  name: '',
  owner_name: '',
  phone: '',
  email: '',
  category: '' as BusinessCategory,
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'IN',
  website: '',
  description: '',
}

export function BusinessForm({
  initial,
  defaults,
  submitLabel,
  onSubmit,
  readOnly = false,
}: {
  initial?: Business
  defaults?: Partial<FormValues>
  submitLabel: string
  onSubmit: (values: BusinessInput) => Promise<unknown>
  readOnly?: boolean
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ? pick(initial) : { ...EMPTY, ...defaults },
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    setSaved(false)
    try {
      const result = await onSubmit({ ...values, country: values.country.toUpperCase() })
      if (initial) {
        reset(pick(result as Business))
        setSaved(true)
      }
    } catch (error) {
      setFormError(applyApiErrors(error, setError, FIELDS))
    }
  })

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={readOnly || isSubmitting} className="space-y-6">
        {formError && <Alert tone="error">{formError}</Alert>}
        {saved && !isDirty && <Alert tone="success">Business profile saved.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Business name" required error={errors.name?.message} {...register('name')} />
          <SelectField label="Business category" required error={errors.category?.message} {...register('category')}>
            <option value="" disabled>
              Select a category
            </option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Owner name" required autoComplete="name" error={errors.owner_name?.message} {...register('owner_name')} />
          <TextField label="Mobile number" required type="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
          <TextField
            label="Business email"
            required
            type="email"
            containerClassName="sm:col-span-2"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted">Address</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Street address"
              required
              autoComplete="address-line1"
              containerClassName="sm:col-span-2"
              error={errors.address_line1?.message}
              {...register('address_line1')}
            />
            <TextField
              label="Address line 2"
              autoComplete="address-line2"
              containerClassName="sm:col-span-2"
              error={errors.address_line2?.message}
              {...register('address_line2')}
            />
            <TextField label="City" required autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
            <TextField label="State" autoComplete="address-level1" error={errors.state?.message} {...register('state')} />
            <TextField label="Postal code" autoComplete="postal-code" error={errors.postal_code?.message} {...register('postal_code')} />
            <TextField
              label="Country code"
              required
              maxLength={2}
              autoComplete="country"
              hint="2-letter code, e.g. IN"
              error={errors.country?.message}
              {...register('country')}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted">Optional</h3>
          <TextField label="Website" type="url" placeholder="https://" error={errors.website?.message} {...register('website')} />
          <TextAreaField label="About the business" error={errors.description?.message} {...register('description')} />
        </div>

        {!readOnly && (
          <div className="flex justify-end">
            <Button type="submit" size="lg" loading={isSubmitting} disabled={Boolean(initial) && !isDirty}>
              {submitLabel}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

function pick(b: Business): FormValues {
  return {
    name: b.name,
    owner_name: b.owner_name,
    phone: b.phone,
    email: b.email,
    category: b.category,
    address_line1: b.address_line1,
    address_line2: b.address_line2,
    city: b.city,
    state: b.state,
    postal_code: b.postal_code,
    country: b.country,
    website: b.website,
    description: b.description,
  }
}
