'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/lib/store/cart'
import { Product, Category, Customer } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  Search, ShoppingBag, Plus, Minus, Trash2, User, UserPlus,
  Tag, CreditCard, X, Loader2, AlertCircle, CheckCircle2,
  Key, ChevronRight, Package, Sparkles
} from 'lucide-react'
import CheckoutModal from '@/components/pos/CheckoutModal'
import CustomerSearchModal from '@/components/pos/CustomerSearchModal'

export default function POSPage() {
  const supabase = createClient()
  const router = useRouter()
  const cart = useCartStore()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [showDiscountInput, setShowDiscountInput] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [allowedDiscounts, setAllowedDiscounts] = useState<number[]>([10, 20, 30, 40, 50, 60, 70, 80, 90])

  // Manager discount approval states
  const [profile, setProfile] = useState<any>(null)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [approvalType, setApprovalType] = useState<'pin' | 'online' | null>(null)
  const [managerPinInput, setManagerPinInput] = useState('')
  const [discountReason, setDiscountReason] = useState('ส่วนลดลูกค้าสัมพันธ์')
  const [requestedDiscount, setRequestedDiscount] = useState(0)

  const [onlineRequestActive, setOnlineRequestActive] = useState(false)
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null)
  const [onlineStatus, setOnlineStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)

  useEffect(() => {
    loadData()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
          setProfile(data)
        })
      }
    })
    supabase.from('settings').select('value').eq('key', 'allowed_discounts').single().then(({ data }) => {
      if (data?.value) {
        try {
          setAllowedDiscounts(JSON.parse(data.value))
        } catch (e) {
          console.error(e)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!onlineRequestActive || !pendingRequestId) return
    const interval = setInterval(async () => {
      const { data } = await supabase.from('sales').select('note').eq('id', pendingRequestId).single()
      if (data) {
        if (data.note.startsWith('APPROVED_DISCOUNT:')) {
          clearInterval(interval)
          setOnlineStatus('approved')
          cart.setDiscount(requestedDiscount, `อนุมัติโดยผู้จัดการ (ออนไลน์)`)
          await supabase.from('sales').delete().eq('id', pendingRequestId)
          setTimeout(() => {
            setShowApprovalModal(false)
            setShowDiscountInput(false)
            setDiscountInput('')
            alert('ผู้จัดการอนุมัติส่วนลดออนไลน์สำเร็จ!')
          }, 1000)
        } else if (data.note === 'REJECTED_DISCOUNT') {
          clearInterval(interval)
          setOnlineStatus('rejected')
          await supabase.from('sales').delete().eq('id', pendingRequestId)
          setTimeout(() => {
            alert('คำขอส่วนลดถูกปฏิเสธโดยผู้จัดการ!')
            setOnlineRequestActive(false)
          }, 1000)
        }
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [onlineRequestActive, pendingRequestId, requestedDiscount])

  const loadData = async () => {
    setLoading(true)
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*, categories(*)').eq('is_active', true).order('name')
    ])
    setCategories(cats || [])
    setProducts(prods || [])
    setLoading(false)
  }

  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q) ||
      p.brand?.toLowerCase().includes(q) || p.grape?.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  const subtotal = cart.getSubtotal()
  const total = cart.getTotal()
  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0)

  const applyDiscount = () => {
    const amount = parseFloat(discountInput)
    if (!isNaN(amount) && amount >= 0 && amount <= subtotal) {
      if (profile?.role === 'cashier') {
        setRequestedDiscount(amount)
        setShowApprovalModal(true)
        setManagerPinInput('')
        setApprovalType(null)
        setOnlineRequestActive(false)
        setPendingRequestId(null)
        setOnlineStatus(null)
      } else {
        cart.setDiscount(amount, 'ส่วนลดพิเศษ')
        setShowDiscountInput(false)
        setDiscountInput('')
      }
    }
  }

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { data: settingData } = await supabase.from('settings').select('value').eq('key', 'manager_pin').single()
      const pin = settingData?.value || '8888'
      if (managerPinInput === pin) {
        cart.setDiscount(requestedDiscount, `อนุมัติโดยผู้จัดการ (PIN)`)
        setShowApprovalModal(false)
        setShowDiscountInput(false)
        setDiscountInput('')
        alert('อนุมัติส่วนลดสำเร็จ!')
      } else {
        alert('รหัส PIN ผู้จัดการไม่ถูกต้อง!')
      }
    } catch {
      if (managerPinInput === '8888' || managerPinInput === '1234') {
        cart.setDiscount(requestedDiscount, `อนุมัติโดยผู้จัดการ (PIN)`)
        setShowApprovalModal(false)
        setShowDiscountInput(false)
        setDiscountInput('')
        alert('อนุมัติส่วนลดสำเร็จ!')
      } else {
        alert('รหัส PIN ผู้จัดการไม่ถูกต้อง!')
      }
    }
  }

  const handleSendOnlineRequest = async () => {
    setOnlineRequestActive(true)
    setOnlineStatus('pending')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const reqId = 'REQ-' + Math.floor(100000 + Math.random() * 900000)
      const { data: requestSale, error } = await supabase.from('sales').insert({
        receipt_no: reqId, status: 'pending',
        total_amount: requestedDiscount, subtotal,
        discount_amount: requestedDiscount,
        note: `PENDING_DISCOUNT:${requestedDiscount}:หน้าร้าน:${discountReason}`,
        cashier_id: user?.id || null
      }).select().single()
      if (error) throw error
      setPendingRequestId(requestSale.id)
    } catch (err: any) {
      alert('ไม่สามารถส่งคำขอได้: ' + err.message)
      setOnlineRequestActive(false)
    }
  }

  // ── Cart Panel (shared between desktop + mobile sheet) ──
  const CartPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Cart Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={17} style={{ color: '#93c5fd' }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>รายการสั่งซื้อ</span>
            {itemCount > 0 && (
              <span style={{
                background: 'rgba(59,130,246,0.15)', color: '#93c5fd',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700
              }}>
                {itemCount}
              </span>
            )}
          </div>
          {cart.items.length > 0 && (
            <button
              onClick={cart.clearCart}
              style={{
                fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
                border: '1px solid var(--border-color)', background: 'none',
                color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 150ms'
              }}
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

      </div>

      {/* Cart Items */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }} className="no-scrollbar">
        {cart.items.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 10,
            color: 'var(--text-muted)', paddingTop: 40
          }}>
            <ShoppingBag size={44} style={{ opacity: 0.2 }} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>ยังไม่มีรายการ</p>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>แตะสินค้าเพื่อเพิ่มลงตะกร้า</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cart.items.map((item, idx) => (
              <div
                key={item.product.id}
                className="animate-in"
                style={{
                  animationDelay: `${idx * 25}ms`,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '10px 12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {item.product.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {item.product.vintage && `${item.product.vintage} · `}
                      {formatCurrency(item.unit_price)} / ขวด
                    </p>
                  </div>
                  <button
                    onClick={() => cart.removeItem(item.product.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f87171'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {/* Qty controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
                      style={{
                        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-color)',
                        background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                      }}
                    >
                      <Minus size={11} />
                    </button>
                    <span style={{
                      width: 32, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)'
                    }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
                      style={{
                        width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)',
                        background: 'rgba(59,130,246,0.1)', color: '#93c5fd',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                      }}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold-400)' }}>
                    {formatCurrency(item.line_total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary & Checkout */}
      {cart.items.length > 0 && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-color)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
              <span>รวม ({itemCount} รายการ)</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {cart.discount_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4ade80' }}>
                <span>ส่วนลด</span>
                <span>-{formatCurrency(cart.discount_amount)}</span>
              </div>
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 2
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>ยอดรวม</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-400)' }}>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Discount Toggle */}
          <button
            onClick={() => setShowDiscountInput(!showDiscountInput)}
            className="btn-ghost"
            style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}
          >
            <Tag size={13} />
            {cart.discount_amount > 0 ? `ส่วนลด: ${cart.discount_note || formatCurrency(cart.discount_amount)}` : 'เพิ่มส่วนลด'}
          </button>

          {showDiscountInput && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }} className="animate-in">
              {allowedDiscounts.map(pct => {
                const isCurrent = cart.discount_note === `ส่วนลด ${pct}%`
                return (
                  <button
                    key={pct}
                    onClick={() => {
                      if (isCurrent) {
                        cart.setDiscount(0, '')
                      } else {
                        const discountAmt = Math.round(subtotal * (pct / 100))
                        cart.setDiscount(discountAmt, `ส่วนลด ${pct}%`)
                      }
                    }}
                    style={{
                      padding: '10px 0',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 700,
                      border: isCurrent ? 'none' : '1px solid var(--border-color)',
                      background: isCurrent ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'rgba(255,255,255,0.03)',
                      color: isCurrent ? 'white' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {pct}%
                  </button>
                )
              })}
              {cart.discount_amount > 0 && (
                <button
                  onClick={() => cart.setDiscount(0, '')}
                  style={{
                    gridColumn: 'span 3',
                    padding: '8px 0',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700,
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    cursor: 'pointer',
                    marginTop: 4
                  }}
                >
                  ยกเลิกส่วนลดทั้งหมด
                </button>
              )}
            </div>
          )}

          {/* Checkout Button */}
          <button
            onClick={() => setShowCheckout(true)}
            className="btn-gold"
            style={{ width: '100%', padding: '14px', fontSize: 15, borderRadius: 14, letterSpacing: 0.02, gap: 10 }}
          >
            <CreditCard size={18} />
            ชำระเงิน {formatCurrency(total)}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* ── Main POS Grid ── */}
      <div className="pos-grid" style={{ height: '100%' }}>

        {/* LEFT: Product Browser */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>

          {/* Search + Filter Bar */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(17, 19, 24, 0.45)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            flexShrink: 0
          }}>
            {/* Search */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none'
                }} />
                <input
                  type="text"
                  className="wine-input"
                  style={{
                    paddingLeft: 38,
                    paddingRight: 14,
                    fontSize: 13,
                    borderRadius: 99,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    transition: 'all 0.2s'
                  }}
                  placeholder="ค้นหาสินค้า ชื่อ / บาร์โค้ด / แบรนด์..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => router.push('/cashier')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 99,
                  whiteSpace: 'nowrap',
                  height: 38,
                  flexShrink: 0,
                  background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                  color: 'white',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Package size={14} />
                เตรียมสินค้า
              </button>
            </div>

            {/* Category Pills */}
            <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              <button
                onClick={() => setSelectedCategory('all')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: selectedCategory === 'all' ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'rgba(255,255,255,0.03)',
                  color: selectedCategory === 'all' ? 'white' : 'var(--text-secondary)',
                  border: selectedCategory === 'all' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: selectedCategory === 'all' ? '0 4px 12px rgba(59,130,246,0.25)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                <Sparkles size={12} />
                ทั้งหมด
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: selectedCategory === cat.id ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'rgba(255,255,255,0.03)',
                    color: selectedCategory === cat.id ? 'white' : 'var(--text-secondary)',
                    border: selectedCategory === cat.id ? 'none' : '1px solid rgba(255,255,255,0.06)',
                    boxShadow: selectedCategory === cat.id ? '0 4px 12px rgba(59,130,246,0.25)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="no-scrollbar" style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
            {loading ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 12
              }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 16, overflow: 'hidden' }}>
                    <div className="skeleton" style={{ aspectRatio: '1', marginBottom: 0 }} />
                    <div style={{ padding: '8px 10px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
                      <div className="skeleton" style={{ height: 12, borderRadius: 4, marginBottom: 6 }} />
                      <div className="skeleton" style={{ height: 10, borderRadius: 4, width: '60%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)'
              }}>
                <Package size={48} style={{ opacity: 0.2 }} />
                <p style={{ margin: 0, fontSize: 14 }}>ไม่พบสินค้า</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="btn-ghost"
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    ล้างการค้นหา
                  </button>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 12
              }}>
                {filteredProducts.map(product => (
                  <ProductCard key={product.id} product={product} onAdd={() => cart.addItem(product)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Desktop Cart */}
        <div
          className="pos-desktop-cart"
          style={{
            borderLeft: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <CartPanel />
        </div>
      </div>

      {/* ── Mobile Cart FAB ── */}
      <button
        className="cart-fab"
        onClick={() => setShowMobileCart(true)}
        style={{ display: undefined }}
      >
        <ShoppingBag size={22} />
        {itemCount > 0 && (
          <span style={{
            position: 'absolute', top: 6, right: 6,
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--gold-400)', color: '#1a1200',
            fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {itemCount}
          </span>
        )}
      </button>

      {/* ── Mobile Cart Sheet ── */}
      {showMobileCart && (
        <div className="cart-sheet" style={{ display: 'block' }}>
          <div className="cart-sheet-backdrop" onClick={() => setShowMobileCart(false)} />
          <div className="cart-sheet-panel">
            <div className="cart-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 0', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>ตะกร้าสินค้า</span>
              <button
                onClick={() => setShowMobileCart(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <CartPanel />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={() => {
            setShowCheckout(false)
            setShowMobileCart(false)
            cart.clearCart()
          }}
        />
      )}
      {showCustomerSearch && (
        <CustomerSearchModal
          onClose={() => setShowCustomerSearch(false)}
          onSelect={(customer) => { cart.setCustomer(customer); setShowCustomerSearch(false) }}
        />
      )}

      {/* ── Manager Approval Modal ── */}
      {showApprovalModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)'
        }}>
          <div
            className="glass-card animate-pop"
            style={{ width: '100%', maxWidth: 360, margin: '0 16px', padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={16} style={{ color: '#93c5fd' }} />
                ขออนุมัติส่วนลด
              </h3>
              <button
                onClick={() => { setShowApprovalModal(false); setOnlineRequestActive(false) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16
            }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>ส่วนลดที่ขอ</p>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--gold-400)' }}>
                {formatCurrency(requestedDiscount)}
              </p>
            </div>

            {!approvalType && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setApprovalType('pin')}
                  className="btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                >
                  <Key size={15} />
                  กรอก PIN ผู้จัดการ
                </button>
                <button
                  onClick={() => setApprovalType('online')}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                >
                  ส่งคำขออนุมัติออนไลน์
                </button>
              </div>
            )}

            {approvalType === 'pin' && (
              <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    รหัส PIN ผู้จัดการ
                  </label>
                  <input
                    type="password" maxLength={4} placeholder="••••"
                    value={managerPinInput} onChange={e => setManagerPinInput(e.target.value)}
                    required className="wine-input"
                    style={{ textAlign: 'center', fontSize: 22, letterSpacing: 12, fontWeight: 700 }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>ยืนยัน</button>
                  <button type="button" onClick={() => setApprovalType(null)} className="btn-ghost">ย้อนกลับ</button>
                </div>
              </form>
            )}

            {approvalType === 'online' && (
              <div>
                {!onlineRequestActive ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                        เหตุผลการขอส่วนลด
                      </label>
                      <input
                        type="text" value={discountReason}
                        onChange={e => setDiscountReason(e.target.value)}
                        className="wine-input" style={{ fontSize: 13 }}
                        placeholder="เช่น ลูกค้า VIP"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleSendOnlineRequest} className="btn-primary" style={{ flex: 1 }}>ส่งขออนุมัติ</button>
                      <button onClick={() => setApprovalType(null)} className="btn-ghost">ย้อนกลับ</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: '#93c5fd', margin: '0 auto 12px' }} />
                    <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      รอผู้จัดการอนุมัติ...
                    </p>
                    <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      แจ้งผู้จัดการตรวจสอบและอนุมัติในหน้า Manager
                    </p>
                    <button
                      onClick={async () => {
                        if (pendingRequestId) await supabase.from('sales').delete().eq('id', pendingRequestId)
                        setOnlineRequestActive(false)
                        setPendingRequestId(null)
                      }}
                      style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600,
                        color: '#f87171', cursor: 'pointer'
                      }}
                    >
                      ยกเลิกคำขอ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════
// Product Card Component
// ══════════════════════════════════════════════
function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const [adding, setAdding] = useState(false)

  const handleAdd = () => {
    if (product.stock <= 0) return
    setAdding(true)
    onAdd()
    setTimeout(() => setAdding(false), 400)
  }

  const isLowStock = product.stock <= product.min_stock && product.stock > 0
  const isOutOfStock = product.stock <= 0

  return (
    <button
      onClick={handleAdd}
      disabled={isOutOfStock}
      className="pos-product-card animate-in"
      style={{
        background: 'rgba(26, 31, 46, 0.45)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderRadius: '18px',
        border: adding ? '1.5px solid rgba(59,130,246,0.6)' : '1px solid rgba(255, 255, 255, 0.07)',
        boxShadow: adding ? '0 0 16px rgba(59,130,246,0.3)' : '0 4px 12px rgba(0,0,0,0.12)',
        opacity: isOutOfStock ? 0.45 : 1,
        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Image / Icon */}
      <div style={{
        aspectRatio: '4/3',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(0,0,0,0.15))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', flexShrink: 0
      }}>
        {product.image_url ? (
          <img
            src={product.image_url} alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22
          }}>
            🍾
          </div>
        )}

        {/* Stock badge */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          {isOutOfStock ? (
            <span style={{
              background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px', padding: '2px 6px', fontSize: 9, fontWeight: 800
            }}>
              หมดคลัง
            </span>
          ) : isLowStock ? (
            <span style={{
              background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px', padding: '2px 6px', fontSize: 9, fontWeight: 800
            }}>
              เหลือ {product.stock}
            </span>
          ) : null}
        </div>

        {/* Add overlay */}
        {!isOutOfStock && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(59,130,246,0.45)', backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            opacity: adding ? 1 : 0,
            transition: 'opacity 200ms ease'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)'
            }}>
              <CheckCircle2 size={20} style={{ color: '#2563eb' }} />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4, width: '100%', boxSizing: 'border-box' }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: 'white',
          lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: 'left'
        }}>
          {product.name}
        </p>
        {product.brand && (
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', textAlign: 'left' }}>
            {product.brand}{product.vintage && ` · ${product.vintage}`}
          </p>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-400)' }}>
            {formatCurrency(product.price)}
          </span>
          {!isOutOfStock && (
            <span style={{
              width: 20, height: 20, borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700
            }}>+</span>
          )}
        </div>
      </div>
    </button>
  )
}
