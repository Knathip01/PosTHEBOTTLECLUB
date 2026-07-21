'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sale } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Clock, CheckCircle2, Loader2, RefreshCw,
  Wine, ChevronDown, ChevronRight, Check, Undo,
  Search, CalendarRange, Banknote, CreditCard, QrCode,
  X, Camera, Send, ClipboardList, Image as ImageIcon
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function classifyCategory(catName?: string): 'kitchen' | 'bar' {
  if (!catName) return 'kitchen'
  const name = catName.toLowerCase()
  const barKeywords = ['wine', 'beer', 'drink', 'beverage', 'bar', 'ไวน์', 'เบียร์', 'เครื่องดื่ม', 'rosé', 'sparkling', 'champagne', 'dessert']
  return barKeywords.some(kw => name.includes(kw)) ? 'bar' : 'kitchen'
}

const parseNote = (noteStr?: string | null) => {
  const res = { cleanNote: noteStr || '', slipUrl: '', isServed: false, kitchen: 'pending', bar: 'pending' }
  if (!noteStr) return res
  let cleanNote = noteStr
  if (cleanNote.includes(' | SERVED')) { res.isServed = true; cleanNote = cleanNote.replace(' | SERVED', '') }
  else if (cleanNote === 'SERVED') { res.isServed = true; cleanNote = '' }
  const parts = cleanNote.split(' | SLIP:')
  if (parts.length > 1) { cleanNote = parts[0].trim(); res.slipUrl = parts[1].trim() }
  else if (cleanNote.startsWith('SLIP:')) { res.slipUrl = cleanNote.replace('SLIP:', '').trim(); cleanNote = '' }
  const km = cleanNote.match(/\[KITCHEN:(\w+)\]/)
  const bm = cleanNote.match(/\[BAR:(\w+)\]/)
  if (km) { res.kitchen = km[1]; cleanNote = cleanNote.replace(/\[KITCHEN:\w+\]/g, '').trim() }
  if (bm) { res.bar = bm[1]; cleanNote = cleanNote.replace(/\[BAR:\w+\]/g, '').trim() }
  res.cleanNote = cleanNote
  return res
}

