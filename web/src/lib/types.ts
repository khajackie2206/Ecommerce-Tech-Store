// Shapes of the JSON the API returns (see the entities and services in server/src)

export type Category = {
  id: number
  name: string
  slug: string
  sortOrder: number
  isActive: boolean
}

export type Brand = {
  id: number
  name: string
  slug: string
  logoUrl: string | null
  isActive: boolean
}

// One row of GET /products (ProductListItem in products.service.ts)
export type ProductListItem = {
  id: number
  name: string
  slug: string
  shortDescription: string | null
  thumbnailUrl: string | null
  isFeatured: boolean
  category: { name: string; slug: string }
  brand: { name: string; slug: string }
  fromPrice: number // cheapest price after discount
  listPrice: number // cheapest original price
  inStock: boolean
}

export type ProductListResult = {
  items: ProductListItem[]
  total: number
  page: number
  limit: number
}

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name_asc'

// Query string accepted by GET /products (ListProductsQueryDto)
export type ProductListParams = {
  category?: string
  brand?: string
  q?: string
  minPrice?: number
  maxPrice?: number
  featured?: boolean
  sort?: ProductSort
  page?: number
  limit?: number
}

export type ProductVariant = {
  id: number
  sku: string
  name: string // e.g. "256GB - Cam vũ trụ"
  color: string | null
  storage: string | null
  price: number
  salePrice: number | null
  stock: number
}

export type ProductImage = {
  id: number
  url: string
  sortOrder: number
}

// GET /products/:slug
export type ProductDetail = {
  id: number
  name: string
  slug: string
  shortDescription: string | null
  description: string | null
  specs: Record<string, string> | null
  thumbnailUrl: string | null
  category: Category
  brand: Brand
  variants: ProductVariant[]
  images: ProductImage[]
}
