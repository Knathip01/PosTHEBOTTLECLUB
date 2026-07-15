'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCartStore } from '@/lib/store/cart'
import { formatCurrency, generateReceiptNo } from '@/lib/utils'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import {
  X, Banknote, QrCode, ArrowLeftRight,
  CheckCircle2, Loader2, Printer, ChevronRight,
  Sparkles, Hash, RefreshCw, AlertTriangle, Copy, Check
} from 'lucide-react'

// PromptPay config
const PROMPTPAY_PHONE = '0922809619'

// SCB bank config
const SCB_ACCOUNT_NO = '429-0-90093-3'
const SCB_ACCOUNT_NAME = 'ร้าน The Bottle Club'

type PaymentMethod = 'cash' | 'transfer' | 'qr'

interface CheckoutModalProps {
  onClose: () => void
  onSuccess: () => void
}

/* ─── Numpad keys ─── */
const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫']

/* ─── QR Countdown minutes:seconds ─── */
function formatTimer(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/* ─── Copy to clipboard helper ─── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 8,
      border: copied ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border-color)',
      background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
      color: copied ? '#4ade80' : 'var(--text-muted)',
      fontSize: 11, fontWeight: 600, cursor: 'pointer',
      transition: 'all 0.2s ease',
    }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  )
}

export default function CheckoutModal({ onClose, onSuccess }: CheckoutModalProps) {
  const supabase = createClient()
  const cart = useCartStore()

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashInput, setCashInput] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ receipt_no: string; total: number; change: number } | null>(null)
  const [qrTimer, setQrTimer] = useState(300)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrKey, setQrKey] = useState(0) // force re-generate QR
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const total = cart.getTotal()
  const cashAmount = parseFloat(cashInput) || 0
  const change = paymentMethod === 'cash' ? Math.max(0, cashAmount - total) : 0
  const canPay =
    paymentMethod === 'cash' ? cashAmount >= total : true

  /* ─── Generate PromptPay payload ─── */
  const promptPayPayload = generatePayload(PROMPTPAY_PHONE, { amount: total })

  /* ─── QR countdown ─── */
  useEffect(() => {
    if (paymentMethod !== 'qr') {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current)
      return
    }
    setQrTimer(300)
    setQrExpired(false)
    qrIntervalRef.current = setInterval(() => {
      setQrTimer(prev => {
        if (prev <= 1) {
          clearInterval(qrIntervalRef.current!)
          setQrExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (qrIntervalRef.current) clearInterval(qrIntervalRef.current) }
  }, [paymentMethod, qrKey])

  /* ─── Numpad ─── */
  const handleNumpadPress = (key: string) => {
    if (key === '⌫') { setCashInput(prev => prev.slice(0, -1)); return }
    if (key === '.' && cashInput.includes('.')) return
    if (cashInput.includes('.') && cashInput.split('.')[1]?.length >= 2) return
    setCashInput(prev => (prev === '0' && key !== '.') ? key : prev + key)
  }

  const refreshQR = () => {
    setQrKey(k => k + 1)
    setQrTimer(300)
    setQrExpired(false)
  }

  /* ─── Payment submit ─── */
  const handleConfirmPayment = async () => {
    if (!canPay) return
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้')

      const receiptNo = generateReceiptNo('WC')
      const subtotal = cart.getSubtotal()
      const discountAmount = cart.discount_amount
      const totalAmount = cart.getTotal()

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          receipt_no: receiptNo,
          customer_id: cart.customer?.id || null,
          cashier_id: user.id,
          status: 'paid',
          subtotal,
          discount_amount: discountAmount,
          discount_note: cart.discount_note || null,
          tax_amount: 0,
          service_charge: 0,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          cash_received: paymentMethod === 'cash' ? cashAmount : null,
          change_amount: paymentMethod === 'cash' ? change : 0,
          note: cart.note || null,
          points_earned: Math.floor(totalAmount / 100)
        })
        .select().single()

      if (saleError) throw new Error(saleError.message)

      const saleItems = cart.items.map(item => ({
        sale_id: sale.id,
        product_id: item.product.id,
        product_name: item.product.name,
        sku: item.product.sku || null,
        unit_price: item.unit_price,
        cost: item.product.cost,
        quantity: item.quantity,
        discount_amount: item.discount_amount,
        line_total: item.line_total
      }))
      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems)
      if (itemsError) throw new Error(itemsError.message)

      const { error: payError } = await supabase.from('payments').insert({
        sale_id: sale.id,
        payment_method: paymentMethod,
        amount: totalAmount,
        reference_no: referenceNo || null
      })
      if (payError) throw new Error(payError.message)

      for (const item of cart.items) {
        const newStock = Math.max(0, item.product.stock - item.quantity)
        const { error: prodErr } = await supabase.from('products')
          .update({ stock: newStock }).eq('id', item.product.id)
        if (prodErr) throw new Error(`ไม่สามารถหักสต๊อกได้: ${prodErr.message}`)

        const { error: moveErr } = await supabase.from('inventory_movements').insert({
          product_id: item.product.id,
          movement_type: 'out',
          quantity: -item.quantity,
          quantity_before: item.product.stock,
          quantity_after: newStock,
          reference_type: 'sale',
          reference_id: sale.id,
          note: `ขาย: ${receiptNo}`,
          created_by: user.id
        })
        if (moveErr) throw new Error(`ไม่สามารถบันทึกสต๊อกได้: ${moveErr.message}`)
      }

      if (cart.customer) {
        const pointsEarned = Math.floor(totalAmount / 100)
        const { error: custErr } = await supabase.from('customers')
          .update({
            points: cart.customer.points + pointsEarned,
            total_spent: cart.customer.total_spent + totalAmount
          }).eq('id', cart.customer.id)
        if (custErr) throw new Error(`ไม่สามารถอัปเดตคะแนนได้: ${custErr.message}`)
      }

      setReceipt({ receipt_no: receiptNo, total: totalAmount, change })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  /* ─── Print receipt ─── */
  const handlePrintReceipt = () => {
    if (!receipt) return
    const printWindow = window.open('', '_blank', 'width=350,height=600')
    if (!printWindow) { alert('กรุณาอนุญาตป๊อปอัป'); return }
    const itemsHtml = cart.items.map(item => `
      <tr>
        <td style="padding:4px 0;font-size:13px">${item.product.name} x${item.quantity}</td>
        <td style="padding:4px 0;text-align:right;font-size:13px">${formatCurrency(item.line_total)}</td>
      </tr>`).join('')
    const payLabel = paymentMethod === 'qr' ? 'PromptPay QR' : paymentMethod === 'transfer' ? 'โอน SCB' : 'เงินสด'
    printWindow.document.write(`
      <html><head><title>ใบเสร็จ #${receipt.receipt_no}</title>
      <style>body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:10px;color:#000}
      h2,p{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:10px}
      .dash{border-top:1px dashed #000;margin:8px 0}</style></head><body>
      <h2>The Bottle Club</h2>
      <p style="font-size:10px;color:#555">วันที่: ${new Date().toLocaleString('th-TH')}</p>
      <p style="font-size:10px;color:#555">เลขบิล: ${receipt.receipt_no}</p>
      <div class="dash"></div>
      <table><tbody>${itemsHtml}</tbody></table>
      <div class="dash"></div>
      <table><tbody>
        <tr><td>รวม</td><td style="text-align:right">${formatCurrency(cart.getSubtotal())}</td></tr>
        ${cart.discount_amount > 0 ? `<tr><td>ส่วนลด</td><td style="text-align:right">-${formatCurrency(cart.discount_amount)}</td></tr>` : ''}
        <tr style="font-weight:bold"><td>ยอดสุทธิ</td><td style="text-align:right">${formatCurrency(receipt.total)}</td></tr>
        <tr><td>ชำระด้วย</td><td style="text-align:right">${payLabel}</td></tr>
        ${paymentMethod === 'cash' ? `<tr><td>รับเงิน</td><td style="text-align:right">${formatCurrency(cashAmount)}</td></tr><tr><td>เงินทอน</td><td style="text-align:right">${formatCurrency(receipt.change)}</td></tr>` : ''}
        ${referenceNo ? `<tr><td>เลข ref</td><td style="text-align:right">${referenceNo}</td></tr>` : ''}
      </tbody></table>
      <div class="dash"></div>
      <p style="font-size:10px;margin-top:15px">ขอบคุณที่ใช้บริการ / Thank you</p>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>
      </body></html>`)
    printWindow.document.close()
  }

  /* ─── Method config (no card) ─── */
  const METHODS: {
    key: PaymentMethod
    label: string
    labelEn: string
    icon: React.ReactNode
    color: string
    glow: string
    gradient: string
  }[] = [
    {
      key: 'cash',
      label: 'เงินสด', labelEn: 'Cash',
      icon: <Banknote size={22} />,
      color: '#22c55e', glow: 'rgba(34,197,94,0.25)',
      gradient: 'linear-gradient(135deg,#166534 0%,#22c55e 100%)',
    },
    {
      key: 'qr',
      label: 'สแกน QR', labelEn: 'PromptPay',
      icon: <QrCode size={22} />,
      color: '#a78bfa', glow: 'rgba(167,139,250,0.25)',
      gradient: 'linear-gradient(135deg,#4c1d95 0%,#a78bfa 100%)',
    },
    {
      key: 'transfer',
      label: 'โอนเงิน', labelEn: 'Transfer',
      icon: <ArrowLeftRight size={22} />,
      color: '#38bdf8', glow: 'rgba(56,189,248,0.25)',
      gradient: 'linear-gradient(135deg,#0c4a6e 0%,#38bdf8 100%)',
    },
  ]

  const currentMethod = METHODS.find(m => m.key === paymentMethod)!

  /* ══════════════════════════════════
     SUCCESS SCREEN
  ══════════════════════════════════ */
  if (receipt) {
    return (
      <div style={overlayStyle}>
        <div style={{
          ...panelBase,
          maxWidth: 400,
          padding: 0,
          overflow: 'hidden',
          animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <div style={{ height: 5, background: 'linear-gradient(90deg,#16a34a,#22c55e,#4ade80)' }} />
          <div style={{ padding: '32px 28px 28px', textAlign: 'center' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 18px',
              background: 'linear-gradient(135deg,#16a34a,#22c55e)',
              boxShadow: '0 0 0 16px rgba(34,197,94,0.08),0 0 40px rgba(34,197,94,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both',
            }}>
              <CheckCircle2 size={38} color="white" />
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: 'white' }}>ชำระเงินสำเร็จ!</h2>
            <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--text-muted)' }}>#{receipt.receipt_no}</p>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 16, padding: '16px 20px', marginBottom: 20, textAlign: 'left',
            }}>
              <SummaryRow label="วิธีชำระ" value={currentMethod.label} />
              <SummaryRow label="ยอดชำระ" value={formatCurrency(receipt.total)} bold />
              {paymentMethod === 'cash' && (
                <>
                  <SummaryRow label="รับเงิน" value={formatCurrency(cashAmount)} />
                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>เงินทอน</span>
                    <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(receipt.change)}
                    </span>
                  </div>
                </>
              )}
              {referenceNo && (
                <SummaryRow label="เลขอ้างอิง" value={referenceNo} />
              )}
              {cart.customer && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(242,198,92,0.08)', border: '1px solid rgba(242,198,92,0.2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--gold-400)' }}>
                    ✨ {cart.customer.full_name} ได้รับ {Math.floor(receipt.total / 100)} แต้ม
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={handlePrintReceipt} style={ghostBtnStyle}>
                <Printer size={15} /> พิมพ์ใบเสร็จ
              </button>
              <button onClick={onSuccess} style={{
                ...ghostBtnStyle,
                background: 'linear-gradient(135deg,#166534,#22c55e)',
                borderColor: 'transparent', color: 'white', fontWeight: 700,
              }}>
                <Sparkles size={15} /> บิลใหม่
              </button>
            </div>
          </div>
        </div>
        <style>{globalStyles}</style>
      </div>
    )
  }

  /* ══════════════════════════════════
     PAYMENT SCREEN
  ══════════════════════════════════ */
  return (
    <div className="checkout-overlay" style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="checkout-panel" style={{
        ...panelBase, maxWidth: 480, padding: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '96vh',
        animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Gradient bar */}
        <div style={{ height: 4, background: currentMethod.gradient, transition: 'background 0.4s ease' }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'white' }}>ชำระเงิน</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cart.items.length} รายการ</p>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

          {/* Amount display */}
          <div style={{
            padding: '18px 20px 14px',
            background: `linear-gradient(160deg, rgba(${hexToRgb(currentMethod.color)},0.08) 0%, transparent 60%)`,
            borderBottom: '1px solid var(--border-color)',
            transition: 'background 0.4s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 3px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>ยอดที่ต้องชำระ</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>฿</span>
                  <span style={{
                    fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1,
                    color: currentMethod.color,
                    textShadow: `0 0 28px ${currentMethod.glow}`,
                    transition: 'color 0.4s ease',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {cart.customer && (
                <div style={{
                  padding: '5px 10px', borderRadius: 20,
                  background: 'rgba(242,198,92,0.1)', border: '1px solid rgba(242,198,92,0.2)',
                  fontSize: 11, color: 'var(--gold-400)', whiteSpace: 'nowrap',
                }}>🌟 +{Math.floor(total / 100)} แต้ม</div>
              )}
            </div>
            {cart.discount_amount > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
                  ส่วนลด −{formatCurrency(cart.discount_amount)}
                </span>
              </div>
            )}
          </div>

          {/* Payment method tabs — 3 methods */}
          <div style={{ padding: '14px 20px 0' }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              วิธีชำระเงิน
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {METHODS.map(m => {
                const active = paymentMethod === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setPaymentMethod(m.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 6, padding: '14px 8px', borderRadius: 14,
                      border: active ? `1.5px solid ${m.color}` : '1.5px solid var(--border-color)',
                      background: active
                        ? `linear-gradient(160deg, rgba(${hexToRgb(m.color)},0.18) 0%, rgba(${hexToRgb(m.color)},0.06) 100%)`
                        : 'var(--bg-card)',
                      color: active ? m.color : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                      transform: active ? 'translateY(-2px)' : 'translateY(0)',
                      boxShadow: active ? `0 6px 20px ${m.glow}` : 'none',
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: active ? m.gradient : 'rgba(255,255,255,0.04)',
                      color: active ? 'white' : m.color,
                      transition: 'all 0.25s ease',
                    }}>{m.icon}</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{m.label}</div>
                      <div style={{ fontSize: 9, color: active ? m.color : 'var(--text-muted)', opacity: 0.8 }}>{m.labelEn}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Payment content */}
          <div style={{ padding: '16px 20px 20px' }}>

            {/* ── CASH ── */}
            {paymentMethod === 'cash' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <div style={{
                  borderRadius: 16, padding: '16px 18px',
                  background: 'linear-gradient(160deg,rgba(34,197,94,0.08) 0%,rgba(22,163,74,0.04) 100%)',
                  border: '1px solid rgba(34,197,94,0.2)', marginBottom: 12,
                }}>
                  <p style={{ margin: '0 0 5px', fontSize: 11, color: '#86efac', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    จำนวนเงินที่รับ
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: 15, color: '#86efac' }}>฿</span>
                    <span style={{
                      fontSize: 42, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1,
                      color: cashAmount > 0 ? 'white' : 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{cashInput || '0'}</span>
                  </div>

                  {cashAmount >= total && cashAmount > 0 && (
                    <div style={{
                      marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(34,197,94,0.2)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      animation: 'fadeIn 0.2s ease',
                    }}>
                      <span style={{ fontSize: 13, color: '#86efac' }}>เงินทอน</span>
                      <span style={{ fontSize: 26, fontWeight: 800, color: '#4ade80', textShadow: '0 0 16px rgba(74,222,128,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                        ฿{change.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {cashAmount > 0 && cashAmount < total && (
                    <div style={{
                      marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(239,68,68,0.2)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 13, color: '#fca5a5' }}>ขาดอีก</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                        ฿{(total - cashAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick presets */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => setCashInput(total.toFixed(2))} style={{
                    ...quickPresetStyle,
                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', fontWeight: 700,
                  }}>พอดี ฿{formatCurrency(total)}</button>
                  {[20, 50, 100, 500, 1000].filter(a => a > total).slice(0, 3).map(amt => (
                    <button key={amt} onClick={() => setCashInput(amt.toFixed(2))} style={quickPresetStyle}>
                      ฿{amt.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Numpad */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {NUMPAD_KEYS.map((key, i) => (
                    <button
                      key={`${key}-${i}`}
                      onClick={() => handleNumpadPress(key)}
                      style={{
                        height: 56, borderRadius: 14,
                        border: '1px solid var(--border-color)',
                        background: key === '⌫' ? 'rgba(239,68,68,0.08)' : 'var(--bg-card)',
                        color: key === '⌫' ? '#fca5a5' : 'white',
                        fontSize: key === '⌫' ? 18 : 21, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.1s ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        WebkitUserSelect: 'none', userSelect: 'none',
                      }}
                      onPointerDown={e => {
                        const el = e.currentTarget
                        el.style.transform = 'scale(0.92)'
                        el.style.background = key === '⌫' ? 'rgba(239,68,68,0.2)' : 'var(--bg-elevated)'
                      }}
                      onPointerUp={e => {
                        const el = e.currentTarget
                        el.style.transform = 'scale(1)'
                        el.style.background = key === '⌫' ? 'rgba(239,68,68,0.08)' : 'var(--bg-card)'
                      }}
                    >{key}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── QR PROMPTPAY (Real) ── */}
            {paymentMethod === 'qr' && (
              <div style={{ animation: 'fadeIn 0.2s ease', textAlign: 'center' }}>
                <div style={{
                  borderRadius: 20, padding: '22px 20px',
                  background: 'linear-gradient(160deg,rgba(167,139,250,0.08) 0%,rgba(124,58,237,0.04) 100%)',
                  border: '1px solid rgba(167,139,250,0.25)',
                  marginBottom: 14,
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: 'linear-gradient(135deg,#4c1d95,#a78bfa)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><QrCode size={16} color="white" /></div>
                    <span style={{ fontWeight: 700, color: '#a78bfa', fontSize: 15 }}>PromptPay</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 20, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)' }}>
                      {PROMPTPAY_PHONE}
                    </span>
                  </div>

                  {/* QR Code */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <div style={{
                      padding: 16, borderRadius: 18, background: 'white',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      opacity: qrExpired ? 0.3 : 1,
                      transition: 'opacity 0.3s ease',
                      filter: qrExpired ? 'blur(2px)' : 'none',
                    }}>
                      <QRCodeSVG
                        value={promptPayPayload}
                        size={190}
                        level="M"
                      />
                    </div>

                    {qrExpired && (
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 18,
                        background: 'rgba(10,12,16,0.7)', backdropFilter: 'blur(4px)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 8,
                      }}>
                        <AlertTriangle size={26} color="#fbbf24" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>QR หมดอายุแล้ว</span>
                        <button onClick={refreshQR} style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '7px 16px', borderRadius: 10,
                          background: 'linear-gradient(135deg,#4c1d95,#a78bfa)',
                          border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}>
                          <RefreshCw size={12} /> สร้าง QR ใหม่
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Amount badge */}
                  <div style={{
                    marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 22px', borderRadius: 24,
                    background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
                  }}>
                    <span style={{ fontSize: 13, color: '#c4b5fd' }}>ยอดชำระ</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'white', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(total)}
                    </span>
                  </div>

                  {/* Timer */}
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: qrExpired ? '#ef4444' : '#4ade80',
                      animation: qrExpired ? 'none' : 'blink 1s infinite',
                    }} />
                    <span style={{ fontSize: 12, color: qrExpired ? '#fca5a5' : 'var(--text-muted)' }}>
                      {qrExpired ? 'หมดอายุแล้ว — กด "สร้าง QR ใหม่"' : `หมดอายุใน ${formatTimer(qrTimer)}`}
                    </span>
                  </div>
                </div>

                {/* Ref input */}
                <label style={labelStyle}>เลขอ้างอิงธุรกรรม (ใส่หลังลูกค้าชำระแล้ว)</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="เช่น Ref. 123456789..."
                    value={referenceNo}
                    onChange={e => setReferenceNo(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 40 }}
                  />
                </div>
              </div>
            )}

            {/* ── TRANSFER SCB ── */}
            {paymentMethod === 'transfer' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <div style={{
                  borderRadius: 18, overflow: 'hidden',
                  border: '1px solid rgba(56,189,248,0.25)', marginBottom: 14,
                }}>
                  {/* SCB Bank card */}
                  <div style={{
                    padding: '18px 20px',
                    background: 'linear-gradient(135deg,#4a148c 0%,#7b1fa2 50%,#9c27b0 100%)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Decorative circles */}
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ position: 'absolute', bottom: -10, right: 40, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      {/* SCB logo placeholder */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'rgba(255,255,255,0.15)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontWeight: 900, fontSize: 14, color: 'white', letterSpacing: '-0.5px',
                      }}>SCB</div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, color: 'white', fontSize: 14 }}>ธนาคารไทยพาณิชย์</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Siam Commercial Bank</p>
                      </div>
                    </div>

                    {/* Account number */}
                    <p style={{ margin: '0 0 4px', fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>เลขที่บัญชี</p>
                    <p style={{
                      margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: 'white',
                      letterSpacing: 3, fontVariantNumeric: 'tabular-nums',
                      fontFamily: 'monospace',
                    }}>{SCB_ACCOUNT_NO}</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{SCB_ACCOUNT_NAME}</p>
                  </div>

                  {/* Amount row */}
                  <div style={{
                    padding: '14px 20px',
                    background: 'rgba(56,189,248,0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>ยอดที่ต้องโอน</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: 'white', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(total)}
                        </span>
                        <CopyButton text={total.toFixed(2)} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>เลขบัญชี</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <CopyButton text={SCB_ACCOUNT_NO.replace(/-/g, '')} />
                      </div>
                    </div>
                  </div>

                  {/* Info row */}
                  <div style={{
                    padding: '10px 20px',
                    background: 'rgba(56,189,248,0.04)',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', flexShrink: 0, animation: 'blink 1.5s infinite' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      โอนแล้วกรุณากรอกเลข ref ด้านล่าง แล้วกดยืนยัน
                    </span>
                  </div>
                </div>

                {/* Ref input */}
                <label style={labelStyle}>เลขอ้างอิงการโอน (ไม่บังคับ)</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="เช่น Ref. 202507150001..."
                    value={referenceNo}
                    onChange={e => setReferenceNo(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 40 }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                borderRadius: 12, marginTop: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#fca5a5', fontSize: 13, animation: 'fadeIn 0.2s ease',
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="checkout-footer" style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex', gap: 10,
        }}>
          <button onClick={onClose} style={{ ...ghostBtnStyle, flex: '0 0 auto', padding: '14px 16px' }}>
            <X size={16} />
          </button>
          <button
            onClick={handleConfirmPayment}
            disabled={!canPay || loading}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '15px 20px', borderRadius: 15, border: 'none',
              background: canPay && !loading ? currentMethod.gradient : 'var(--bg-card)',
              color: canPay && !loading ? 'white' : 'var(--text-muted)',
              fontSize: 15, fontWeight: 800,
              cursor: canPay && !loading ? 'pointer' : 'not-allowed',
              boxShadow: canPay && !loading ? `0 8px 24px ${currentMethod.glow}` : 'none',
              transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
              letterSpacing: '-0.3px',
            }}
          >
            {loading
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> กำลังบันทึก...</>
              : <><CheckCircle2 size={17} /> ยืนยันชำระเงิน {formatCurrency(total)}</>
            }
            {!loading && canPay && <ChevronRight size={17} style={{ marginLeft: 'auto' }} />}
          </button>
        </div>
      </div>
      <style>{globalStyles}</style>
    </div>
  )
}

/* ─── Helpers ─── */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 800 : 600, color: bold ? 'white' : 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
}

/* ─── Shared styles ─── */
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100,
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  background: 'rgba(0,0,0,0.78)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
}

const panelBase: React.CSSProperties = {
  width: '100%',
  background: 'rgba(17,19,24,0.97)',
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  boxShadow: '0 -8px 60px rgba(0,0,0,0.6)',
  border: '1px solid rgba(255,255,255,0.07)',
  backdropFilter: 'blur(24px)',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '14px 18px', borderRadius: 13,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  transition: 'all 0.2s ease',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px',
  borderRadius: 13, border: '1.5px solid var(--border-color)',
  background: 'var(--bg-card)',
  color: 'white', fontSize: 15, fontWeight: 600,
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border-color 0.2s ease',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.5px', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 8,
}

const quickPresetStyle: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 10,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
}

const globalStyles = `
  @keyframes slideUp {
    from { opacity:0; transform:translateY(40px) scale(0.97); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes popIn {
    from { transform:scale(0); opacity:0; }
    to   { transform:scale(1); opacity:1; }
  }
  @keyframes fadeIn {
    from { opacity:0; transform:translateY(6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes blink {
    0%,100% { opacity:1; }
    50%      { opacity:0.25; }
  }
  @keyframes spin {
    from { transform:rotate(0deg); }
    to   { transform:rotate(360deg); }
  }
  @media (min-width:640px) {
    .checkout-overlay { align-items:center !important; padding:20px !important; }
    .checkout-panel   { border-radius:24px !important; }
  }
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .checkout-footer { padding-bottom:calc(12px + env(safe-area-inset-bottom)) !important; }
  }
`
