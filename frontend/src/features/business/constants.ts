import type { BusinessCategory } from '@/types/api'

export const BUSINESS_CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'retail', label: 'Retailer' },
  { value: 'wholesale', label: 'Wholesaler' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'seller', label: 'Independent seller' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
]

export const categoryLabel = (value: string) => BUSINESS_CATEGORIES.find((c) => c.value === value)?.label ?? value
