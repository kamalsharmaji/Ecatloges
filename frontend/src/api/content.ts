import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api, asApiError } from '@/api/client'
import type { Paginated } from '@/types/api'
import type {
  Catalogue,
  CatalogueInput,
  CatalogueItem,
  Category,
  CategoryInput,
  CategorySummary,
  ContentSummary,
  MediaAsset,
  MediaFolder,
  MediaUsage,
  Product,
  ProductInput,
  ProductListItem,
  PublicCatalogue,
  PublicProduct,
  PublicProductDetail,
} from '@/types/content'

export type ListParams = Record<string, string | number | undefined>

/** Drop empty filters so URLs and cache keys stay clean. */
function clean(params: ListParams): ListParams {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
}

function useInvalidate(...roots: string[]) {
  const qc = useQueryClient()
  return () => Promise.all(roots.map((root) => qc.invalidateQueries({ queryKey: [root] })))
}

// --- Catalogues ---------------------------------------------------------------------------------
export function useCatalogues(businessId: string | null, params: ListParams) {
  return useQuery({
    queryKey: ['catalogues', businessId, 'list', clean(params)],
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Catalogue>>('/catalogues/', { params: clean(params) })).data,
  })
}

export function useCatalogueSummary(businessId: string | null) {
  return useQuery({
    queryKey: ['catalogues', businessId, 'summary'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<ContentSummary>('/catalogues/summary/')).data,
  })
}

export function useCatalogue(businessId: string | null, id: string | undefined) {
  return useQuery({
    queryKey: ['catalogues', businessId, 'detail', id],
    enabled: Boolean(businessId && id),
    queryFn: async () => (await api.get<Catalogue>(`/catalogues/${id}/`)).data,
  })
}

export function useCatalogueItems(businessId: string | null, id: string | undefined) {
  return useQuery({
    queryKey: ['catalogues', businessId, 'items', id],
    enabled: Boolean(businessId && id),
    queryFn: async () =>
      (await api.get<Paginated<CatalogueItem>>(`/catalogues/${id}/items/`, { params: { page_size: 100 } })).data,
  })
}

export function useSaveCatalogue() {
  const invalidate = useInvalidate('catalogues')
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CatalogueInput> & { id?: string; status?: string }) =>
      id ? (await api.patch<Catalogue>(`/catalogues/${id}/`, input)).data : (await api.post<Catalogue>('/catalogues/', input)).data,
    onSuccess: invalidate,
  })
}

export function useCatalogueAction() {
  const invalidate = useInvalidate('catalogues', 'products')
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete' }) =>
      action === 'delete' ? (await api.delete(`/catalogues/${id}/`), null) : (await api.post<Catalogue>(`/catalogues/${id}/${action}/`)).data,
    onSuccess: invalidate,
  })
}

export function useCatalogueItemsMutation() {
  const invalidate = useInvalidate('catalogues', 'products')
  return useMutation({
    mutationFn: async ({ id, op, productIds }: { id: string; op: 'add' | 'remove' | 'reorder'; productIds: string[] }) =>
      (await api.post(`/catalogues/${id}/items/${op}/`, { product_ids: productIds })).data,
    onSuccess: invalidate,
  })
}

// --- Categories ---------------------------------------------------------------------------------
export function useCategories(businessId: string | null, params: ListParams = {}) {
  return useQuery({
    queryKey: ['categories', businessId, 'list', clean(params)],
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<Category>>('/categories/', { params: clean(params) })).data,
  })
}

/** All categories (for selects). Businesses rarely have more than a few hundred. */
export function useAllCategories(businessId: string | null) {
  return useCategories(businessId, { page_size: 100, ordering: 'name' })
}

export function useCategorySummary(businessId: string | null) {
  return useQuery({
    queryKey: ['categories', businessId, 'summary'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<CategorySummary>('/categories/summary/')).data,
  })
}

export function useSaveCategory() {
  const invalidate = useInvalidate('categories')
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CategoryInput> & { id?: string }) =>
      id ? (await api.patch<Category>(`/categories/${id}/`, input)).data : (await api.post<Category>('/categories/', input)).data,
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidate('categories', 'products')
  return useMutation({
    mutationFn: async ({ id, reassignTo }: { id: string; reassignTo?: string }) => {
      await api.delete(`/categories/${id}/`, { params: reassignTo ? { reassign_to: reassignTo } : undefined })
    },
    onSuccess: invalidate,
  })
}

// --- Products -----------------------------------------------------------------------------------
export function useProducts(businessId: string | null, params: ListParams) {
  return useQuery({
    queryKey: ['products', businessId, 'list', clean(params)],
    enabled: Boolean(businessId),
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<ProductListItem>>('/products/', { params: clean(params) })).data,
  })
}

