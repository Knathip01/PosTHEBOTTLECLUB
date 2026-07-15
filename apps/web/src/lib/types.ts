export type UserRole = 'super_admin' | 'manager' | 'cashier' | 'stock_staff'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  phone?: string
  avatar_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  description?: string
  icon?: string
  color: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  category_id?: string
  sku?: string
  barcode?: string
  name: string
  description?: string
  price: number
  cost: number
  stock: number
  min_stock: number
  // Wine-specific
  country?: string
  region?: string
  brand?: string
  winery?: string
  grape?: string
  vintage?: string
  alcohol_percent?: number
  volume_ml?: number
  image_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  categories?: Category
}

export interface Customer {
  id: string
  member_code?: string
  full_name: string
  phone?: string
  email?: string
  points: number
  total_spent: number
  member_level: 'bronze' | 'silver' | 'gold' | 'platinum'
  note?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  receipt_no: string
  customer_id?: string
  cashier_id?: string
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'hold' | 'completed'
  subtotal: number
  discount_amount: number
  discount_note?: string
  tax_amount: number
  service_charge: number
  total_amount: number
  payment_method: 'cash' | 'transfer' | 'qr' | 'card' | 'mixed'
  cash_received?: number
  change_amount?: number
  note?: string
  table_no?: string | null
  points_earned: number
  created_at: string
  updated_at: string
  // Joined
  customers?: Customer
  profiles?: Profile
  sale_items?: SaleItem[]
  payments?: Payment[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id?: string
  product_name: string
  sku?: string
  unit_price: number
  cost: number
  quantity: number
  discount_amount: number
  line_total: number
  created_at: string
}

export interface Payment {
  id: string
  sale_id: string
  payment_method: 'cash' | 'transfer' | 'qr' | 'card'
  amount: number
  reference_no?: string
  paid_at: string
  created_at: string
}

export interface HoldSale {
  id: string
  hold_no: string
  cashier_id?: string
  customer_id?: string
  subtotal: number
  note?: string
  created_at: string
  hold_sale_items?: HoldSaleItem[]
  customers?: Customer
}

export interface HoldSaleItem {
  id: string
  hold_sale_id: string
  product_id: string
  product_name: string
  sku?: string
  unit_price: number
  quantity: number
  discount_amount: number
}

export interface InventoryMovement {
  id: string
  product_id: string
  movement_type: 'in' | 'out' | 'adjust' | 'refund'
  quantity: number
  quantity_before: number
  quantity_after: number
  reference_type?: 'purchase' | 'sale' | 'manual' | 'refund' | 'adjustment'
  reference_id?: string
  note?: string
  created_by?: string
  created_at: string
  products?: Product
  profiles?: Profile
}

export interface StockReceipt {
  id: string
  receipt_no: string
  supplier_name?: string
  total_cost: number
  received_by?: string
  note?: string
  created_at: string
  stock_receipt_items?: StockReceiptItem[]
  profiles?: Profile
}

export interface StockReceiptItem {
  id: string
  stock_receipt_id: string
  product_id: string
  quantity: number
  cost: number
  created_at: string
  products?: Product
}

export interface AuditLog {
  id: string
  user_id?: string
  action: string
  entity_type: string
  entity_id?: string
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  ip_address?: string
  created_at: string
  profiles?: Profile
}

// POS Cart Types
export interface CartItem {
  product: Product
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
}

export interface CartState {
  items: CartItem[]
  customer: Customer | null
  discount_amount: number
  discount_note: string
  note: string
}
