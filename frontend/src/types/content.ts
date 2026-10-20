export type ContentStatus = 'draft' | 'published' | 'archived'
export type CategoryStatus = 'published' | 'draft'
export type StockStatus = 'in_stock' | 'out_of_stock' | 'made_to_order'
export type MediaKind = 'image' | 'video'
export type MediaFolder = 'product_images' | 'product_videos' | 'catalogues' | 'category_icons' | 'banners' | 'others'

export interface MediaBrief {
  id: string
  kind: MediaKind
  thumbnail_url: string | null
  preview_url: string | null
  width: number | null
  height: number | null
  duration_seconds: number | null
  title: string
  alt_text: string
}

export interface MediaAsset extends MediaBrief {
  folder: MediaFolder
  original_filename: string
  extension: string
  mime_type: string
  size_bytes: number
  original_url: string | null
  usage_count: number
  created_at: string
}

export interface MediaUsage {
  total: number
  images: number
  videos: number
  used_bytes: number
  limit_mb: number | null
  max_image_size_mb: number | null
  video_uploads_enabled: boolean
  max_video_size_mb: number | null
  max_upload_mb: number
  folders: { key: MediaFolder; label: string; count: number }[]
}

export interface CategoryBrief {
  id: string
  name: string
  icon: string
}

export interface Category extends CategoryBrief {
  description: string
  image: MediaBrief | null
  parent: CategoryBrief | null
  path: string[]
  status: CategoryStatus
  sort_order: number
  product_count: number
  children_count: number
  created_at: string
  updated_at: string
}

export interface CategoryInput {
  name: string
  description: string
  icon: string
  image_id: string | null
  parent_id: string | null
  status: CategoryStatus
  sort_order?: number
}

export interface CatalogueRef {
  id: string
  name: string
  status: ContentStatus
  cover_thumbnail_url: string | null
}

export interface ProductListItem {
  id: string
  name: string
  sku: string
  short_description: string
  category: CategoryBrief
  price: string | null
  compare_at_price: string | null
  currency: string
  show_price: boolean
  moq: number | null
  moq_unit: string
  stock_status: StockStatus
  is_featured: boolean
  status: ContentStatus
  thumbnail: MediaBrief | null
  media_count: number
  catalogues: CatalogueRef[]
  /** All-time product-detail views and enquiries (see analytics for date ranges). */
  view_count: number
  enquiry_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface Product extends ProductListItem {
  description: string
  tags: string[]
  highlights: string[]
  media: MediaBrief[]
}

export interface ProductInput {
  name: string
  sku: string
  short_description: string
  description: string
  category_id: string
  price: string | null
  compare_at_price: string | null
  show_price: boolean
  moq: number | null
  moq_unit: string
  stock_status: StockStatus
  tags: string[]
  highlights: string[]
  is_featured: boolean
  status: ContentStatus
  media_ids: string[]
  catalogue_ids: string[]
}

export interface Catalogue {
  id: string
  name: string
  slug: string
  description: string
  tagline: string
  cover: MediaBrief | null
  logo: MediaBrief | null
  theme_color: string
  show_prices: boolean
  whatsapp_number: string
  contact_email: string
  enquiries_enabled: boolean
  status: ContentStatus
  public_url: string
  product_count: number
  published_product_count: number
  view_count: number
  enquiry_count: number
  published_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface CatalogueInput {
  name: string
  slug?: string
  description: string
  tagline: string
  cover_id: string | null
  logo_id: string | null
  theme_color: string
  show_prices: boolean
  whatsapp_number: string
  contact_email: string
  enquiries_enabled: boolean
}

export interface CatalogueItem {
  product_id: string
  position: number
  name: string
  sku: string
  status: ContentStatus
  price: string | null
  currency: string
  category: CategoryBrief
  thumbnail: MediaBrief | null
}

export interface ContentSummary {
  total: number
  published: number
  draft: number
  archived: number
  limit: number | null
}

export interface CategorySummary {
  total: number
  with_products: number
  subcategories: number
  total_products: number
}

// --- Public catalogue ---------------------------------------------------------------------------
export interface PublicCategory {
  id: string
  name: string
  icon: string
  product_count: number
  image: MediaBrief | null
}

export interface PublicCatalogue {
  name: string
  slug: string
  description: string
  tagline: string
  theme_color: string
  show_prices: boolean
  whatsapp_number: string
  contact_email: string
  enquiries_enabled: boolean
  cover: MediaBrief | null
  logo: MediaBrief | null
  public_url: string
  business: {
    name: string
    slug: string
    city: string
    state: string
    description: string
    website: string
    social_links: Partial<Record<'facebook' | 'instagram' | 'youtube' | 'linkedin' | 'x', string>>
    logo: MediaBrief | null
  }
  categories: PublicCategory[]
  product_count: number
}

export interface PublicProduct {
  id: string
  name: string
  sku: string
  short_description: string
  category: CategoryBrief
  price: string | null
  compare_at_price: string | null
  currency: string
  moq: number | null
  moq_unit: string
  stock_status: StockStatus
  is_featured: boolean
  media: MediaBrief[]
}

export interface PublicProductDetail extends PublicProduct {
  description: string
  tags: string[]
  highlights: string[]
}
