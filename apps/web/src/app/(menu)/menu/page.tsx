'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Product, Category, Customer } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  Search, ShoppingBag, Plus, Minus, Trash2,
  X, ArrowLeft, Loader2, CheckCircle2, ChevronRight,
  Upload, Star, Key, Sparkles, Package, Shield, QrCode
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

type Step = 'menu' | 'cart' | 'checkout' | 'success' | 'member_only'

interface CartItem { product: Product; quantity: number }
interface OrderResult {
  id: string; receipt_no: string; total: number
  points_earned: number; member?: Customer | null
}

// ── EMVCo PromptPay Generator ──
function generatePromptPayPayload(target: string, amount: number) {
  let cleanTarget = target.replace(/[^0-9]/g, '')
  const isMobile = cleanTarget.startsWith('0') || cleanTarget.startsWith('0066')
  if (cleanTarget.length === 10 && cleanTarget.startsWith('0')) cleanTarget = '0066' + cleanTarget.slice(1)
  const targetType = isMobile ? '0113' : '0213'
  const payload = [
    '000201', '010211',
    '2937' + ['0016A000000677010111', targetType + cleanTarget].join(''),
    '5303764',
    amount ? ('54' + ('0' + amount.toFixed(2).length).slice(-2) + amount.toFixed(2)) : '',
    '5802TH', '6304'
  ].join('')
  let crc = 0xFFFF
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1
  }
  crc = crc & 0xFFFF
  return payload + ('0000' + crc.toString(16).toUpperCase()).slice(-4)
}

export default function CustomerMenuPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#07080a',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16
      }}>
        <img src="/logo.jpg" alt="Logo" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }} className="animate-pulse" />
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>กำลังโหลดเมนู...</p>
      </div>
    }>
      <CustomerMenuContent />
    </Suspense>
  )
}

