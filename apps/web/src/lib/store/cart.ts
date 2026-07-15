import { create } from 'zustand'
import { CartItem, CartState, Customer, Product } from '@/lib/types'

interface CartStore extends CartState {
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  updateItemDiscount: (productId: string, discount: number) => void
  setCustomer: (customer: Customer | null) => void
  setDiscount: (amount: number, note?: string) => void
  setNote: (note: string) => void
  clearCart: () => void
  getSubtotal: () => number
  getTaxAmount: (vatRate: number, vatIncluded: boolean) => number
  getTotal: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  customer: null,
  discount_amount: 0,
  discount_note: '',
  note: '',

  addItem: (product: Product) => {
    set((state) => {
      const existing = state.items.find(i => i.product.id === product.id)
      if (existing) {
        return {
          items: state.items.map(i =>
            i.product.id === product.id
              ? {
                  ...i,
                  quantity: i.quantity + 1,
                  line_total: (i.quantity + 1) * i.unit_price - i.discount_amount
                }
              : i
          )
        }
      }
      const newItem: CartItem = {
        product,
        quantity: 1,
        unit_price: product.price,
        discount_amount: 0,
        line_total: product.price
      }
      return { items: [...state.items, newItem] }
    })
  },

  removeItem: (productId: string) => {
    set((state) => ({
      items: state.items.filter(i => i.product.id !== productId)
    }))
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(productId)
      return
    }
    set((state) => ({
      items: state.items.map(i =>
        i.product.id === productId
          ? { ...i, quantity, line_total: quantity * i.unit_price - i.discount_amount }
          : i
      )
    }))
  },

  updateItemDiscount: (productId: string, discount: number) => {
    set((state) => ({
      items: state.items.map(i =>
        i.product.id === productId
          ? { ...i, discount_amount: discount, line_total: i.quantity * i.unit_price - discount }
          : i
      )
    }))
  },

  setCustomer: (customer) => set({ customer }),

  setDiscount: (amount, note = '') => set({ discount_amount: amount, discount_note: note }),

  setNote: (note) => set({ note }),

  clearCart: () => set({
    items: [],
    customer: null,
    discount_amount: 0,
    discount_note: '',
    note: ''
  }),

  getSubtotal: () => {
    const { items } = get()
    return items.reduce((sum, item) => sum + item.line_total, 0)
  },

  getTaxAmount: (vatRate: number, vatIncluded: boolean) => {
    const subtotal = get().getSubtotal()
    const discount = get().discount_amount
    const afterDiscount = subtotal - discount
    if (vatIncluded) {
      return afterDiscount - (afterDiscount / (1 + vatRate / 100))
    }
    return afterDiscount * (vatRate / 100)
  },

  getTotal: () => {
    const { discount_amount } = get()
    return get().getSubtotal() - discount_amount
  }
}))
