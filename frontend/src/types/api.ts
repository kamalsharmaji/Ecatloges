export interface Paginated<T> {
  count: number
  page: number
  page_size: number
  total_pages: number
  next: string | null
  previous: string | null
  results: T[]
}

export type PlatformRole = '' | 'super_admin' | 'support_admin'

export interface User {
  id: string
  email: string
  full_name: string
  phone: string
  is_email_verified: boolean
  platform_role: PlatformRole
  platform_permissions: string[]
  date_joined: string
}

export interface AuthResponse {
  access: string
  refresh: string
  user: User
}

export interface RoleSummary {
  id: string
  key: string
  name: string
  is_system: boolean
}

export interface Role extends RoleSummary {
  description: string
  permissions: string[]
  member_count: number
  created_at: string
}

export interface Permission {
  code: string
  name: string
  module: string
  assignable: boolean
}

export type BusinessCategory =
  | 'retail'
  | 'wholesale'
  | 'manufacturer'
  | 'distributor'
  | 'seller'
  | 'services'
  | 'other'

export type ActiveStatus = 'active' | 'suspended'

export interface BusinessBrief {
  id: string
  name: string
  slug: string
  category: BusinessCategory
  city: string
  status: ActiveStatus
}

export interface Business {
  id: string
  slug: string
  name: string
  owner_name: string
  phone: string
  email: string
  category: BusinessCategory
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  website: string
  description: string
  social_links: SocialLinks
  status: ActiveStatus
  created_at: string
  updated_at: string
}

export type BusinessInput = Omit<Business, 'id' | 'slug' | 'status' | 'created_at' | 'updated_at' | 'social_links'> & {
  social_links?: SocialLinks
}

export type SocialNetwork = 'facebook' | 'instagram' | 'youtube' | 'linkedin' | 'x'
export type SocialLinks = Partial<Record<SocialNetwork, string>>

export interface MyBusiness {
  membership_id: string
  membership_status: ActiveStatus
  role: RoleSummary
  business: BusinessBrief
}

export interface BusinessContext {
  business: Business
  membership_id: string
  role: RoleSummary
  is_owner: boolean
  permissions: string[]
}

export interface Membership {
  id: string
  user: { id: string; email: string; full_name: string; phone: string }
  role: RoleSummary
  status: ActiveStatus
  is_owner: boolean
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: string
  email: string
  role: RoleSummary
  status: 'pending' | 'accepted' | 'revoked'
  invited_by: string | null
  expires_at: string
  is_expired: boolean
  created_at: string
}
