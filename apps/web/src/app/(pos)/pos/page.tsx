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
  Key, ChevronRight, Package, Sparkles, Receipt, Percent
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
        try { setAllowedDiscounts(JSON.parse(data.value)) } catch (e) { console.error(e) }
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

  // ── Cart Panel ──────────────────────────────────────────────────
  const CartPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Cart Header */}
      <div style={{
        padding: '16px 18px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        background: 'rgba(10,12,18,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShoppingBag size={17} style={{ color: '#93c5fd' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                รายการสั่งซื้อ
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {itemCount > 0 ? `${itemCount} รายการ` : 'ยังไม่มีสินค้า'}
              </p>
            </div>
          </div>
          {cart.items.length > 0 && (
            <button
              onClick={cart.clearCart}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)',
                color: '#f87171', cursor: 'pointer', transition: 'all 150ms'
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.14)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.06)' }}
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="no-scrollbar" style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cart.items.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', flex: 1, gap: 12, paddingTop: 40
          }}>
            <ShoppingBag size={56} className="bag-float" style={{ color: 'var(--text-muted)' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>ยังไม่มีรายการ</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>แตะสินค้าเพื่อเพิ่มลงตะกร้า</p>
            </div>
          </div>
        ) : (
          cart.items.map((item, idx) => (
            <div key={item.product.id} className="cart-item-row" style={{ animationDelay: `${idx * 30}ms` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                {/* Mini image / icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
                  background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.product.image_url
                    ? <img src={item.product.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 18 }}>🍾</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {item.product.name}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                    {item.product.vintage && `${item.product.vintage} · `}
                    {formatCurrency(item.unit_price)} / ขวด
                  </p>
                </div>
                <button
                  onClick={() => cart.removeItem(item.product.id)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', padding: 4, flexShrink: 0, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 150ms'
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Qty + Price row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    className="qty-btn"
                    onClick={() => cart.updateQuantity(item.product.id, item.quantity - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <span style={{
                    minWidth: 28, textAlign: 'center',
                    fontSize: 15, fontWeight: 800, color: 'var(--text-primary)'
                  }}>
                    {item.quantity}
                  </span>
                  <button
                    className="qty-btn plus"
                    onClick={() => cart.updateQuantity(item.product.id, item.quantity + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <span style={{
                  fontSize: 15, fontWeight: 800,
                  color: 'var(--gold-400)',
                  textShadow: '0 0 20px rgba(242,198,92,0.3)'
                }}>
                  {formatCurrency(item.line_total)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary & Checkout */}
      {cart.items.length > 0 && (
        <div style={{
          padding: '16px 18px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          background: 'rgba(8,10,14,0.7)',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ยอดรวม ({itemCount} รายการ)</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
            </div>
            {cart.discount_amount > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)'
              }}>
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Percent size={11} />
                  {cart.discount_note || 'ส่วนลด'}
                </span>
                <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 700 }}>
                  -{formatCurrency(cart.discount_amount)}
                </span>
              </div>
            )}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 4
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>ยอดสุทธิ</span>
              <span style={{
                fontSize: 22, fontWeight: 900,
                background: 'linear-gradient(135deg,#d8a93c,#f2c65c)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {/* Discount Toggle */}
          <button
            onClick={() => setShowDiscountInput(!showDiscountInput)}
            style={{
              width: '100%', marginBottom: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 14px', borderRadius: 10,
              border: showDiscountInput
                ? '1px solid rgba(59,130,246,0.35)'
                : '1px solid rgba(255,255,255,0.08)',
              background: showDiscountInput
                ? 'rgba(59,130,246,0.08)'
                : 'rgba(255,255,255,0.03)',
              color: showDiscountInput ? '#93c5fd' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 200ms'
            }}
          >
            <Tag size={13} />
            {cart.discount_amount > 0
              ? `ส่วนลด: ${cart.discount_note || formatCurrency(cart.discount_amount)}`
              : 'เพิ่มส่วนลด'
            }
          </button>

          {showDiscountInput && (
            <div className="animate-in" style={{ marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
                {allowedDiscounts.map(pct => {
                  const isCurrent = cart.discount_note === `ส่วนลด ${pct}%`
                  return (
                    <button
                      key={pct}
                      className={`discount-chip ${isCurrent ? 'chip-active' : ''}`}
                      onClick={() => {
                        if (isCurrent) {
                          cart.setDiscount(0, '')
                        } else {
                          const amt = Math.round(subtotal * (pct / 100))
                          if (profile?.role === 'cashier') {
                            setRequestedDiscount(amt)
                            setShowApprovalModal(true)
                            setManagerPinInput('')
                            setApprovalType(null)
                            setOnlineRequestActive(false)
                            setPendingRequestId(null)
                            setOnlineStatus(null)
                          } else {
                            cart.setDiscount(amt, `ส่วนลด ${pct}%`)
                          }
                        }
                      }}
                    >
                      {pct}%
                    </button>
                  )
                })}
              </div>
              {cart.discount_amount > 0 && (
                <button
                  onClick={() => cart.setDiscount(0, '')}
                  style={{
                    width: '100%', padding: '8px', borderRadius: 9,
                    fontSize: 12, fontWeight: 700,
                    border: '1px solid rgba(239,68,68,0.2)',
                    background: 'rgba(239,68,68,0.06)',
                    color: '#f87171', cursor: 'pointer', transition: 'all 150ms'
                  }}
                >
                  ✕ ยกเลิกส่วนลด
                </button>
              )}
            </div>
          )}

          {/* Checkout Button */}
          <button
            onClick={() => setShowCheckout(true)}
            className="checkout-shine"
            style={{
              width: '100%', padding: '15px', fontSize: 15, borderRadius: 14,
              border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#d8a93c 0%,#f2c65c 50%,#d8a93c 100%)',
              backgroundSize: '200% 100%',
              color: '#1a0f00', fontWeight: 900, letterSpacing: 0.3,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 6px 24px rgba(216,169,60,0.4), 0 0 0 1px rgba(242,198,92,0.2)',
              transition: 'transform 150ms ease, box-shadow 150ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 10px 32px rgba(216,169,60,0.55), 0 0 0 1px rgba(242,198,92,0.3)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(216,169,60,0.4), 0 0 0 1px rgba(242,198,92,0.2)'
            }}
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
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(10,12,18,0.8)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            flexShrink: 0,
          }}>
            {/* Search */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1
                }} />
                <input
                  type="text"
                  className="pos-search"
                  style={{
                    width: '100%', paddingLeft: 40, paddingRight: 14,
                    height: 40, fontSize: 13, borderRadius: 99,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: 'var(--text-primary)', outline: 'none',
                    transition: 'all 200ms',
                    boxSizing: 'border-box',
                  }}
                  placeholder="ค้นหาสินค้า / บาร์โค้ด / แบรนด์..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
                      width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'var(--text-muted)'
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              <button
                onClick={() => router.push('/cashier')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 14px', height: 40, fontSize: 12, fontWeight: 700,
                  borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0,
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  color: '#a5b4fc', cursor: 'pointer', transition: 'all 200ms'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)' }}
              >
                <Package size={14} />
                เตรียมสินค้า
              </button>
            </div>

            {/* Category Pills */}
            <div className="no-scrollbar" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
              <button
                className={`cat-pill ${selectedCategory === 'all' ? 'cat-active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                <Sparkles size={12} />
                ทั้งหมด
                <span style={{
                  marginLeft: 2, fontSize: 10, fontWeight: 700,
                  background: selectedCategory === 'all' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  padding: '1px 6px', borderRadius: 99
                }}>
                  {products.length}
                </span>
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`cat-pill ${selectedCategory === cat.id ? 'cat-active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 12
              }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 18, overflow: 'hidden' }}>
                    <div className="skeleton" style={{ aspectRatio: '1', marginBottom: 0 }} />
                    <div style={{ padding: '10px 12px', background: 'rgba(18,21,30,0.7)' }}>
                      <div className="skeleton" style={{ height: 13, borderRadius: 6, marginBottom: 8 }} />
                      <div className="skeleton" style={{ height: 11, borderRadius: 6, width: '55%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)'
              }}>
                <Package size={56} style={{ opacity: 0.15 }} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>ไม่พบสินค้า</p>
                  <p style={{ margin: 0, fontSize: 12 }}>ลองเปลี่ยนคำค้นหาหรือหมวดหมู่</p>
                </div>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text-secondary)', cursor: 'pointer'
                    }}
                  >
                    ล้างการค้นหา
                  </button>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
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
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(10,12,18,0.6)',
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
      >
        <ShoppingBag size={22} />
        {itemCount > 0 && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            width: 20, height: 20, borderRadius: '50%',
            background: 'linear-gradient(135deg,#d8a93c,#f2c65c)',
            color: '#1a0f00',
            fontSize: 10, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(216,169,60,0.5)'
          }}>
            {itemCount > 9 ? '9+' : itemCount}
          </span>
        )}
      </button>

      {/* ── Mobile Cart Sheet ── */}
      {showMobileCart && (
        <div className="cart-sheet" style={{ display: 'block' }}>
          <div className="cart-sheet-backdrop" onClick={() => setShowMobileCart(false)} />
          <div className="cart-sheet-panel">
            <div className="cart-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px 0', flexShrink: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>🛒 ตะกร้าสินค้า</span>
              <button
                onClick={() => setShowMobileCart(false)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <CartPanel />
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout Modal ── */}
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
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)'
        }}>
          <div
            className="animate-pop"
            style={{
              width: '100%', maxWidth: 380, margin: '0 16px',
              borderRadius: 22,
              background: 'linear-gradient(180deg,rgba(18,21,32,0.98) 0%,rgba(12,14,22,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 22px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Key size={17} style={{ color: '#93c5fd' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>ขออนุมัติส่วนลด</h3>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>ต้องได้รับอนุมัติจากผู้จัดการ</p>
                </div>
              </div>
              <button
                onClick={() => { setShowApprovalModal(false); setOnlineRequestActive(false) }}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '20px 22px' }}>
              {/* Amount display */}
              <div style={{
                background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)',
                borderRadius: 14, padding: '14px 18px', marginBottom: 18, textAlign: 'center'
              }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>ส่วนลดที่ขออนุมัติ</p>
                <p style={{
                  margin: 0, fontSize: 28, fontWeight: 900,
                  background: 'linear-gradient(135deg,#d8a93c,#f2c65c)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>
                  {formatCurrency(requestedDiscount)}
                </p>
              </div>

              {!approvalType && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => setApprovalType('pin')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 200ms'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  >
                    <Key size={15} style={{ color: '#93c5fd' }} />
                    กรอก PIN ผู้จัดการ
                  </button>
                  <button
                    onClick={() => setApprovalType('online')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      border: 'none', background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
                      color: 'white', cursor: 'pointer', transition: 'all 200ms',
                      boxShadow: '0 4px 16px rgba(59,130,246,0.35)'
                    }}
                  >
                    ส่งคำขออนุมัติออนไลน์
                  </button>
                </div>
              )}

              {approvalType === 'pin' && (
                <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8, fontWeight: 600 }}>
                      รหัส PIN ผู้จัดการ
                    </label>
                    <input
                      type="password" maxLength={4} placeholder="••••"
                      value={managerPinInput} onChange={e => setManagerPinInput(e.target.value)}
                      required
                      style={{
                        width: '100%', textAlign: 'center', fontSize: 28, letterSpacing: 16, fontWeight: 800,
                        height: 58, borderRadius: 12,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                        transition: 'border-color 200ms'
                      }}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="submit"
                      style={{
                        flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
                        color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      ยืนยัน
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovalType(null)}
                      style={{
                        flex: 1, padding: '13px', borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      ย้อนกลับ
                    </button>
                  </div>
                </form>
              )}

              {approvalType === 'online' && (
                <div>
                  {!onlineRequestActive ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8, fontWeight: 600 }}>
                          เหตุผลการขอส่วนลด
                        </label>
                        <input
                          type="text" value={discountReason}
                          onChange={e => setDiscountReason(e.target.value)}
                          placeholder="เช่น ลูกค้า VIP"
                          style={{
                            width: '100%', height: 42, borderRadius: 10, fontSize: 13, padding: '0 14px',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={handleSendOnlineRequest}
                          style={{
                            flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                            background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
                            color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ส่งขออนุมัติ
                        </button>
                        <button
                          onClick={() => setApprovalType(null)}
                          style={{
                            flex: 1, padding: '13px', borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                            color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ย้อนกลับ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                        <Loader2 size={40} className="animate-spin" style={{ color: '#93c5fd' }} />
                      </div>
                      <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        รอผู้จัดการอนุมัติ...
                      </p>
                      <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)' }}>
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
                          borderRadius: 10, padding: '9px 20px', fontSize: 13, fontWeight: 700,
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
    setTimeout(() => setAdding(false), 420)
  }

  const isLowStock = product.stock <= product.min_stock && product.stock > 0
  const isOutOfStock = product.stock <= 0

  return (
    <button
      onClick={handleAdd}
      disabled={isOutOfStock}
      className={`pos-product-card animate-in ${adding ? 'adding-flash' : ''}`}
      style={{ opacity: isOutOfStock ? 0.38 : 1 }}
    >
      {/* Image */}
      <div style={{
        aspectRatio: '1 / 1',
        background: 'linear-gradient(135deg,rgba(18,24,48,0.9),rgba(6,8,16,0.95))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden', flexShrink: 0
      }}>
        {product.image_url ? (
          <img
            src={product.image_url} alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 400ms ease' }}
          />
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
          }}>
            <span style={{ fontSize: 36, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}>🍾</span>
          </div>
        )}

        {/* Gradient overlay bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
          background: 'linear-gradient(to top, rgba(8,10,16,0.9) 0%, transparent 100%)',
          pointerEvents: 'none'
        }} />

        {/* Stock badge */}
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          {isOutOfStock ? (
            <span style={{
              background: 'rgba(239,68,68,0.18)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, padding: '2px 7px', fontSize: 9, fontWeight: 800,
              backdropFilter: 'blur(8px)'
            }}>
              หมดคลัง
            </span>
          ) : isLowStock ? (
            <span style={{
              background: 'rgba(245,158,11,0.18)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 6, padding: '2px 7px', fontSize: 9, fontWeight: 800,
              backdropFilter: 'blur(8px)'
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
            background: 'rgba(30,64,175,0.55)', backdropFilter: 'blur(4px)',
            opacity: adding ? 1 : 0,
            transition: 'opacity 200ms ease'
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              transform: adding ? 'scale(1)' : 'scale(0.7)',
              transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1)'
            }}>
              <CheckCircle2 size={22} style={{ color: '#2563eb' }} />
            </div>
          </div>
        )}

        {/* Plus icon — visible on hover via CSS */}
        {!isOutOfStock && !adding && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            width: 26, height: 26, borderRadius: 8,
            background: 'rgba(59,130,246,0.85)',
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
            backdropFilter: 'blur(4px)',
          }}>
            <Plus size={14} style={{ color: 'white' }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3, width: '100%', boxSizing: 'border-box' }}>
        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden', textAlign: 'left', minHeight: 32
        }}>
          {product.name}
        </p>
        {product.brand && (
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', textAlign: 'left', fontWeight: 500 }}>
            {product.brand}{product.vintage && ` · ${product.vintage}`}
          </p>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 900,
            background: 'linear-gradient(135deg,#d8a93c,#f2c65c)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {formatCurrency(product.price)}
          </span>
        </div>
      </div>
    </button>
  )
}