function StatusBadge({ status, note }: { status: string; note?: string | null }) {
  const isServed = parseNote(note).isServed
  const config: Record<string, { label: string; color: string; bg: string }> = {
    paid:      isServed ? { label: 'เสร็จสิ้น', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' }
                        : { label: 'ชำระแล้ว',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    pending:   { label: 'รอชำระ',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    refunded:  { label: 'คืนสินค้า', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
    cancelled: { label: 'ยกเลิก',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  }
  const c = config[status] || config.paid
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, padding: '3px 9px', borderRadius: 999 }}>
      {c.label}
    </span>
  )
}

function PaymentIcon({ method }: { method: string }) {
  const map: Record<string, React.ReactNode> = {
    cash: <Banknote size={13} />, transfer: <CreditCard size={13} />,
    qr: <QrCode size={13} />, card: <CreditCard size={13} />,
  }
  return <span style={{ color: '#6b7280' }}>{map[method] || map.cash}</span>
}

function PrepDot({ status }: { status: string }) {
  const c = status === 'ready' ? '#22c55e' : status === 'preparing' ? '#fbbf24' : '#4b5563'
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block', boxShadow: status !== 'pending' ? `0 0 6px ${c}` : 'none', flexShrink: 0 }} />
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CashierQueuePage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'queue' | 'history' | 'report'>('queue')
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Report
  const [reportTitle, setReportTitle] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportImages, setReportImages] = useState<string[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // History filters
  const [searchReceipt, setSearchReceipt] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Camera helpers
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setIsCameraActive(false)
  }, [])

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  const startCamera = async () => {
    try {
      setIsCameraActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(console.error)
      }
    } catch (err: any) {
      alert('ไม่สามารถเปิดกล้องได้: ' + err.message)
      setIsCameraActive(false)
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const v = videoRef.current
    const c = document.createElement('canvas')
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
    setReportImages(p => [...p, c.toDataURL('image/jpeg', 0.85)].slice(0, 5))
    stopCamera()
  }

  // Data loading
  const loadPaidQueue = useCallback(async (tab: 'queue' | 'history', isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true)
    setErrorMsg(null)
    try {
      let query = supabase.from('sales').select('*, sale_items(*, products(category_id, categories(name)))')
      if (tab === 'queue') {
        query = query.in('status', ['paid', 'pending']).order('created_at', { ascending: true })
      } else {
        query = (query as any).eq('status', 'paid').order('created_at', { ascending: false })
        if (searchReceipt) query = (query as any).ilike('receipt_no', `%${searchReceipt}%`)
        if (dateFrom) query = (query as any).gte('created_at', `${dateFrom}T00:00:00`)
        if (dateTo) query = (query as any).lte('created_at', `${dateTo}T23:59:59`)
        query = (query as any).limit(50)
      }
      const { data: rawSales, error } = await query
      if (error) throw error
      let salesData = (rawSales || []).filter((s: any) => {
        const { isServed } = parseNote(s.note)
        return tab === 'queue' ? !isServed : isServed
      })
      const customerIds = [...new Set(salesData.map((s: any) => s.customer_id).filter(Boolean))]
      if (customerIds.length > 0) {
        const { data: cd } = await supabase.from('customers').select('id, full_name, phone').in('id', customerIds)
        if (cd) salesData = salesData.map((s: any) => ({ ...s, customers: cd.find((c: any) => c.id === s.customer_id) || null }))
      }
      setSales(salesData as Sale[])
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [supabase, searchReceipt, dateFrom, dateTo])

  useEffect(() => {
    if (activeTab !== 'report') loadPaidQueue(activeTab, true)
    let t: NodeJS.Timeout | null = null
    if (activeTab === 'queue') t = setInterval(() => loadPaidQueue('queue', false), 10000)
    return () => { if (t) clearInterval(t) }
  }, [loadPaidQueue, activeTab])

  const handleTabChange = (tab: 'queue' | 'history' | 'report') => {
    stopCamera(); setActiveTab(tab); setExpandedId(null)
    setSearchReceipt(''); setDateFrom(''); setDateTo('')
    if (tab !== 'report') setTimeout(() => loadPaidQueue(tab, true), 50)
  }

  const handleMarkServed = async (saleId: string) => {
    if (!confirm('ยืนยันส่งโต๊ะลูกค้าและเสร็จสิ้นรายการ?')) return
    setUpdatingId(saleId)
    try {
      const { data: cur } = await supabase.from('sales').select('note').eq('id', saleId).single()
      const note = cur?.note || ''
      await supabase.from('sales').update({ note: note ? `${note} | SERVED` : 'SERVED' }).eq('id', saleId)
      await loadPaidQueue('queue', false)
    } catch (err) { console.error(err) }
    finally { setUpdatingId(null) }
  }

  const handleUndoServed = async (saleId: string) => {
    if (!confirm('ต้องการดึงรายการนี้กลับมาที่คิวค้างเตรียม?')) return
    setUpdatingId(saleId)
    try {
      const { data: cur } = await supabase.from('sales').select('note').eq('id', saleId).single()
      const newNote = (cur?.note || '').replace(' | SERVED', '').replace('SERVED', '').trim()
      await supabase.from('sales').update({ note: newNote || null }).eq('id', saleId)
      await loadPaidQueue('history', false)
    } catch (err) { console.error(err) }
    finally { setUpdatingId(null) }
  }

  const handleSubmitReport = async () => {
    if (!reportTitle.trim()) return
    setReportLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('shop_reports').insert({
        title: reportTitle.trim(), note: reportNote.trim() || null,
        images: reportImages.length > 0 ? reportImages : null,
        reported_by: user?.id || null, status: 'pending'
      })
      if (error) throw error
      setReportSuccess(true)
      setTimeout(() => {
        setReportTitle(''); setReportNote(''); setReportImages([])
        stopCamera(); setReportSuccess(false); setActiveTab('queue')
      }, 1800)
    } catch (err: any) {
      alert('ส่งรายงานไม่สำเร็จ: ' + err.message)
    } finally { setReportLoading(false) }
  }

  const timeSince = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (m < 1) return 'เพิ่งจ่าย'
    if (m < 60) return `${m} นาที`
    return `${Math.floor(m / 60)} ชม.`
  }

  const queueCount = activeTab === 'queue' ? sales.length : 0

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .cashier-bottom-nav { display: flex !important; }
        @media (min-width: 768px) { .cashier-bottom-nav { display: none !important; } }
        .cashier-top-tabs { display: flex !important; }
        @media (max-width: 767px) { .cashier-top-tabs { display: none !important; } }
        .history-table { display: table !important; }
        @media (max-width: 640px) { .history-table { display: none !important; } .history-cards { display: flex !important; } }
        .history-cards { display: none; }
        @keyframes fadeSlide { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spinAnim { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* ── Sticky Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
        background: 'rgba(10,12,18,0.96)', borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)', padding: '0 16px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', flexShrink: 0 }}>
            <CheckCircle2 size={17} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Cashier Queue 💳
            </h1>
            <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>
              {activeTab === 'queue' ? `${sales.length} ออเดอร์รอเตรียม` : activeTab === 'history' ? 'ประวัติออเดอร์' : 'ส่งรายงาน'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {refreshing && <RefreshCw size={13} className="animate-spin" style={{ color: '#6b7280' }} />}
          {/* Desktop tabs */}
          <div className="cashier-top-tabs" style={{ gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4 }}>
            {([['queue', '📥 คิวเตรียม'], ['history', '✅ ประวัติ'], ['report', '📋 รายงาน']] as const).map(([tab, label]) => (
              <button key={tab} onClick={() => handleTabChange(tab)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
                background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeTab === tab ? '#fff' : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 150ms'
              }}>{label}</button>
            ))}
          </div>
          {activeTab !== 'report' && (
            <button onClick={() => loadPaidQueue(activeTab as any, false)} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: '#6b7280', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 'clamp(12px, 3vw, 20px)' }}>

        {/* Error */}
        {errorMsg && (
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', marginBottom: 14, fontSize: 13 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* History filter bar */}
        {activeTab === 'history' && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 160px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px' }}>
              <Search size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
              <input value={searchReceipt} onChange={e => setSearchReceipt(e.target.value)} placeholder="เลขบิล..." style={{ flex: 1, background: 'none', border: 'none', color: 'white', fontSize: 13, outline: 'none', minWidth: 0 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px' }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 12, outline: 'none', minWidth: 0 }} />
              <span style={{ color: '#6b7280', fontSize: 11, flexShrink: 0 }}>—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 12, outline: 'none', minWidth: 0 }} />
            </div>
            <button onClick={() => loadPaidQueue('history', true)} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ค้นหา
            </button>
            <button onClick={() => { setSearchReceipt(''); setDateFrom(''); setDateTo(''); loadPaidQueue('history', true) }} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#6b7280', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ล้าง
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50dvh', gap: 14 }}>
            <Loader2 size={32} className="animate-spin" style={{ color: '#38bdf8' }} />
            <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>กำลังโหลดข้อมูล...</p>
          </div>

        /* ── QUEUE TAB ── */
        ) : activeTab === 'queue' ? (
          sales.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50dvh', gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(56,189,248,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={32} style={{ color: '#38bdf8', opacity: 0.5 }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#4b5563', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>ไม่มีออเดอร์ค้างเตรียม</p>
                <p style={{ color: '#374151', fontSize: 13, margin: 0 }}>ออเดอร์ที่ชำระแล้วจะปรากฏที่นี่</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
              {sales.map(sale => {
                const { kitchen: kSt, bar: bSt, cleanNote } = parseNote(sale.note)
                const hasKitchen = sale.sale_items?.some(i => classifyCategory((i as any).products?.categories?.name) === 'kitchen')
                const hasBar = sale.sale_items?.some(i => classifyCategory((i as any).products?.categories?.name) === 'bar')
                const isReady = (!hasKitchen || kSt === 'ready') && (!hasBar || bSt === 'ready')
                const mins = Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 60000)
                const isUrgent = mins >= 20 && !isReady

                return (
                  <div key={sale.id} style={{
                    background: 'rgba(18,22,32,0.9)', borderRadius: 18, overflow: 'hidden',
                    border: `1px solid ${isReady ? 'rgba(34,197,94,0.35)' : isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: isReady ? '0 8px 24px rgba(34,197,94,0.1)' : 'none',
                    display: 'flex', flexDirection: 'column', animation: 'fadeSlide 0.3s ease'
                  }}>
                    {/* Ready / Urgent stripe */}
                    {isReady && <div style={{ height: 3, background: 'linear-gradient(90deg,#16a34a,#4ade80)' }} />}
                    {isUrgent && !isReady && <div style={{ height: 3, background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />}

                    {/* Header */}
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: isReady ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.015)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 15, fontWeight: 900,
                            color: isUrgent && !isReady ? '#ef4444' : '#f1f3f7'
                          }}>
                            {sale.table_no ? `🍽️ โต๊ะ ${sale.table_no}` : '🛍️ หน้าร้าน'}
                          </span>
                          {isReady && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.12)', padding: '2px 8px', borderRadius: 999 }}>
                              🌟 พร้อมเสิร์ฟ
                            </span>
                          )}
                          {sale.status === 'pending' && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 4 }}>รอชำระ</span>
                          )}
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>#{sale.receipt_no}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: isUrgent && !isReady ? '#ef4444' : '#6b7280' }}>
                          <Clock size={11} /><span>{timeSince(sale.created_at)}</span>
                        </div>
                        {(sale.customers as any)?.full_name && (
                          <span style={{ fontSize: 10, color: '#6b7280' }}>👤 {(sale.customers as any).full_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Station status */}
                    {(hasKitchen || hasBar) && (
                      <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {hasKitchen && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', color: kSt === 'ready' ? '#4ade80' : kSt === 'preparing' ? '#fb923c' : '#6b7280' }}>
                            <PrepDot status={kSt} />
                            ครัว: {kSt === 'ready' ? 'เสร็จ' : kSt === 'preparing' ? 'กำลังทำ' : 'รอทำ'}
                          </span>
                        )}
                        {hasBar && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', color: bSt === 'ready' ? '#4ade80' : bSt === 'preparing' ? '#f2c65c' : '#6b7280' }}>
                            <PrepDot status={bSt} />
                            บาร์: {bSt === 'ready' ? 'เสร็จ' : bSt === 'preparing' ? 'กำลังชง' : 'รอชง'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Items */}
                    <div style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(sale.sale_items || []).map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(139,26,44,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Wine size={12} style={{ color: '#b02238' }} />
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</p>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 900, color: '#fcd34d', flexShrink: 0, marginLeft: 8 }}>×{item.quantity}</span>
                        </div>
                      ))}
                      {cleanNote && (
                        <div style={{ padding: '7px 10px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 12, color: '#f59e0b' }}>
                          📝 {cleanNote}
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.08)' }}>
                      <button
                        onClick={() => handleMarkServed(sale.id)}
                        disabled={updatingId === sale.id}
                        style={{
                          width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                          background: 'linear-gradient(135deg,#059669,#10b981)',
                          color: 'white', fontSize: 14, fontWeight: 800, cursor: updatingId === sale.id ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          opacity: updatingId === sale.id ? 0.7 : 1,
                          boxShadow: '0 4px 16px rgba(16,185,129,0.3)', transition: 'all 150ms'
                        }}
                      >
                        {updatingId === sale.id ? <><Loader2 size={15} className="animate-spin" /> กำลังส่ง...</> : <><Check size={15} /> ทำรายการสำเร็จ (ส่งโต๊ะ)</>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )

        /* ── HISTORY TAB ── */
        ) : activeTab === 'history' ? (
          sales.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40dvh', gap: 12 }}>
              <CheckCircle2 size={40} style={{ color: '#22c55e', opacity: 0.3 }} />
              <p style={{ color: '#4b5563', fontSize: 15, margin: 0 }}>ไม่พบประวัติออเดอร์</p>
            </div>
          ) : (<>
            {/* Desktop Table */}
            <div className="history-table" style={{ background: 'rgba(18,22,32,0.9)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                      {['', 'เลขบิล', 'วันที่', 'ลูกค้า', 'รายการ', 'ยอดรวม', 'ชำระ', 'สถานะ', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(sale => {
                      const isExp = expandedId === sale.id
                      return (
                        <React.Fragment key={sale.id}>
                          <tr onClick={() => setExpandedId(isExp ? null : sale.id)} style={{ borderBottom: isExp ? 'none' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: isExp ? 'rgba(56,189,248,0.04)' : 'transparent', transition: 'background 150ms' }}>
                            <td style={{ padding: '12px 14px', width: 32 }}>{isExp ? <ChevronDown size={14} style={{ color: '#38bdf8' }} /> : <ChevronRight size={14} style={{ color: '#4b5563' }} />}</td>
                            <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#b02238', whiteSpace: 'nowrap' }}>{sale.receipt_no}</td>
                            <td style={{ padding: '12px 14px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(sale.created_at)}</td>
                            <td style={{ padding: '12px 14px', fontSize: 12, color: '#9ca3af' }}>{(sale.customers as any)?.full_name || '—'}</td>
                            <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center', color: '#9ca3af' }}>{(sale.sale_items || []).length}</td>
                            <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: '#fcd34d', whiteSpace: 'nowrap' }}>{formatCurrency(sale.total_amount)}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <PaymentIcon method={sale.payment_method} />
                                <span style={{ fontSize: 11, color: '#6b7280' }}>{sale.payment_method === 'cash' ? 'เงินสด' : sale.payment_method === 'transfer' ? 'โอน' : sale.payment_method === 'qr' ? 'QR' : 'บัตร'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px' }}><StatusBadge status={sale.status} note={sale.note} /></td>
                            <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleUndoServed(sale.id)} disabled={updatingId === sale.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {updatingId === sale.id ? <Loader2 size={11} className="animate-spin" /> : <Undo size={11} />} ดึงกลับ
                              </button>
                            </td>
                          </tr>
                          {isExp && (
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td colSpan={9} style={{ padding: '0 16px 16px 48px' }}>
                                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                      {['สินค้า', 'ราคา/ชิ้น', 'จำนวน', 'ส่วนลด', 'รวม'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280' }}>{h}</th>
                                      ))}
                                    </tr></thead>
                                    <tbody>
                                      {(sale.sale_items || []).map(item => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                          <td style={{ padding: '8px 12px', fontSize: 12, color: 'white' }}>{item.product_name}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>{formatCurrency(item.unit_price)}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 12, color: 'white' }}>{item.quantity}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 12, color: item.discount_amount > 0 ? '#ef4444' : '#6b7280' }}>{item.discount_amount > 0 ? `-${formatCurrency(item.discount_amount)}` : '—'}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#fcd34d' }}>{formatCurrency(item.line_total)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                                      <span>ยอดสุทธิ: </span>
                                      <span style={{ fontSize: 14, fontWeight: 800, color: '#fcd34d' }}>{formatCurrency(sale.total_amount)}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards (history) */}
            <div className="history-cards" style={{ flexDirection: 'column', gap: 10 }}>
              {sales.map(sale => (
                <div key={sale.id} style={{ background: 'rgba(18,22,32,0.9)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)} style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#b02238', fontFamily: 'monospace' }}>{sale.receipt_no}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{formatDate(sale.created_at)}</span>
                        <StatusBadge status={sale.status} note={sale.note} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fcd34d' }}>{formatCurrency(sale.total_amount)}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                        <PaymentIcon method={sale.payment_method} />
                        <span style={{ fontSize: 10, color: '#6b7280' }}>{sale.payment_method === 'cash' ? 'เงินสด' : sale.payment_method === 'transfer' ? 'โอน' : 'QR'}</span>
                      </div>
                    </div>
                  </div>
                  {expandedId === sale.id && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(sale.sale_items || []).map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: '#d1d5db' }}>{item.product_name} ×{item.quantity}</span>
                          <span style={{ color: '#fcd34d', fontWeight: 700 }}>{formatCurrency(item.line_total)}</span>
                        </div>
                      ))}
                      <button onClick={() => handleUndoServed(sale.id)} disabled={updatingId === sale.id} style={{ marginTop: 8, padding: '9px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {updatingId === sale.id ? <Loader2 size={13} className="animate-spin" /> : <Undo size={13} />} ดึงกลับคิว
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>)

        /* ── REPORT TAB ── */
        ) : (
          <div style={{ maxWidth: 560, margin: '0 auto', background: 'rgba(18,22,32,0.9)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', animation: 'fadeSlide 0.3s ease' }}>
            <div style={{ height: 4, background: 'linear-gradient(90deg,#0ea5e9,#38bdf8)' }} />
            <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                <ClipboardList size={18} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'white' }}>รายงานความเรียบร้อย</h2>
                <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>ส่งรายงานไปยังผู้จัดการร้าน</p>
              </div>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {reportSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 14 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                    <CheckCircle2 size={30} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 6px', color: 'white', fontSize: 16, fontWeight: 800 }}>ส่งรายงานสำเร็จ! ✅</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>กำลังกลับไปหน้าคิว...</p>
                  </div>
                </div>
              ) : (<>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', display: 'block', marginBottom: 6 }}>หัวข้อรายงาน *</label>
                  <input value={reportTitle} onChange={e => setReportTitle(e.target.value)} placeholder="เช่น เปิดร้านเรียบร้อย..." style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', display: 'block', marginBottom: 6 }}>รายละเอียดเพิ่มเติม</label>
                  <textarea value={reportNote} onChange={e => setReportNote(e.target.value)} rows={3} placeholder="รายละเอียดเพิ่มเติม..." style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', display: 'block', marginBottom: 10 }}>📸 แนบภาพ ({reportImages.length}/5)</label>
                  {isCameraActive ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000', borderRadius: 14, overflow: 'hidden' }}>
                        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={capturePhoto} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📸 ถ่าย</button>
                        <button onClick={stopCamera} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>ยกเลิก</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {reportImages.map((img, i) => (
                        <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button onClick={() => setReportImages(p => p.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, background: 'rgba(239,68,68,0.9)', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={11} /></button>
                        </div>
                      ))}
                      {reportImages.length < 5 && (<>
                        <button onClick={startCamera} style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.04)', color: '#38bdf8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                          <Camera size={20} /><span style={{ fontSize: 9, fontWeight: 700 }}>กล้อง</span>
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                          <ImageIcon size={20} /><span style={{ fontSize: 9, fontWeight: 700 }}>อัปโหลด</span>
                        </button>
                      </>)}
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e => {
                        Array.from(e.target.files || []).slice(0, 5 - reportImages.length).forEach(f => {
                          const r = new FileReader(); r.onload = ev => { if (ev.target?.result) setReportImages(p => [...p, ev.target!.result as string]) }; r.readAsDataURL(f)
                        }); if (fileInputRef.current) fileInputRef.current.value = ''
                      }} style={{ display: 'none' }} />
                    </div>
                  )}
                </div>
                <button onClick={handleSubmitReport} disabled={!reportTitle.trim() || reportLoading} style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                  background: reportTitle.trim() && !reportLoading ? 'linear-gradient(135deg,#0c4a6e,#0ea5e9)' : 'rgba(255,255,255,0.04)',
                  color: reportTitle.trim() && !reportLoading ? 'white' : '#6b7280',
                  fontSize: 14, fontWeight: 800, cursor: reportTitle.trim() && !reportLoading ? 'pointer' : 'not-allowed',
                  boxShadow: reportTitle.trim() && !reportLoading ? '0 6px 20px rgba(14,165,233,0.3)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}>
                  {reportLoading ? <><Loader2 size={15} className="animate-spin" /> กำลังส่ง...</> : <><Send size={14} /> ส่งรายงาน</>}
                </button>
              </>)}
            </div>
          </div>
        )}
      </main>

      {/* ── Bottom Nav (Mobile only) ── */}
      <div className="cashier-bottom-nav" style={{
        position: 'sticky', bottom: 0, zIndex: 30, gap: 0,
        background: 'rgba(10,12,18,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)', flexShrink: 0,
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {([
          ['queue',   '📥', 'คิว',       queueCount > 0 ? String(queueCount) : ''],
          ['history', '✅', 'ประวัติ',   ''],
          ['report',  '📋', 'รายงาน',   ''],
        ] as const).map(([tab, emoji, label, badge]) => (
          <button key={tab} onClick={() => handleTabChange(tab)} style={{
            flex: 1, padding: '10px 4px 12px', border: 'none',
            background: activeTab === tab ? 'rgba(56,189,248,0.06)' : 'transparent',
            color: activeTab === tab ? '#38bdf8' : '#6b7280',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            borderTop: `2px solid ${activeTab === tab ? '#38bdf8' : 'transparent'}`,
            transition: 'all 150ms', position: 'relative'
          }}>
            <span style={{ fontSize: 20 }}>{emoji}</span>
            <span>{label}</span>
            {badge && (
              <span style={{
                position: 'absolute', top: 6, right: '25%',
                minWidth: 16, height: 16, borderRadius: 999,
                background: '#ef4444', color: 'white',
                fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
