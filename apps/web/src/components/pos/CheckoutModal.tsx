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
  Sparkles, Hash, RefreshCw, AlertTriangle, Copy, Check,
  Camera, Image as ImageIcon, Clock
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
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 8,
      border: copied ? '1.5px solid #16A34A' : '1.5px solid #38BDF8',
      background: copied ? '#DCFCE7' : '#FFFFFF',
      color: copied ? '#15803D' : '#0284C7',
      fontSize: 11, fontWeight: 800, cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
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
  const [receipt, setReceipt] = useState<{ receipt_no: string; total: number; change: number; isPending?: boolean } | null>(null)
  const [qrTimer, setQrTimer] = useState(300)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrKey, setQrKey] = useState(0) // force re-generate QR

  // Camera & Slip Upload
  const [slipImage, setSlipImage] = useState<string | null>(null) // base64 JPEG
  const [isCameraActive, setIsCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const startCamera = async () => {
    try {
      setIsCameraActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error("Error playing video:", e))
        }
      }
    } catch (err: any) {
      console.error("Camera access error:", err)
      alert("ไม่สามารถเปิดกล้องได้: " + err.message + "\nกรุณาใช้การอัปโหลดรูปภาพแทน")
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
  }

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setSlipImage(dataUrl)
        stopCamera()
      }
    }
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopCamera()
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = ev => {
        const result = ev.target?.result as string
        if (result) setSlipImage(result)
      }
      reader.readAsDataURL(file)
    }
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])
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

      // 1. Upload Slip if cashier captured/selected one
      let uploadedSlipUrl = null
      if (slipImage) {
        const base64ToBlob = (b64: string, mime: string = 'image/jpeg') => {
          const byteString = atob(b64.split(',')[1])
          const ab = new ArrayBuffer(byteString.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i)
          }
          return new Blob([ab], { type: mime })
        }
        const blob = base64ToBlob(slipImage)
        const fileName = `slip_${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage.from('slips').upload(fileName, blob)
        if (uploadErr) throw uploadErr
        const { data: { publicUrl } } = supabase.storage.from('slips').getPublicUrl(fileName)
        uploadedSlipUrl = publicUrl
      }

      // 2. Format note string with slip url
      const slipNoteSuffix = uploadedSlipUrl ? ` | SLIP:${uploadedSlipUrl}` : ''
      const cleanNote = cart.note || ''
      const finalNote = cleanNote ? `${cleanNote}${slipNoteSuffix}` : (uploadedSlipUrl ? `SLIP:${uploadedSlipUrl}` : null)

      const isPending = paymentMethod === 'qr' || paymentMethod === 'transfer'

      // 3. Insert sale
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          receipt_no: receiptNo,
          customer_id: cart.customer?.id || null,
          cashier_id: user.id,
          status: isPending ? 'pending' : 'paid',
          subtotal,
          discount_amount: discountAmount,
          discount_note: cart.discount_note || null,
          tax_amount: 0,
          service_charge: 0,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          cash_received: paymentMethod === 'cash' ? cashAmount : null,
          change_amount: paymentMethod === 'cash' ? change : 0,
          note: finalNote,
          points_earned: Math.floor(totalAmount / 100)
        })
        .select().single()

      if (saleError) throw new Error(saleError.message)

      // 4. Insert items
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

      // 5. If paid (cash), run stock deduction and payments inserts
      if (!isPending) {
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
      }

      // 6. Set receipt state to trigger checkout success screen
      setReceipt({ receipt_no: receiptNo, total: totalAmount, change, isPending })
      cart.clearCart()
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
      color: '#059669', glow: 'rgba(5,150,105,0.3)',
      gradient: 'linear-gradient(135deg,#059669 0%,#10b981 100%)',
    },
    {
      key: 'qr',
      label: 'สแกน QR', labelEn: 'PromptPay',
      icon: <QrCode size={22} />,
      color: '#4338ca', glow: 'rgba(67,56,202,0.3)',
      gradient: 'linear-gradient(135deg,#4338ca 0%,#6366f1 100%)',
    },
    {
      key: 'transfer',
      label: 'โอนเงิน', labelEn: 'Transfer',
      icon: <ArrowLeftRight size={22} />,
      color: '#1e3a8a', glow: 'rgba(30,58,138,0.3)',
      gradient: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)',
    },
  ]

  const currentMethod = METHODS.find(m => m.key === paymentMethod)!

  /* ══════════════════════════════════
     SUCCESS SCREEN
  ══════════════════════════════════ */
  if (receipt) {
    const isPending = receipt.isPending

    return (
      <div style={overlayStyle}>
        <div style={{
          ...panelBase,
          maxWidth: 400,
          padding: 0,
          overflow: 'hidden',
          animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <div style={{ height: 5, background: isPending ? 'linear-gradient(90deg,#d97706,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#16a34a,#22c55e,#4ade80)' }} />
          <div style={{ padding: '32px 28px 28px', textAlign: 'center' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 18px',
              background: isPending ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#16a34a,#22c55e)',
              boxShadow: isPending 
                ? '0 0 0 16px rgba(245,158,11,0.08),0 0 40px rgba(245,158,11,0.35)' 
                : '0 0 0 16px rgba(34,197,94,0.08),0 0 40px rgba(34,197,94,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both',
            }}>
              {isPending ? <Clock size={38} color="white" /> : <CheckCircle2 size={38} color="white" />}
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: '#0F172A' }}>
              {isPending ? 'สั่งซื้อแล้ว (รออนุมัติ)!' : 'ชำระเงินสำเร็จ!'}
            </h2>
            <p style={{ margin: '0 0 22px', fontSize: 13, color: '#475569', fontWeight: 700, fontFamily: 'monospace' }}>#{receipt.receipt_no}</p>

            <div style={{
              background: '#F8FAFC', border: '1.5px solid rgba(35,64,168,0.18)',
              borderRadius: 16, padding: '16px 20px', marginBottom: 20, textAlign: 'left',
              boxShadow: '0 2px 8px rgba(35,64,168,0.05)',
            }}>
              <SummaryRow label="วิธีชำระ" value={currentMethod.label} />
              <SummaryRow label="ยอดชำระ" value={formatCurrency(receipt.total)} bold />
              {isPending && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: '#475569', fontWeight: 700 }}>สถานะ</span>
                  <span style={{ color: '#B45309', fontWeight: 800 }}>รอตรวจสอบ & อนุมัติ</span>
                </div>
              )}
              {paymentMethod === 'cash' && (
                <>
                  <SummaryRow label="รับเงิน" value={formatCurrency(cashAmount)} />
                  <div style={{ borderTop: '1.5px solid rgba(35,64,168,0.15)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#15803D', fontWeight: 800, fontSize: 14 }}>เงินทอน</span>
                    <span style={{ color: '#15803D', fontWeight: 900, fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(receipt.change)}
                    </span>
                  </div>
                </>
              )}
              {referenceNo && (
                <SummaryRow label="เลขอ้างอิง" value={referenceNo} />
              )}
              {cart.customer && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: '#FEF3C7', border: '1.5px solid #FCD34D' }}>
                  <span style={{ fontSize: 12, color: '#92400E', fontWeight: 800 }}>
                    ✨ {cart.customer.full_name} {isPending ? 'จะได้รับ' : 'ได้รับ'} {Math.floor(receipt.total / 100)} แต้ม
                  </span>
                </div>
              )}
              {isPending && (
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#64748B', fontWeight: 600, lineHeight: 1.5, textAlign: 'center', borderTop: '1px solid rgba(35,64,168,0.12)', paddingTop: 10 }}>
                  * บิลจะส่งเข้าครัว/สต๊อกจะตัด เมื่อได้รับการอนุมัติชำระเงินจากผู้จัดการ
                </p>
              )}
            </div>

            {isPending ? (
              <button onClick={onSuccess} style={{
                ...ghostBtnStyle,
                background: 'linear-gradient(135deg,#d97706 0%,#f59e0b 100%)',
                borderColor: 'transparent', color: '#FFFFFF', fontWeight: 900, fontSize: 14,
                width: '100%', minHeight: 48, boxShadow: '0 6px 20px rgba(217,119,6,0.35)',
              }}>
                <Sparkles size={16} /> บิลใหม่ / รับคิวถัดไป
              </button>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={handlePrintReceipt} style={{
                  ...ghostBtnStyle,
                  background: '#FFFFFF', border: '2px solid rgba(35,64,168,0.3)',
                  color: '#1E3A8A', fontWeight: 900, fontSize: 14, minHeight: 48,
                  boxShadow: '0 2px 8px rgba(35,64,168,0.08)',
                }}>
                  <Printer size={16} /> พิมพ์ใบเสร็จ
                </button>
                <button onClick={onSuccess} style={{
                  ...ghostBtnStyle,
                  background: 'linear-gradient(135deg,#059669 0%,#10b981 100%)',
                  borderColor: 'transparent', color: '#FFFFFF', fontWeight: 900, fontSize: 14, minHeight: 48,
                  boxShadow: '0 6px 20px rgba(5,150,105,0.35)',
                }}>
                  <Sparkles size={16} /> บิลใหม่
                </button>
              </div>
            )}
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
          padding: '16px 20px', background: '#2340A8',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.3px' }}>ชำระเงิน</h2>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2, fontWeight: 700 }}>{cart.items.length} รายการ</p>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s ease',
          }}><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

          {/* Amount display */}
          <div style={{
            padding: '18px 20px 14px',
            background: '#F8FAFC',
            borderBottom: '1.5px solid rgba(35,64,168,0.12)',
            transition: 'background 0.4s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: '#475569', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>ยอดที่ต้องชำระ</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 15, color: '#64748B', fontWeight: 800 }}>฿</span>
                  <span style={{
                    fontSize: 42, fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1,
                    color: '#0F172A',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {cart.customer && (
                <div style={{
                  padding: '6px 12px', borderRadius: 20,
                  background: '#FEF3C7', border: '1.5px solid #FCD34D',
                  fontSize: 12, fontWeight: 800, color: '#92400E', whiteSpace: 'nowrap',
                }}>🌟 +{Math.floor(total / 100)} แต้ม</div>
              )}
            </div>
            {cart.discount_amount > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: cart.discount_note?.includes('คู่') ? '#BE123C' : '#047857',
                  padding: '5px 12px', borderRadius: 9,
                  background: cart.discount_note?.includes('คู่') ? '#FFF1F2' : '#ECFDF5',
                  border: cart.discount_note?.includes('คู่') ? '1.5px solid #FDA4AF' : '1.5px solid #86EFAC',
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}>
                  {cart.discount_note?.includes('คู่') ? '🍷' : '🏷️'}
                  {cart.discount_note || 'ส่วนลด'} −{formatCurrency(cart.discount_amount)}
                </span>
              </div>
            )}
          </div>

          {/* Payment method tabs — 3 methods */}
          <div style={{ padding: '16px 20px 0' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#0F172A' }}>
              วิธีชำระเงิน
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {METHODS.map(m => {
                const active = paymentMethod === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setPaymentMethod(m.key)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 6, padding: '14px 8px', borderRadius: 14,
                      border: active ? `2px solid ${m.color}` : '2px solid rgba(35,64,168,0.18)',
                      background: active ? m.gradient : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#1E293B',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                      transform: active ? 'translateY(-2px)' : 'translateY(0)',
                      boxShadow: active ? `0 6px 20px ${m.glow}` : '0 2px 6px rgba(35,64,168,0.06)',
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: active ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                      color: active ? '#FFFFFF' : m.color,
                      transition: 'all 0.25s ease',
                    }}>{m.icon}</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: active ? 900 : 800, color: active ? '#FFFFFF' : '#0F172A' }}>{m.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: active ? 'rgba(255,255,255,0.9)' : '#64748B' }}>{m.labelEn}</div>
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
                  background: '#F0FDF4',
                  border: '2px solid #86EFAC', marginBottom: 14,
                  boxShadow: '0 2px 8px rgba(16,185,129,0.08)',
                }}>
                  <p style={{ margin: '0 0 5px', fontSize: 12, color: '#166534', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    จำนวนเงินที่รับ
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 16, color: '#166534', fontWeight: 800 }}>฿</span>
                    <span style={{
                      fontSize: 42, fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1,
                      color: cashAmount > 0 ? '#0F172A' : '#94A3B8',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{cashInput || '0'}</span>
                  </div>

                  {cashAmount >= total && cashAmount > 0 && (
                    <div style={{
                      marginTop: 12, paddingTop: 10, borderTop: '1.5px solid #86EFAC',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#DCFCE7', borderRadius: 10, padding: '10px 14px',
                      animation: 'fadeIn 0.2s ease',
                    }}>
                      <span style={{ fontSize: 14, color: '#15803D', fontWeight: 900 }}>เงินทอน</span>
                      <span style={{ fontSize: 28, fontWeight: 900, color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>
                        ฿{change.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {cashAmount > 0 && cashAmount < total && (
                    <div style={{
                      marginTop: 12, paddingTop: 10, borderTop: '1.5px solid #FCA5A5',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#FEE2E2', borderRadius: 10, padding: '10px 14px',
                    }}>
                      <span style={{ fontSize: 14, color: '#991B1B', fontWeight: 900 }}>ยังขาดอีก</span>
                      <span style={{ fontSize: 24, fontWeight: 900, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                        ฿{(total - cashAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick presets */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <button onClick={() => setCashInput(total.toFixed(2))} style={{
                    ...quickPresetStyle,
                    background: '#DCFCE7', border: '2px solid #16A34A', color: '#15803D', fontWeight: 900,
                    boxShadow: '0 2px 8px rgba(22,163,74,0.18)',
                  }}>พอดี ฿{formatCurrency(total)}</button>
                  {[20, 50, 100, 500, 1000].filter(a => a > total).slice(0, 3).map(amt => (
                    <button key={amt} onClick={() => setCashInput(amt.toFixed(2))} style={{
                      ...quickPresetStyle,
                      background: '#FFFFFF', border: '2px solid rgba(35,64,168,0.22)', color: '#1E3A8A', fontWeight: 900,
                      boxShadow: '0 2px 6px rgba(35,64,168,0.08)',
                    }}>
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
                        border: key === '⌫' ? '2px solid #FCA5A5' : '2px solid rgba(35,64,168,0.18)',
                        background: key === '⌫' ? '#FEE2E2' : '#FFFFFF',
                        color: key === '⌫' ? '#DC2626' : '#0F172A',
                        fontSize: key === '⌫' ? 20 : 23, fontWeight: 900,
                        cursor: 'pointer', transition: 'all 0.1s ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        WebkitUserSelect: 'none', userSelect: 'none',
                        boxShadow: key === '⌫' ? '0 2px 6px rgba(239,68,68,0.1)' : '0 2px 6px rgba(35,64,168,0.08)',
                      }}
                      onPointerDown={e => {
                        const el = e.currentTarget
                        el.style.transform = 'scale(0.93)'
                        el.style.background = key === '⌫' ? '#FECACA' : '#E2E8F0'
                      }}
                      onPointerUp={e => {
                        const el = e.currentTarget
                        el.style.transform = 'scale(1)'
                        el.style.background = key === '⌫' ? '#FEE2E2' : '#FFFFFF'
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
                  background: '#F8FAFC',
                  border: '2px solid rgba(99,102,241,0.25)',
                  marginBottom: 14,
                  boxShadow: '0 2px 8px rgba(99,102,241,0.06)',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: 'linear-gradient(135deg,#4338ca,#6366f1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(67,56,202,0.25)',
                    }}><QrCode size={17} color="white" /></div>
                    <span style={{ fontWeight: 900, color: '#4338CA', fontSize: 15 }}>PromptPay QR</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#312E81', padding: '3px 10px', borderRadius: 20, background: '#EEF2FF', border: '1.5px solid #C7D2FE' }}>
                      {PROMPTPAY_PHONE}
                    </span>
                  </div>

                  {/* QR Code */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <div style={{
                      padding: 16, borderRadius: 18, background: '#FFFFFF',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                      border: '2px solid #E2E8F0',
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
                        background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(4px)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 8,
                      }}>
                        <AlertTriangle size={28} color="#FBBF24" />
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>QR หมดอายุแล้ว</span>
                        <button onClick={refreshQR} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 18px', borderRadius: 10,
                          background: 'linear-gradient(135deg,#4338ca,#6366f1)',
                          border: 'none', color: '#FFFFFF', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(67,56,202,0.35)',
                        }}>
                          <RefreshCw size={13} /> สร้าง QR ใหม่
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Amount badge */}
                  <div style={{
                    marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 22px', borderRadius: 24,
                    background: '#EEF2FF', border: '2px solid #C7D2FE',
                  }}>
                    <span style={{ fontSize: 13, color: '#4338CA', fontWeight: 800 }}>ยอดชำระ</span>
                    <span style={{ fontSize: 24, fontWeight: 900, color: '#1E1B4B', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(total)}
                    </span>
                  </div>

                  {/* Timer */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: qrExpired ? '#EF4444' : '#16A34A',
                      animation: qrExpired ? 'none' : 'blink 1s infinite',
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: qrExpired ? '#DC2626' : '#334155' }}>
                      {qrExpired ? 'หมดอายุแล้ว — กด "สร้าง QR ใหม่"' : `หมดอายุใน ${formatTimer(qrTimer)}`}
                    </span>
                  </div>
                </div>

                {/* Ref input */}
                <label style={labelStyle}>เลขอ้างอิงธุรกรรม (ใส่หลังลูกค้าชำระแล้ว)</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
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
                  border: '2px solid rgba(35,64,168,0.22)', marginBottom: 14,
                  boxShadow: '0 2px 8px rgba(35,64,168,0.06)',
                }}>
                  {/* SCB Bank card */}
                  <div style={{
                    padding: '18px 20px',
                    background: 'linear-gradient(135deg,#4a148c 0%,#7b1fa2 50%,#9c27b0 100%)',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(107,33,168,0.25)',
                  }}>
                    {/* Decorative circles */}
                    <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                    <div style={{ position: 'absolute', bottom: -10, right: 40, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      {/* SCB logo placeholder */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'rgba(255,255,255,0.2)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid rgba(255,255,255,0.3)',
                        fontWeight: 900, fontSize: 14, color: '#FFFFFF', letterSpacing: '-0.5px',
                      }}>SCB</div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 900, color: '#FFFFFF', fontSize: 15 }}>ธนาคารไทยพาณิชย์</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Siam Commercial Bank</p>
                      </div>
                    </div>

                    {/* Account number */}
                    <p style={{ margin: '0 0 4px', fontSize: 11, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.6px', fontWeight: 700 }}>เลขที่บัญชี</p>
                    <p style={{
                      margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: '#FFFFFF',
                      letterSpacing: 3, fontVariantNumeric: 'tabular-nums',
                      fontFamily: 'monospace',
                    }}>{SCB_ACCOUNT_NO}</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{SCB_ACCOUNT_NAME}</p>
                  </div>

                  {/* Amount row */}
                  <div style={{
                    padding: '14px 20px',
                    background: '#F0F9FF',
                    borderBottom: '1px solid #BAE6FD',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: '#0369A1', fontWeight: 800 }}>ยอดที่ต้องโอน</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(total)}
                        </span>
                        <CopyButton text={total.toFixed(2)} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#0369A1', fontWeight: 800 }}>เลขบัญชี</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <CopyButton text={SCB_ACCOUNT_NO.replace(/-/g, '')} />
                      </div>
                    </div>
                  </div>

                  {/* Info row */}
                  <div style={{
                    padding: '10px 20px',
                    background: '#F8FAFC',
                    borderTop: '1px solid rgba(35,64,168,0.1)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#0284C7', flexShrink: 0, animation: 'blink 1.5s infinite' }} />
                    <span style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
                      โอนแล้วกรุณากรอกเลข ref ด้านล่าง แล้วกดยืนยัน
                    </span>
                  </div>
                </div>

                {/* Ref input */}
                <label style={labelStyle}>เลขอ้างอิงการโอน (ไม่บังคับ)</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
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

            {/* Camera / Slip Capture for QR and Transfer methods */}
            {(paymentMethod === 'qr' || paymentMethod === 'transfer') && (
              <div style={{
                marginTop: 16, background: '#F8FAFC',
                border: '2px solid rgba(35,64,168,0.18)', borderRadius: 18,
                padding: 16, boxShadow: '0 2px 8px rgba(35,64,168,0.05)',
              }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#0F172A', marginBottom: 12 }}>
                  📸 ถ่ายภาพสลิปจากลูกค้า (โอนเงิน / สแกน QR)
                </label>

                {isCameraActive ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      position: 'relative', width: '100%', aspectRatio: '4/3',
                      background: '#000', borderRadius: 14, overflow: 'hidden',
                      border: '2px solid #CBD5E1'
                    }}>
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{
                        position: 'absolute', inset: '16px',
                        border: '2px dashed rgba(255,255,255,0.4)',
                        pointerEvents: 'none', borderRadius: 8
                      }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        style={{
                          padding: '12px 24px', borderRadius: 12, border: 'none',
                          background: 'linear-gradient(135deg, #0284c7, #0ea5e9)', color: '#FFFFFF',
                          fontSize: 13, fontWeight: 900, cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(2,132,199,0.35)',
                        }}
                      >
                        กดถ่ายภาพ 📸
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        style={{
                          padding: '12px 20px', borderRadius: 12,
                          background: '#FFFFFF', border: '2px solid #CBD5E1',
                          color: '#334155', fontSize: 13, fontWeight: 800, cursor: 'pointer'
                        }}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {slipImage ? (
                      <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '12px', overflow: 'hidden', border: '2px solid #3B82F6', flexShrink: 0, boxShadow: '0 2px 8px rgba(59,130,246,0.2)' }}>
                        <img src={slipImage} alt="captured slip" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => setSlipImage(null)}
                          style={{
                            position: 'absolute', top: 4, right: 4,
                            background: '#EF4444', border: 'none', color: '#FFFFFF',
                            borderRadius: '50%', width: 22, height: 22,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', padding: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                        <button
                          type="button"
                          onClick={startCamera}
                          style={{
                            flex: 1, minWidth: 140, height: '52px', padding: '0 18px', borderRadius: '12px',
                            border: '2px dashed #2563EB', background: '#EFF6FF',
                            color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                            fontSize: 13, fontWeight: 900, boxShadow: '0 2px 8px rgba(37,99,235,0.08)',
                          }}
                        >
                          <Camera size={18} />
                          <span>ถ่ายรูปสลิป</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            flex: 1, minWidth: 140, height: '52px', padding: '0 18px', borderRadius: '12px',
                            border: '2px dashed #64748B', background: '#FFFFFF',
                            color: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                            fontSize: 13, fontWeight: 900, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                          }}
                        >
                          <ImageIcon size={18} />
                          <span>เลือกรูปสลิป</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  style={{ display: 'none' }}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                borderRadius: 12, marginTop: 10,
                background: '#FEF2F2', border: '1.5px solid #FCA5A5',
                color: '#DC2626', fontSize: 13, fontWeight: 700, animation: 'fadeIn 0.2s ease',
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="checkout-footer" style={{
          padding: '14px 20px',
          borderTop: '2px solid rgba(35,64,168,0.15)',
          background: '#FFFFFF',
          display: 'flex', gap: 10,
        }}>
          <button onClick={onClose} style={{
            flex: '0 0 auto', padding: '14px 18px', height: 54,
            borderRadius: 14, border: '2px solid #CBD5E1',
            background: '#F1F5F9', color: '#334155',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}>
            <X size={18} />
          </button>
          <button
            onClick={handleConfirmPayment}
            disabled={!canPay || loading}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 54, padding: '0 20px', borderRadius: 14, border: 'none',
              background: canPay && !loading ? currentMethod.gradient : '#E2E8F0',
              color: canPay && !loading ? '#FFFFFF' : '#94A3B8',
              fontSize: 16, fontWeight: 900,
              cursor: canPay && !loading ? 'pointer' : 'not-allowed',
              boxShadow: canPay && !loading ? `0 8px 24px ${currentMethod.glow}` : 'none',
              transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              letterSpacing: '-0.2px',
            }}
          >
            {loading
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> กำลังบันทึก...</>
              : <><CheckCircle2 size={18} /> ยืนยันชำระเงิน {formatCurrency(total)}</>
            }
            {!loading && canPay && <ChevronRight size={18} style={{ marginLeft: 'auto' }} />}
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
      <span style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 900 : 700, color: '#0F172A' }}>{value}</span>
    </div>
  )
}

/* ─── Shared styles ─── */
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100,
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  background: 'rgba(15,23,42,0.65)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

const panelBase: React.CSSProperties = {
  width: '100%',
  background: '#FFFFFF',
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  boxShadow: '0 -10px 40px rgba(15,23,42,0.25)',
  border: '1.5px solid rgba(35,64,168,0.2)',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '14px 18px', borderRadius: 13,
  border: '1.5px solid rgba(35,64,168,0.25)',
  background: '#FFFFFF',
  color: '#1E293B',
  fontSize: 13, fontWeight: 800, cursor: 'pointer',
  transition: 'all 0.2s ease',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px',
  borderRadius: 13, border: '2px solid rgba(35,64,168,0.25)',
  background: '#FFFFFF',
  color: '#0F172A', fontSize: 15, fontWeight: 700,
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border-color 0.2s ease',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 800,
  letterSpacing: '0.02em', textTransform: 'uppercase',
  color: '#0F172A', marginBottom: 8,
}

const quickPresetStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 12,
  border: '1.5px solid rgba(35,64,168,0.25)',
  background: '#FFFFFF',
  color: '#1E3A8A',
  fontSize: 13, fontWeight: 800,
  cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
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
    .checkout-footer { padding-bottom:calc(14px + env(safe-area-inset-bottom)) !important; }
  }
`
