'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { HoldSale } from '@/lib/types'
import { useCartStore } from '@/lib/store/cart'
import {
  PauseCircle, Trash2, PlayCircle, ShoppingCart, Loader2, X, Wine
} from 'lucide-react'

export default function HoldsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { clearCart, addItem, setCustomer } = useCartStore()

  const [holds, setHolds] = useState<HoldSale[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<HoldSale | null>(null)

  useEffect(() => { loadHolds() }, [])

  const loadHolds = async () => {
    setLoading(true)
    try {
      const { data: rawHolds, error } = await supabase
        .from('hold_sales')
        .select('*, hold_sale_items(*)')
        .order('created_at', { ascending: false })

      if (error) throw error
      let holdsData: any[] = rawHolds || []

      // Fallback manual join for customers
      const customerIds = [...new Set(holdsData.map(h => h.customer_id).filter(Boolean))]
      if (customerIds.length > 0) {
        const { data: customersData } = await supabase
          .from('customers')
          .select('*')
          .in('id', customerIds)
        if (customersData) {
          holdsData = holdsData.map(h => ({
            ...h,
            customers: customersData.find(c => c.id === h.customer_id) || null
          }))
        }
      }

      // Fallback manual join for profiles (cashier)
      const cashierIds = [...new Set(holdsData.map(h => h.created_by).filter(Boolean))]
      if (cashierIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', cashierIds)
        if (profilesData) {
          holdsData = holdsData.map(h => ({
            ...h,
            profiles: profilesData.find(p => p.id === h.created_by) || null
          }))
        }
      }

      setHolds(holdsData as HoldSale[])
    } catch (err) {
      console.error('Error loading holds:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleResume = async (hold: HoldSale) => {
    setResumingId(hold.id)
    // Load all product details for hold items
    const productIds = (hold.hold_sale_items || []).map(i => i.product_id)
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds)

    // Clear current cart and load hold items
    clearCart()
    if (hold.customers) setCustomer(hold.customers)

    for (const item of hold.hold_sale_items || []) {
      const product = products?.find(p => p.id === item.product_id)
      if (product) {
        // Add item and update quantity
        addItem(product)
        const store = useCartStore.getState()
        store.updateQuantity(product.id, item.quantity)
      }
    }

    // Delete the hold
    await supabase.from('hold_sales').delete().eq('id', hold.id)
    setResumingId(null)
    router.push('/pos')
  }

  const handleDelete = async (hold: HoldSale) => {
    setDeletingId(hold.id)
    await supabase.from('hold_sales').delete().eq('id', hold.id)
    setHolds(prev => prev.filter(h => h.id !== hold.id))
    setConfirmDelete(null)
    setDeletingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--wine-500)' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-1">บิลพัก</h1>
          <p style={{ color: 'var(--text-muted)' }} className="text-sm">
            {holds.length > 0 ? `${holds.length} บิลที่พักไว้` : 'ไม่มีบิลที่พักไว้'}
          </p>
        </div>
        <button onClick={() => router.push('/pos')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
          <ShoppingCart size={16} /> กลับไปขาย
        </button>
      </div>

      {/* Empty State */}
      {holds.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'rgba(139,0,0,0.1)' }}>
            <PauseCircle size={36} style={{ color: 'var(--wine-300)', opacity: 0.5 }} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">ไม่มีบิลพัก</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            เมื่อพักบิลในหน้าขาย บิลจะปรากฏที่นี่
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {holds.map(hold => {
            const items = hold.hold_sale_items || []
            const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity - i.discount_amount, 0)
            const isResuming = resumingId === hold.id
            const isDeleting = deletingId === hold.id

            return (
              <div key={hold.id} className="glass-card p-5 card-hover"
                style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Hold Icon */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(139,0,0,0.15)' }}>
                  <Wine size={22} style={{ color: 'var(--wine-300)' }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--wine-300)' }}>
                      {hold.hold_no}
                    </span>
                    {hold.customers && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {hold.customers.full_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(hold.created_at)}
                    {(hold as any).profiles?.full_name && ` · ${(hold as any).profiles.full_name}`}
                  </p>
                  {/* Items preview */}
                  <div className="flex flex-wrap gap-1">
                    {items.slice(0, 3).map(item => (
                      <span key={item.id} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                        {item.product_name} ×{item.quantity}
                      </span>
                    ))}
                    {items.length > 3 && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                        +{items.length - 3} รายการ
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold" style={{ color: 'var(--gold-400)' }}>
                    {formatCurrency(hold.subtotal || subtotal)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{items.length} รายการ</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleResume(hold)}
                    disabled={isResuming}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: 'rgba(34,197,94,0.15)',
                      color: '#22c55e',
                      border: '1px solid rgba(34,197,94,0.3)',
                      opacity: isResuming ? 0.7 : 1
                    }}>
                    {isResuming
                      ? <Loader2 size={14} className="animate-spin" />
                      : <PlayCircle size={14} />}
                    เรียกคืน
                  </button>
                  <button
                    onClick={() => setConfirmDelete(hold)}
                    className="p-2 rounded-xl transition-colors"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="glass-card p-6 animate-in" style={{ width: 380, maxWidth: '95vw' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)' }}>
                <Trash2 size={18} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h3 className="font-bold text-white">ลบบิลพัก</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{confirmDelete.hold_no}</p>
              </div>
              <button onClick={() => setConfirmDelete(null)} className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              คุณแน่ใจหรือไม่ว่าต้องการลบบิลพักนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                ยกเลิก
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                {deletingId === confirmDelete.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                ลบบิล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