// ════════════════════════════════════════════════════════════
function CustomerMenuContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const tableParam = searchParams.get('table') || ''

  const NAV_BG = 'rgba(8,9,13,0.95)'
  const bottomBar: React.CSSProperties = {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
    background: NAV_BG, backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderTop: '1px solid rgba(255,255,255,0.07)', zIndex: 50
  }
  const customStyles = `
    .menu-gradient-bg {
      background: radial-gradient(circle at 10% 20%, rgba(30, 64, 175, 0.15) 0%, transparent 40%),
                  radial-gradient(circle at 90% 80%, rgba(216, 169, 60, 0.08) 0%, transparent 45%),
                  #07080a;
    }
    .pos-btn-gradient-blue {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
    }
    .pos-btn-gradient-blue:active {
      transform: scale(0.98);
      opacity: 0.95;
    }
    .pos-btn-gradient-gold {
      background: linear-gradient(135deg, #d8a93c 0%, #f2c65c 100%);
      box-shadow: 0 4px 20px rgba(216, 169, 60, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #1a1200;
    }
    .pos-btn-gradient-gold:active {
      transform: scale(0.98);
    }
    .glass-menu-card {
      background: rgba(22, 25, 32, 0.65);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .premium-input {
      width: 100%;
      padding: 12px 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      color: white;
      outline: none;
      transition: all 180ms ease;
    }
    .premium-input:focus {
      background: rgba(255,255,255,0.08);
      border-color: rgba(59,130,246,0.5);
      box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
    }
    .tag-badge {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      background: rgba(255,255,255,0.06);
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.04);
    }
    .no-scrollbar::-webkit-scrollbar { display: none; }
  `

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('The Bottle Club')
  const [promptPayId, setPromptPayId] = useState('0922809619')
  const [promptPayName, setPromptPayName] = useState('บัญชีร้านค้า')

  const [step, setStep] = useState<Step>('menu')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])

  const [memberPhone, setMemberPhone] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [foundMember, setFoundMember] = useState<Customer | null>(null)
  const [memberSearchDone, setMemberSearchDone] = useState(false)
  const [memberMode, setMemberMode] = useState<'lookup' | 'register' | 'skip'>('lookup')
  const [searchingMember, setSearchingMember] = useState(false)
  const [memberPin, setMemberPin] = useState('')
  const [loggedInMember, setLoggedInMember] = useState<Customer | null>(null)

  const [orderResult, setOrderResult] = useState<OrderResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploadingSlip, setUploadingSlip] = useState(false)
  const [slipUrl, setSlipUrl] = useState('')
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    loadData()
    const cached = typeof window !== 'undefined' ? localStorage.getItem('wc_customer') : null
    if (cached) { try { setLoggedInMember(JSON.parse(cached)) } catch (_) {} }
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: cats }, { data: prods }, { data: settings }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*, categories(name, icon)').eq('is_active', true).gt('stock', 0).order('name'),
      supabase.from('settings').select('key, value').in('key', ['shop_name', 'promptpay_id', 'bank_account_name'])
    ])
    setCategories(cats || [])
    setProducts(prods || [])
    if (settings) {
      const s = (k: string) => settings.find(x => x.key === k)?.value
      if (s('shop_name')) setShopName(s('shop_name')!)
      if (s('promptpay_id')) setPromptPayId(s('promptpay_id')!)
      if (s('bank_account_name')) setPromptPayName(s('bank_account_name')!)
    }
    setLoading(false)
  }

  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory
    const q = searchQuery.toLowerCase()
    return matchCat && (!q || p.name.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) || p.grape?.toLowerCase().includes(q))
  })

  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      return ex ? prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
               : [...prev, { product, quantity: 1 }]
    })
  }

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i.product.id !== id))
    else setCart(prev => prev.map(i => i.product.id === id ? { ...i, quantity: qty } : i))
  }

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const getQty = (id: string) => cart.find(i => i.product.id === id)?.quantity || 0

  const searchMember = async () => {
    if (!memberPhone.trim()) return
    setSearchingMember(true)
    const { data } = await supabase.from('customers').select('*').eq('phone', memberPhone.trim()).eq('is_active', true).single()
    setFoundMember(data)
    setMemberSearchDone(true)
    setSearchingMember(false)
    if (data) setMemberMode('lookup')
  }

  const submitOrder = async () => {
    if (cart.length === 0) return
    setSubmitting(true)
    setOrderError('')
    try {
      let customer: Customer | null = loggedInMember || foundMember
      if (!loggedInMember && memberMode === 'register' && memberName.trim()) {
        const memberCode = `M${Date.now().toString().slice(-8)}`
        const { data: newMember, error: memberErr } = await supabase.from('customers').insert({
          full_name: memberName.trim(), phone: memberPhone.trim() || null,
          email: memberEmail.trim() || null, member_code: memberCode,
          password: memberPin.trim() || null
        }).select().single()
        if (!memberErr) customer = newMember
      }
      const receiptNo = `WC${Date.now().toString().slice(-10)}`
      const totalAmount = cartTotal
      const pointsEarned = Math.floor(totalAmount / 100)
      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
        receipt_no: receiptNo, customer_id: customer?.id || null, cashier_id: null,
        status: 'pending', subtotal: cartTotal, discount_amount: 0, tax_amount: 0,
        service_charge: 0, total_amount: totalAmount, payment_method: 'qr',
        points_earned: pointsEarned,
        note: tableParam ? `สั่งจาก QR Code โต๊ะ ${tableParam}` : 'สั่งจาก QR Code',
        table_no: tableParam || null
      }).select().single()
      if (saleErr) throw new Error(saleErr.message)
      await supabase.from('sale_items').insert(
        cart.map(item => ({
          sale_id: sale.id, product_id: item.product.id, product_name: item.product.name,
          sku: item.product.sku || null, unit_price: item.product.price, cost: item.product.cost,
          quantity: item.quantity, discount_amount: 0, line_total: item.product.price * item.quantity
        }))
      )
      if (customer) {
        await supabase.from('customers').update({
          points: (customer.points || 0) + pointsEarned,
          total_spent: (customer.total_spent || 0) + totalAmount
        }).eq('id', customer.id)
      }
      setOrderResult({ id: sale.id, receipt_no: receiptNo, total: totalAmount, points_earned: pointsEarned, member: customer })
      setStep('success')
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !orderResult) return
    setUploadingSlip(true); setUploadError('')
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${orderResult.id}_${Date.now()}.${fileExt}`
      const { error: uploadErr } = await supabase.storage.from('slips').upload(fileName, file)
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('slips').getPublicUrl(fileName)
      const { data: saleData } = await supabase.from('sales').select('note').eq('id', orderResult.id).single()
      const note = saleData?.note ? `${saleData.note} | SLIP:${publicUrl}` : `SLIP:${publicUrl}`
      await supabase.from('sales').update({ note }).eq('id', orderResult.id)
      setSlipUrl(publicUrl)
    } catch (err: any) {
      setUploadError(err.message || 'เกิดข้อผิดพลาดในการอัปโหลด')
    } finally {
      setUploadingSlip(false)
    }
  }

  const resetAll = () => {
    setCart([]); setStep('menu'); setFoundMember(null); setMemberSearchDone(false)
    setMemberPhone(''); setMemberName(''); setMemberEmail(''); setMemberMode('lookup')
    setOrderResult(null); setOrderError(''); setSuccess(''); setSlipUrl(''); setUploadError('')
  }


  // ═══════════════════════════════════════════════════════════
  // SUCCESS SCREEN
  if (step === 'success' && orderResult) {
    const qrPayload = generatePromptPayPayload(promptPayId, orderResult.total)
    return (
      <div className="menu-gradient-bg" style={{ minHeight: '100dvh', overflowY: 'auto' }}>
        <style>{customStyles}</style>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px 48px' }}>

          {/* Success Title */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            {tableParam && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
                color: '#93c5fd', padding: '6px 18px', borderRadius: 999, fontSize: 13,
                fontWeight: 800, marginBottom: 20
              }}>
                🍾 โต๊ะ {tableParam}
              </div>
            )}
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              background: 'linear-gradient(135deg,#16a34a,#22c55e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', boxShadow: '0 0 30px rgba(34,197,94,0.3)'
            }}>
              <CheckCircle2 size={38} color="white" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>สั่งสินค้าสำเร็จ!</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
              เลขที่คำสั่งซื้อ: <span style={{ color: '#fbbf24', fontWeight: 700 }}>#{orderResult.receipt_no}</span>
            </p>
          </div>

          {/* PromptPay QR */}
          <div className="glass-menu-card" style={{ padding: '24px 20px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#003b6a', color: 'white', padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.5px', marginBottom: 16 }}>
              PROMPT PAY
            </div>
            <div style={{ background: 'white', padding: 16, borderRadius: 16, display: 'inline-block', marginBottom: 14 }}>
              <QRCodeSVG value={qrPayload} size={180} level="M" />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'white' }}>{promptPayName}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>พร้อมเพย์: {promptPayId}</p>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '14px'
            }}>
              <p style={{ margin: '0 0 2px', fontSize: 12, color: 'var(--text-muted)' }}>ยอดชำระเงิน</p>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: 'var(--gold-400)' }}>{formatCurrency(orderResult.total)}</p>
            </div>
          </div>

          {/* Slip Upload */}
          <div className="glass-menu-card" style={{ padding: '20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Upload size={16} style={{ color: '#93c5fd' }} />
              <p style={{ margin: 0, fontWeight: 700, color: 'white', fontSize: 14 }}>แนบสลิปเพื่อยืนยัน</p>
            </div>
            {slipUrl ? (
              <div>
                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(34,197,94,0.3)', marginBottom: 10 }}>
                  <img src={slipUrl} alt="Payment Slip" style={{ width: '100%', display: 'block' }} />
                </div>
                <p style={{ margin: 0, color: '#4ade80', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
                  ✅ แนบสลิปเรียบร้อย เจ้าหน้าที่จะรีบดำเนินการส่งอาหาร/เครื่องดื่ม
                </p>
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                  เมื่อสแกนโอนเงินสำเร็จแล้ว กรุณาแนบรูปภาพสลิปด้านล่างนี้
                </p>
                <input type="file" accept="image/*" id="slip-upload" onChange={handleSlipUpload} disabled={uploadingSlip} style={{ display: 'none' }} />
                <label htmlFor="slip-upload" style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '24px', border: '2px dashed rgba(255,255,255,0.1)',
                  borderRadius: 14, cursor: uploadingSlip ? 'not-allowed' : 'pointer',
                  background: 'rgba(255,255,255,0.02)', textAlign: 'center',
                  transition: 'border-color 200ms'
                }}>
                  {uploadingSlip
                    ? <><Loader2 size={24} className="animate-spin" style={{ color: '#93c5fd' }} /><span style={{ fontSize: 13, color: 'white' }}>กำลังอัปโหลดสลิป...</span></>
                    : <><Upload size={24} style={{ color: '#93c5fd' }} /><span style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>แตะที่นี่เพื่ออัปโหลดสลิป</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>รองรับ JPG, PNG</span></>
                  }
                </label>
                {uploadError && <p style={{ color: '#fca5a5', fontSize: 12, marginTop: 8, textAlign: 'center' }}>⚠ {uploadError}</p>}
              </div>
            )}
          </div>

          <button onClick={resetAll} className="pos-btn-gradient-blue" style={{
            width: '100%', padding: '16px', borderRadius: 16, fontSize: 15,
            fontWeight: 700, cursor: 'pointer', border: 'none'
          }}>
            สั่งรายการอื่นเพิ่ม
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // CHECKOUT STEP
  if (step === 'checkout') {
    return (
      <div className="menu-gradient-bg" style={{ minHeight: '100dvh', paddingBottom: 120 }}>
        <style>{customStyles}</style>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          height: 56, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', background: NAV_BG, borderBottom: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)'
        }}>
          <button onClick={() => setStep('cart')} style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', cursor: 'pointer'
          }}>
            <ArrowLeft size={18} />
          </button>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>ยืนยันสั่งซื้อ</h2>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
          {/* Order Summary */}
          <div className="glass-menu-card" style={{ padding: 20, marginBottom: 16 }}>
            <p style={{ margin: '0 0 14px', fontWeight: 700, color: 'white', fontSize: 14 }}>รายการสั่ง ({cartCount} รายการ)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cart.map(item => (
                <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: 'white', fontWeight: 600 }}>{item.product.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{formatCurrency(item.product.price)} × {item.quantity}</p>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--gold-400)', fontSize: 15, flexShrink: 0 }}>{formatCurrency(item.product.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontWeight: 700, color: 'white', fontSize: 15 }}>ยอดรวมสุทธิ</span>
              <span style={{ fontWeight: 900, color: 'var(--gold-400)', fontSize: 24 }}>{formatCurrency(cartTotal)}</span>
            </div>
          </div>

          {orderError && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 14, marginBottom: 14, color: '#fca5a5', fontSize: 13 }}>
              {orderError}
            </div>
          )}
        </div>

        {/* Sticky bottom */}
        <div style={bottomBar}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <button onClick={submitOrder} disabled={submitting} className="pos-btn-gradient-blue" style={{
              width: '100%', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1
            }}>
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              {submitting ? 'กำลังส่งคำสั่งซื้อ...' : `ส่งคำสั่งซื้อและชำระเงิน`}
            </button>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              รายการอาหาร/เครื่องดื่ม จะนำไปเสิร์ฟถึงโต๊ะโดยเร็วที่สุด
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // CART STEP
  if (step === 'cart') {
    return (
      <div className="menu-gradient-bg" style={{ minHeight: '100dvh', paddingBottom: 120 }}>
        <style>{customStyles}</style>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          height: 56, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', background: NAV_BG, borderBottom: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)'
        }}>
          <button onClick={() => setStep('menu')} style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', cursor: 'pointer'
          }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>รายการที่เลือก</h2>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>{cartCount} รายการในตะกร้า</p>
          </div>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 100 }}>
              <ShoppingBag size={60} style={{ color: 'var(--brand-cobalt-light)', opacity: 0.2, margin: '0 auto 16px' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>ไม่มีสินค้าในตะกร้า</p>
              <button onClick={() => setStep('menu')} className="pos-btn-gradient-blue" style={{
                marginTop: 20, padding: '12px 28px', borderRadius: 12, border: 'none',
                fontSize: 14, fontWeight: 700, cursor: 'pointer'
              }}>
                กลับไปเลือกเมนู
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cart.map((item, idx) => (
                <div key={item.product.id} className="glass-menu-card animate-in" style={{
                  animationDelay: `${idx * 40}ms`, padding: '14px 16px'
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* Thumbnail */}
                    <div style={{
                      width: 56, height: 56, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {item.product.image_url
                        ? <img src={item.product.image_url} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 24 }}>🍾</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, color: 'white', fontWeight: 600, fontSize: 14 }}>{item.product.name}</p>
                      <p style={{ margin: '2px 0 0', color: 'var(--gold-400)', fontWeight: 700, fontSize: 14 }}>{formatCurrency(item.product.price)}</p>
                    </div>
                    {/* Qty Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => updateQty(item.product.id, item.quantity - 1)} style={{
                        width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: item.quantity === 1 ? '#f87171' : 'white', cursor: 'pointer'
                      }}>
                        {item.quantity === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                      </button>
                      <span style={{ color: 'white', fontWeight: 800, minWidth: 22, textAlign: 'center', fontSize: 16 }}>{item.quantity}</span>
                      <button onClick={() => updateQty(item.product.id, item.quantity + 1)} className="pos-btn-gradient-blue" style={{
                        width: 32, height: 32, borderRadius: 9, border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                      }}>
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10, marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: 'var(--gold-400)', fontWeight: 700, fontSize: 15 }}>{formatCurrency(item.product.price * item.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky bottom CTA */}
        {cart.length > 0 && (
          <div style={bottomBar}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>รวม {cartCount} รายการ</span>
                <span style={{ color: 'var(--gold-400)', fontWeight: 800, fontSize: 20 }}>{formatCurrency(cartTotal)}</span>
              </div>
              <button onClick={() => setStep('checkout')} className="pos-btn-gradient-blue" style={{
                width: '100%', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 'none'
              }}>
                สั่งสินค้าและชำระเงิน <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // MEMBER LOGIN/REGISTER STEP
  if (step === 'member_only') {
    const handleLogin = async () => {
      if (!memberPhone.trim() || !memberPin.trim()) { setOrderError('กรุณากรอกเบอร์โทรและรหัสผ่าน'); return }
      setSubmitting(true); setOrderError('')
      try {
        const { data, error: err } = await supabase.from('customers').select('*').eq('phone', memberPhone.trim()).eq('is_active', true).single()
        if (err || !data) { setOrderError('ไม่พบข้อมูลสมาชิก'); setSubmitting(false); return }
        if (data.password !== memberPin.trim()) { setOrderError('รหัสผ่าน PIN ไม่ถูกต้อง'); setSubmitting(false); return }
        localStorage.setItem('wc_customer', JSON.stringify(data))
        setLoggedInMember(data); setSuccess('เข้าสู่ระบบสำเร็จ!')
        setTimeout(() => { setStep('menu'); setSuccess('') }, 1200)
      } catch { setOrderError('เกิดข้อผิดพลาดในการเชื่อมต่อ') } finally { setSubmitting(false) }
    }
    const handleLogout = () => { localStorage.removeItem('wc_customer'); setLoggedInMember(null); setStep('menu') }

    return (
      <div className="menu-gradient-bg" style={{ minHeight: '100dvh' }}>
        <style>{customStyles}</style>
        <div style={{
          position: 'sticky', top: 0, zIndex: 30, height: 56,
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
          background: NAV_BG, borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)'
        }}>
          <button onClick={() => setStep('menu')} style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', cursor: 'pointer'
          }}>
            <ArrowLeft size={18} />
          </button>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>ระบบสมาชิกสะสมแต้ม</h2>
        </div>

        <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
          {loggedInMember ? (
            <div className="glass-menu-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 800, color: 'white'
              }}>
                {loggedInMember.full_name[0].toUpperCase()}
              </div>
              <h3 style={{ color: 'white', fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>คุณ {loggedInMember.full_name}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 24 }}>รหัสสมาชิก: {loggedInMember.member_code}</p>

              <div style={{
                background: 'rgba(216,169,60,0.06)', border: '1px solid rgba(216,169,60,0.15)',
                borderRadius: 16, padding: '20px', marginBottom: 24
              }}>
                <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)', fontSize: 13 }}>คะแนนสะสมทั้งหมด</p>
                <p style={{ margin: 0, color: 'var(--gold-400)', fontSize: 36, fontWeight: 900 }}>⭐ {loggedInMember.points}</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>แต้ม</p>
              </div>

              <button onClick={handleLogout} style={{
                width: '100%', padding: '14px', borderRadius: 14,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171', fontSize: 14, fontWeight: 700, cursor: 'pointer'
              }}>
                ออกจากระบบ
              </button>
            </div>
          ) : (
            <div className="glass-menu-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Key size={18} style={{ color: 'var(--gold-400)' }} />
                <p style={{ margin: 0, fontWeight: 700, color: 'white', fontSize: 16 }}>เข้าสู่ระบบสมาชิก</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 600 }}>เบอร์โทรศัพท์</label>
                  <input className="premium-input" type="tel" placeholder="0812345678" value={memberPhone} onChange={e => setMemberPhone(e.target.value)} style={{ fontSize: 16 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 600 }}>รหัสผ่าน PIN (4-6 หลัก)</label>
                  <input className="premium-input" type="password" placeholder="••••" maxLength={6} value={memberPin} onChange={e => setMemberPin(e.target.value)} style={{ fontSize: 20, letterSpacing: 10, textAlign: 'center' }} />
                </div>
                {orderError && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>⚠ {orderError}</p>}
                {success && <p style={{ color: '#86efac', fontSize: 13, margin: 0 }}>✅ {success}</p>}
                <button onClick={handleLogin} disabled={submitting} className="pos-btn-gradient-blue" style={{
                  width: '100%', padding: '15px', borderRadius: 14, marginTop: 4, border: 'none',
                  fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}>
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  เข้าสู่ระบบ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN MENU STEP
  return (
    <div className="menu-gradient-bg" style={{ minHeight: '100dvh', paddingBottom: cartCount > 0 ? 94 : 40 }}>
      <style>{customStyles}</style>

      {/* ── Brand Wine Hero Banner ── */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 14px 0' }}>
        <div style={{
          position: 'relative', width: '100%', aspectRatio: '21/9',
          borderRadius: 20, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}>
          <img
            src="/wine_hero.png"
            alt="Wine Collection"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Subtle overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(7,8,10,0.85) 0%, rgba(7,8,10,0.2) 60%, transparent 100%)'
          }} />
        </div>
      </div>

      {/* ── Sticky Header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: NAV_BG, borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)'
      }}>
        {/* Logo and table info */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(30,64,175,0.18) 0%, transparent 100%)',
          padding: '16px 16px 12px', textAlign: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
            <img src="/logo.jpg" alt="Logo" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>{shopName}</span>
            {tableParam && (
              <span className="pos-btn-gradient-blue" style={{
                padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 800
              }}>
                โต๊ะ {tableParam}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
            {tableParam ? `เลือกรายการไวน์และอาหารเสิร์ฟตรงถึง โต๊ะ ${tableParam}` : 'สั่งสินค้าพรีเมียมง่ายๆ จากสมาร์ตโฟนของคุณ'}
          </p>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 14px 6px' }}>
          <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="premium-input"
              style={{ paddingLeft: 38, fontSize: 14 }}
              placeholder="ค้นหาชื่อสินค้า / แบรนด์ / สายพันธุ์องุ่น..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'
              }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Category pills */}
        <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 14px 12px', maxWidth: 480, margin: '0 auto' }}>
          <button
            onClick={() => setSelectedCategory('all')}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: `1px solid ${selectedCategory === 'all' ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
              background: selectedCategory === 'all' ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(255,255,255,0.04)',
              color: selectedCategory === 'all' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 150ms'
            }}
          >
            ✨ ทั้งหมด
          </button>
          {categories.map(cat => {
            const active = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  border: `1px solid ${active ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  background: active ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : 'rgba(255,255,255,0.04)',
                  color: active ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 150ms'
                }}
              >
                <span>{cat.icon || '🍾'}</span> {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Product List ── */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '14px 14px 0' }}>
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-muted)' }}>
            <Package size={52} style={{ margin: '0 auto 14px', opacity: 0.15 }} />
            <p style={{ fontSize: 15 }}>ไม่พบเครื่องดื่มในหมวดหมู่นี้</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredProducts.map((product, idx) => {
              const qty = getQty(product.id)
              return (
                <div
                  key={product.id}
                  className="glass-menu-card animate-in"
                  style={{
                    animationDelay: `${Math.min(idx * 20, 250)}ms`,
                    background: qty > 0 ? 'rgba(59,130,246,0.04)' : undefined,
                    borderColor: qty > 0 ? 'rgba(59,130,246,0.25)' : undefined,
                    padding: '14px', transition: 'all 200ms'
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    {/* Product Image */}
                    <div style={{
                      width: 70, height: 70, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {product.image_url
                        ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 26 }}>🍾</span>}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, color: 'white', fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{product.name}</p>

                      {/* Small dynamic tags */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                        {product.vintage && <span className="tag-badge">{product.vintage}</span>}
                        {product.grape && <span className="tag-badge">{product.grape}</span>}
                        {product.country && <span className="tag-badge">{product.country}</span>}
                        {product.alcohol_percent && <span className="tag-badge">{product.alcohol_percent}%</span>}
                      </div>

                      <p style={{ margin: 0, color: 'var(--gold-400)', fontWeight: 800, fontSize: 16 }}>{formatCurrency(product.price)}</p>
                    </div>

                    {/* Qty edit buttons */}
                    <div style={{ flexShrink: 0 }}>
                      {qty === 0 ? (
                        <button
                          onClick={() => addToCart(product)}
                          className="pos-btn-gradient-blue"
                          style={{
                            width: 38, height: 38, borderRadius: 10, border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          <Plus size={18} color="white" />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => updateQty(product.id, qty - 1)} style={{
                            width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: 'rgba(255,255,255,0.7)', cursor: 'pointer'
                          }}>
                            <Minus size={13} />
                          </button>
                          <span style={{ color: 'white', fontWeight: 800, minWidth: 18, textAlign: 'center', fontSize: 16 }}>{qty}</span>
                          <button onClick={() => addToCart(product)} className="pos-btn-gradient-blue" style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Plus size={13} color="white" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Floating Dynamic Island Cart Bar ── */}
      {cartCount > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', background: NAV_BG, backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <button onClick={() => setStep('cart')} className="pos-btn-gradient-blue" style={{
              width: '100%', padding: '16px 20px', borderRadius: 16, border: 'none',
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer'
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: 'white', flexShrink: 0
              }}>
                {cartCount}
              </div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 700, color: 'white' }}>ดูคำสั่งซื้อที่เลือก</span>
              <span style={{ background: 'rgba(0,0,0,0.2)', padding: '5px 12px', borderRadius: 9, fontSize: 14, fontWeight: 800, color: 'var(--gold-400)', flexShrink: 0 }}>
                {formatCurrency(cartTotal)}
              </span>
              <ChevronRight size={18} color="white" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