export function useProductSummary(businessId: string | null) {
  return useQuery({
    queryKey: ['products', businessId, 'summary'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<ContentSummary>('/products/summary/')).data,
  })
}

export function useProduct(businessId: string | null, id: string | undefined) {
  return useQuery({
    queryKey: ['products', businessId, 'detail', id],
    enabled: Boolean(businessId && id),
    queryFn: async () => (await api.get<Product>(`/products/${id}/`)).data,
  })
}

export function useSaveProduct() {
  const invalidate = useInvalidate('products', 'catalogues', 'categories')
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ProductInput> & { id?: string }) =>
      id ? (await api.patch<Product>(`/products/${id}/`, input)).data : (await api.post<Product>('/products/', input)).data,
    onSuccess: invalidate,
  })
}

export type ProductAction = 'publish' | 'unpublish' | 'archive' | 'restore' | 'duplicate' | 'delete'

export function useProductAction() {
  const invalidate = useInvalidate('products', 'catalogues', 'categories')
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: ProductAction }) =>
      action === 'delete' ? (await api.delete(`/products/${id}/`), null) : (await api.post<Product>(`/products/${id}/${action}/`)).data,
    onSuccess: invalidate,
  })
}

export type BulkAction = 'publish' | 'unpublish' | 'archive' | 'restore' | 'delete' | 'add_to_catalogue' | 'remove_from_catalogue'

export function useBulkProducts() {
  const invalidate = useInvalidate('products', 'catalogues', 'categories')
  return useMutation({
    mutationFn: async (input: { ids: string[]; action: BulkAction; catalogue_id?: string }) =>
      (await api.post<{ updated: number }>('/products/bulk/', input)).data,
    onSuccess: invalidate,
  })
}

// --- Media --------------------------------------------------------------------------------------
export function useMedia(businessId: string | null, params: ListParams, enabled = true) {
  return useQuery({
    queryKey: ['media', businessId, 'list', clean(params)],
    enabled: Boolean(businessId) && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<Paginated<MediaAsset>>('/media/', { params: clean(params) })).data,
  })
}

export function useMediaUsage(businessId: string | null) {
  return useQuery({
    queryKey: ['media', businessId, 'usage'],
    enabled: Boolean(businessId),
    queryFn: async () => (await api.get<MediaUsage>('/media/usage/')).data,
  })
}

export async function uploadMedia(file: File, folder: MediaFolder, onProgress?: (pct: number) => void) {
  const form = new FormData()
  form.append('file', file)
  form.append('folder', folder)
  const response = await api.post<MediaAsset>('/media/', form, {
    timeout: 10 * 60_000, // large videos
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
  })
  return response.data
}

export function useUpdateMedia() {
  const invalidate = useInvalidate('media')
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; folder?: MediaFolder; title?: string; alt_text?: string }) =>
      (await api.patch<MediaAsset>(`/media/${id}/`, input)).data,
    onSuccess: invalidate,
  })
}

export function useMediaBulk() {
  const invalidate = useInvalidate('media')
  return useMutation({
    mutationFn: async (input: { ids: string[]; action: 'move' | 'delete'; folder?: MediaFolder }) =>
      (await api.post<{ updated?: number; deleted?: number; skipped_in_use?: string[] }>('/media/bulk/', input)).data,
    onSuccess: invalidate,
  })
}

// --- Public catalogue (anonymous; no auth or business headers) ---------------------------------
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1', timeout: 30_000 })

async function publicGet<T>(url: string, params?: ListParams): Promise<T> {
  try {
    return (await publicApi.get<T>(url, { params: params && clean(params) })).data
  } catch (error) {
    throw asApiError(error)
  }
}

export function usePublicCatalogue(businessSlug: string, catalogueSlug: string) {
  return useQuery({
    queryKey: ['public', businessSlug, catalogueSlug],
    queryFn: () => publicGet<PublicCatalogue>(`/public/catalogues/${businessSlug}/${catalogueSlug}/`),
    retry: false,
  })
}

/** Paged ("Load more") public product list. */
export function usePublicProducts(businessSlug: string, catalogueSlug: string, params: ListParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['public', businessSlug, catalogueSlug, 'products', clean(params)],
    enabled,
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<PublicProduct>) => (last.next ? last.page + 1 : undefined),
    queryFn: ({ pageParam }) =>
      publicGet<Paginated<PublicProduct>>(`/public/catalogues/${businessSlug}/${catalogueSlug}/products/`, { ...params, page: pageParam }),
  })
}

export function usePublicProduct(businessSlug: string, catalogueSlug: string, productId: string | null) {
  return useQuery({
    queryKey: ['public', businessSlug, catalogueSlug, 'product', productId],
    enabled: Boolean(productId),
    queryFn: () =>
      publicGet<PublicProductDetail>(`/public/catalogues/${businessSlug}/${catalogueSlug}/products/${productId}/`),
  })
}
