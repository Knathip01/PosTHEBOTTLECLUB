'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sale } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Clock, CheckCircle2, Loader2, RefreshCw,
  Wine, ChevronDown, ChevronRight, Check, Undo,
  Search, CalendarRange, Banknote, CreditCard, QrCode,
  X, Camera, Send, ClipboardList
} from 'lucide-react'

function classifyCategory(catName?: string): 'kitchen' | 'bar' {
  if (!catName) return 'kitchen'
  const name = catName.toLowerCase()
  const barKeywords = ['wine', 'beer', 'drink', 'beverage', 'bar', 'ไวน์', 'เบียร์', 'เครื่องดื่ม', 'rosé', 'sparkling', 'champagne', 'dessert']
  const isBar = barKeywords.some(kw => name.includes(kw))
  return isBar ? 'bar' : 'kitchen'
}

const parseNote = (noteStr?: string | null) => {
  const res = { cleanNote: noteStr || '', slipUrl: '', isServed: false, kitchen: 'pending', bar: 'pending' }
  if (!noteStr) return res
  let cleanNote = noteStr
  
  if (cleanNote.includes(' | SERVED')) {
    res.isServed = true
    cleanNote = cleanNote.replace(' | SERVED', '')
  } else if (cleanNote === 'SERVED') {
    res.isServed = true
    cleanNote = ''
  }

  const parts = cleanNote.split(' | SLIP:')
  if (parts.length > 1) {
    cleanNote = parts[0].trim()
    res.slipUrl = parts[1].trim()
  } else if (cleanNote.startsWith('SLIP:')) {
    res.slipUrl = cleanNote.replace('SLIP:', '').trim()
    cleanNote = ''
  }

  const kitchenMatch = cleanNote.match(/\[KITCHEN:(\w+)\]/)
  const barMatch = cleanNote.match(/\[BAR:(\w+)\]/)
  if (kitchenMatch) {
    res.kitchen = kitchenMatch[1]
    cleanNote = cleanNote.replace(/\[KITCHEN:\w+\]/g, '').trim()
  }
  if (barMatch) {
    res.bar = barMatch[1]
    cleanNote = cleanNote.replace(/\[BAR:\w+\]/g, '').trim()
  }

  res.cleanNote = cleanNote
  return res
}

function StatusBadge({ status, note }: { status: string; note?: string | null }) {
  const isServed = parseNote(note).isServed
  const config = {
    paid: isServed 
      ? { label: 'เสร็จสิ้น', bg: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: 'rgba(56,189,248,0.3)' }
      : { label: 'ชำระแล้ว', bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    pending:   { label: 'รอชำระ',   bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    refunded:  { label: 'คืนสินค้า', bg: 'rgba(168,85,247,0.15)', color: '#c084fc', border: 'rgba(168,85,247,0.3)' },
    cancelled: { label: 'ยกเลิก',   bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    hold:      { label: 'พัก',      bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  }
  const c = (config as any)[status] || config.paid
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ background: c.bg, color: c.color, borderColor: c.border }}>
      {c.label}
    </span>
  )
}

function PaymentIcon({ method }: { method: string }) {
  const icons: Record<string, React.ReactNode> = {
    cash:     <Banknote size={14} />,
    transfer: <CreditCard size={14} />,
    qr:       <QrCode size={14} />,
    card:     <CreditCard size={14} />,
  }
  return <span style={{ color: 'var(--text-muted)' }}>{icons[method] || icons.cash}</span>
}

export default function CashierQueuePage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'queue' | 'history' | 'report'>('queue')
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Shop Report Tab
  const [reportTitle, setReportTitle] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportImages, setReportImages] = useState<string[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filters for History Tab
  const [searchReceipt, setSearchReceipt] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadPaidQueue = useCallback(async (tab: 'queue' | 'history', isInitial = false) => {
    if (isInitial) setLoading(true)
    else setRefreshing(true)
    setErrorMsg(null)
    
    try {
      let query = supabase
        .from('sales')
        .select(`
          *,
          sale_items (
            *,
            products (
              category_id,
              categories (
                name
              )
            )
          )
        `)

      // FIFO for queue, LIFO for history
      if (tab === 'queue') {
        query = query.in('status', ['paid', 'pending']).order('created_at', { ascending: true })
      } else {
        query = query.eq('status', 'paid').order('created_at', { ascending: false })
      }

      // Apply search filters if in history tab
      if (tab === 'history') {
        if (searchReceipt) {
          query = query.ilike('receipt_no', `%${searchReceipt}%`)
        }
        if (dateFrom) {
          query = query.gte('created_at', `${dateFrom}T00:00:00`)
        }
        if (dateTo) {
          query = query.lte('created_at', `${dateTo}T23:59:59`)
        }
        query = query.limit(50) // limit to latest 50 completed orders
      }

      const { data: rawSales, error } = await query
      if (error) throw error

      let salesData = rawSales || []
      
      // Filter based on served status
      salesData = salesData.filter(sale => {
        const { isServed } = parseNote(sale.note)
        return tab === 'queue' ? !isServed : isServed
      })

      // Fallback manual join for customers
      const customerIds = [...new Set(salesData.map(s => s.customer_id).filter(Boolean))]
      if (customerIds.length > 0) {
        const { data: customersData } = await supabase
          .from('customers')
          .select('id, full_name, phone')
          .in('id', customerIds)
        if (customersData) {
          salesData = salesData.map(sale => ({
            ...sale,
            customers: customersData.find(c => c.id === sale.customer_id) || null
          }))
        }
      }

      setSales(salesData as Sale[])
    } catch (err: any) {
      console.error('Error loading paid queue:', err)
      setErrorMsg(err?.message || JSON.stringify(err) || 'เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, searchReceipt, dateFrom, dateTo])

  useEffect(() => {
    if (activeTab !== 'report') {
      loadPaidQueue(activeTab, true)
    }
    
    // Auto-polling every 10 seconds for active queue only
    let interval: NodeJS.Timeout | null = null
    if (activeTab === 'queue') {
      interval = setInterval(() => {
        loadPaidQueue('queue', false)
      }, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [loadPaidQueue, activeTab])

  const handleTabChange = (tab: 'queue' | 'history' | 'report') => {
    setActiveTab(tab)
    setExpandedId(null)
    // Clear search states when changing tabs
    setSearchReceipt('')
    setDateFrom('')
    setDateTo('')
    // Load fresh data
    if (tab !== 'report') {
      setTimeout(() => {
        loadPaidQueue(tab, true)
      }, 50)
    }
  }

  const handleMarkServed = async (saleId: string) => {
    if (!confirm('ยืนยันส่งโต๊ะลูกค้าและเสร็จสิ้นรายการ?')) return
    setUpdatingId(saleId)
    try {
      const { data: currentSale } = await supabase
        .from('sales')
        .select('note')
        .eq('id', saleId)
        .single()

      const currentNote = currentSale?.note || ''
      const newNote = currentNote ? `${currentNote} | SERVED` : 'SERVED'

      const { error } = await supabase
        .from('sales')
        .update({ note: newNote })
        .eq('id', saleId)

      if (error) throw error

      await loadPaidQueue(activeTab === 'report' ? 'queue' : activeTab, false)
    } catch (err) {
      console.error('Error updating sale status:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleUndoServed = async (saleId: string) => {
    if (!confirm('ต้องการดึงรายการนี้กลับมาที่คิวค้างเตรียมใช่หรือไม่?')) return
    setUpdatingId(saleId)
    try {
      const { data: currentSale } = await supabase
        .from('sales')
        .select('note')
        .eq('id', saleId)
        .single()

      const currentNote = currentSale?.note || ''
      const newNote = currentNote.replace(' | SERVED', '').replace('SERVED', '').trim()

      const { error } = await supabase
        .from('sales')
        .update({ note: newNote || null })
        .eq('id', saleId)

      if (error) throw error

      await loadPaidQueue(activeTab === 'report' ? 'history' : activeTab, false)
    } catch (err) {
      console.error('Error undoing sale status:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleClearFilters = () => {
    setSearchReceipt('')
    setDateFrom('')
    setDateTo('')
    // Trigger reload with blank filter values
    setTimeout(() => {
      setLoading(true)
      supabase
        .from('sales')
        .select('*, sale_items(*)')
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .then(({ data: rawSales }) => {
          let salesData = rawSales || []
          salesData = salesData.filter(sale => parseNote(sale.note).isServed)
          setSales(salesData as Sale[])
          setLoading(false)
        })
    }, 50)
  }

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'เพิ่งจ่ายเงิน'
    if (mins < 60) return `${mins} นาทีที่แล้ว`
    return `${Math.floor(mins / 60)} ชั่วโมงที่แล้ว`
  }

  /* ── Shop Report Handlers ── */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remaining = 5 - reportImages.length
    files.slice(0, remaining).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const result = ev.target?.result as string
        if (result) setReportImages(prev => [...prev, result])
      }
      reader.readAsDataURL(file)
    })
    // reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmitReport = async () => {
    if (!reportTitle.trim()) return
    setReportLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('shop_reports').insert({
        title: reportTitle.trim(),
        note: reportNote.trim() || null,
        images: reportImages.length > 0 ? reportImages : null,
        reported_by: user?.id || null,
        status: 'pending',
      })
      if (error) throw error
      setReportSuccess(true)
      setTimeout(() => {
        setReportTitle('')
        setReportNote('')
        setReportImages([])
        setReportSuccess(false)
        setActiveTab('queue') // Auto navigate back to queue
      }, 1800)
    } catch (err: any) {
      alert('ส่งรายงานไม่สำเร็จ: ' + err.message)
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <div className="animate-in" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-1">คิวเตรียมสินค้า &amp; ส่งเสิร์ฟ</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {activeTab === 'queue'
              ? (loading ? 'กำลังโหลด...' : `มีออเดอร์ค้างเตรียมทั้งหมด ${sales.length} รายการ`)
              : activeTab === 'history' ? `ประวัติทำสำเร็จ ${sales.length} รายการ` : 'ส่งรายงานความเรียบร้อยของร้าน'}
          </p>
        </div>
      </div>


      {/* Tab Selectors (iOS Segmented Control) */}
      <div style={{
        display: 'inline-flex',
        padding: '3px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        marginBottom: '28px',
        gap: '4px',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05)',
        maxWidth: '100%',
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}>
        <button
          onClick={() => handleTabChange('queue')}
          style={{
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '13px',
            background: activeTab === 'queue' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'queue' ? '#fff' : 'var(--text-secondary)',
            border: activeTab === 'queue' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
            boxShadow: activeTab === 'queue' ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          📥 คิวเตรียมสินค้า
        </button>
        <button
          onClick={() => handleTabChange('history')}
          style={{
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '13px',
            background: activeTab === 'history' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'history' ? '#fff' : 'var(--text-secondary)',
            border: activeTab === 'history' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
            boxShadow: activeTab === 'history' ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          ✅ ประวัติทำสินค้าสำเร็จ
        </button>
        <button
          onClick={() => handleTabChange('report')}
          style={{
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '13px',
            background: activeTab === 'report' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeTab === 'report' ? '#fff' : 'var(--text-secondary)',
            border: activeTab === 'report' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
            boxShadow: activeTab === 'report' ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          📋 รายงานความเรียบร้อย
        </button>
      </div>

      {/* Filters (ONLY for History tab) */}
      {activeTab === 'history' && (
        <div className="glass-card p-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Receipt search */}
            <div className="flex items-center gap-2" style={{ flex: '1 1 200px', minWidth: 180 }}>
              <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="ค้นหาเลขบิล..."
                value={searchReceipt}
                onChange={e => setSearchReceipt(e.target.value)}
                className="wine-input w-full"
                style={{ fontSize: '13px' }}
              />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2" style={{ flex: '1 1 200px' }}>
              <CalendarRange size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="wine-input" style={{ fontSize: '13px', flex: 1 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>ถึง</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="wine-input" style={{ fontSize: '13px', flex: 1 }} />
            </div>

            <button onClick={() => loadPaidQueue('history', true)} className="btn-wine flex items-center gap-2 shrink-0">
              <Search size={14} /> ค้นหา
            </button>
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors shrink-0"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
              ล้าง
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
            <p style={{ fontSize: 12, opacity: 0.85, fontFamily: 'monospace' }}>{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 size={40} className="animate-spin mb-4" style={{ color: 'var(--wine-400)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>กำลังโหลดข้อมูล...</p>
        </div>
      ) : sales.length === 0 ? (
        <div className="glass-card p-20 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: activeTab === 'queue' ? 'rgba(56,189,248,0.1)' : 'rgba(34,197,94,0.1)' }}>
            <CheckCircle2 size={36} style={{ color: activeTab === 'queue' ? '#38bdf8' : '#22c55e' }} />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            {activeTab === 'queue' ? 'ไม่มีออเดอร์ค้างเตรียม' : 'ไม่พบประวัติสินค้าสำเร็จ'}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {activeTab === 'queue' 
              ? 'ออเดอร์ที่ชำระเงินเรียบร้อยจากหน้าแอดมินหรือระบบสแกนจะปรากฏที่นี่' 
              : 'ออเดอร์ที่จัดเตรียมและส่งเสิร์ฟเรียบร้อยจะแสดงเป็นตารางประวัติที่นี่'}
          </p>
        </div>
      ) : activeTab === 'queue' ? (
        /* ACTIVE QUEUE: Grid of Cards */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
          {sales.map((sale, index) => {
            const { kitchen: kStatus, bar: bStatus, cleanNote } = parseNote(sale.note)
            const hasKitchen = sale.sale_items?.some(item => classifyCategory((item as any).products?.categories?.name) === 'kitchen')
            const hasBar = sale.sale_items?.some(item => classifyCategory((item as any).products?.categories?.name) === 'bar')
            
            // Order is fully ready if all required stations are ready
            const isOrderReady = (!hasKitchen || kStatus === 'ready') && (!hasBar || bStatus === 'ready')

            return (
              <div key={sale.id} className="card-hover flex flex-col"
                style={{
                  background: 'rgba(26, 31, 46, 0.45)',
                  backdropFilter: 'blur(30px)',
                  WebkitBackdropFilter: 'blur(30px)',
                  border: isOrderReady ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '24px',
                  boxShadow: isOrderReady ? '0 12px 30px rgba(34, 197, 94, 0.12)' : '0 12px 40px rgba(0,0,0,0.25)',
                  minHeight: '260px',
                  overflow: 'hidden',
                  animation: 'fadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                  transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease'
                }}>
                
                {/* Card Header */}
                <div style={{
                  padding: '18px 20px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  background: isOrderReady ? 'rgba(34, 197, 94, 0.04)' : 'rgba(255,255,255,0.015)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(242,198,92,0.2))',
                        color: '#fcd34d',
                        border: '1px solid rgba(242,198,92,0.25)',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '12px'
                      }}>
                        🍷 โต๊ะ {sale.table_no || 'หน้าร้าน'}
                      </span>
                      {isOrderReady && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(74,222,128,0.25))',
                          color: '#4ade80',
                          border: '1px solid rgba(34,197,94,0.3)',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '11px',
                          boxShadow: '0 0 12px rgba(34,197,94,0.2)'
                        }}>
                          🌟 พร้อมเสิร์ฟ
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500 }}>
                      <Clock size={12} />
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{timeSince(sale.created_at)}</span>
                    </div>
                  </div>
                  <h3 style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>#{sale.receipt_no}</h3>
                  {sale.customers && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>👤 {sale.customers.full_name}</p>
                  )}
                </div>

                {/* Prep status indicators */}
                {(hasKitchen || hasBar) && (
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    padding: '10px 20px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'rgba(255,255,255,0.005)'
                  }}>
                    {hasKitchen && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '10px',
                        background: kStatus === 'ready' ? 'rgba(34,197,94,0.1)' : kStatus === 'preparing' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                        color: kStatus === 'ready' ? '#4ade80' : kStatus === 'preparing' ? '#60a5fa' : 'var(--text-muted)',
                        border: `1px solid ${kStatus === 'ready' ? 'rgba(34,197,94,0.2)' : kStatus === 'preparing' ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)'}`
                      }}>
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: kStatus === 'ready' ? '#22c55e' : kStatus === 'preparing' ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                          display: 'inline-block',
                          boxShadow: kStatus === 'ready' ? '0 0 8px #22c55e' : kStatus === 'preparing' ? '0 0 8px #3b82f6' : 'none',
                          animation: kStatus === 'preparing' ? 'reportSpin 1.5s linear infinite' : 'none'
                        }} />
                        ครัว: {kStatus === 'ready' ? 'เสร็จแล้ว' : kStatus === 'preparing' ? 'กำลังทำ...' : 'รอทำ'}
                      </span>
                    )}
                    {hasBar && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '10px',
                        background: bStatus === 'ready' ? 'rgba(34,197,94,0.1)' : bStatus === 'preparing' ? 'rgba(216,169,60,0.1)' : 'rgba(255,255,255,0.03)',
                        color: bStatus === 'ready' ? '#4ade80' : bStatus === 'preparing' ? '#f2c65c' : 'var(--text-muted)',
                        border: `1px solid ${bStatus === 'ready' ? 'rgba(34,197,94,0.2)' : bStatus === 'preparing' ? 'rgba(216,169,60,0.2)' : 'rgba(255,255,255,0.05)'}`
                      }}>
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: bStatus === 'ready' ? '#22c55e' : bStatus === 'preparing' ? '#fbbf24' : 'rgba(255,255,255,0.2)',
                          display: 'inline-block',
                          boxShadow: bStatus === 'ready' ? '0 0 8px #22c55e' : bStatus === 'preparing' ? '0 0 8px #fbbf24' : 'none'
                        }} />
                        บาร์: {bStatus === 'ready' ? 'เสร็จแล้ว' : bStatus === 'preparing' ? 'กำลังทำ...' : 'รอทำ'}
                      </span>
                    )}
                  </div>
                )}

                {/* Items List */}
                <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>รายการเตรียม</p>
                  <div className="space-y-2" style={{ flex: 1 }}>
                    {(sale.sale_items || []).map(item => (
                      <div key={item.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.03)'
                      }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(139,26,44,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Wine size={13} style={{ color: 'var(--wine-300)' }} />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: '13px', color: 'white', fontWeight: 600 }}>{item.product_name}</p>
                            {item.sku && <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>SKU: {item.sku}</p>}
                          </div>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--gold-400)' }}>× {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  {cleanNote && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>📝 โน้ต: {cleanNote}</p>
                    </div>
                  )}
                </div>

                {/* Card Footer Button */}
                <div style={{
                  padding: '14px 20px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  background: 'rgba(0,0,0,0.12)'
                }}>
                  <button
                    onClick={() => handleMarkServed(sale.id)}
                    disabled={updatingId === sale.id}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      boxShadow: '0 6px 20px rgba(16,185,129,0.3)',
                      color: 'white',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: updatingId === sale.id ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { if (updatingId !== sale.id) e.currentTarget.style.opacity = '0.95' }}
                    onMouseLeave={e => { if (updatingId !== sale.id) e.currentTarget.style.opacity = '1' }}
                  >
                    {updatingId === sale.id ? (
                      <>
                        <Loader2 size={15} style={{ animation: 'reportSpin 1s linear infinite' }} />
                        กำลังส่งออเดอร์...
                      </>
                    ) : (
                      <>
                        <Check size={15} />
                        ทำรายการสำเร็จ (ส่งโต๊ะ)
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : activeTab === 'history' ? (
        /* HISTORY TAB: Table Layout (matches POS history page style) */
        <div className="glass-card overflow-hidden">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                  {['', 'เลขบิล', 'วันที่', 'ลูกค้า', 'รายการ', 'ยอดรวม', 'วิธีชำระ', 'สถานะ', ''].map((h, i) => (
                    <th key={i} className="text-left p-3.5 text-xs font-semibold"
                      style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const isExpanded = expandedId === sale.id
                  const items = sale.sale_items || []

                  return (
                    <React.Fragment key={sale.id}>
                      {/* Parent Row */}
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(139,26,44,0.06)' : 'transparent',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                      >
                        <td className="p-3.5 text-center">
                          {isExpanded
                            ? <ChevronDown size={14} style={{ color: 'var(--wine-300)' }} />
                            : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                        </td>
                        <td className="p-3.5">
                          <span className="font-mono text-sm font-semibold" style={{ color: 'var(--wine-300)' }}>
                            {sale.receipt_no}
                          </span>
                        </td>
                        <td className="p-3.5 text-xs" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDate(sale.created_at)}
                        </td>
                        <td className="p-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {(sale.customers as any)?.full_name || '—'}
                        </td>
                        <td className="p-3.5 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                          {items.length}
                        </td>
                        <td className="p-3.5 text-sm font-bold" style={{ color: 'var(--gold-400)' }}>
                          {formatCurrency(sale.total_amount)}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <PaymentIcon method={sale.payment_method} />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {sale.payment_method === 'cash' ? 'เงินสด' :
                               sale.payment_method === 'transfer' ? 'โอน' :
                               sale.payment_method === 'qr' ? 'QR' :
                               sale.payment_method === 'card' ? 'บัตร' : 'ผสม'}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <StatusBadge status={sale.status} note={sale.note} />
                        </td>
                        <td className="p-3.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleUndoServed(sale.id)}
                            disabled={updatingId === sale.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              cursor: updatingId === sale.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {updatingId === sale.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Undo size={12} />
                            )}
                            ดึงกลับคิว
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Sub-Table */}
                      {isExpanded && (
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td colSpan={9} style={{ padding: '0 20px 20px 60px' }}>
                            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                    {['สินค้า', 'SKU', 'ราคา/ชิ้น', 'จำนวน', 'ส่วนลด', 'รวม'].map(h => (
                                      <th key={h} className="text-left p-2.5 text-xs font-semibold"
                                        style={{ color: 'var(--text-muted)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                      <td className="p-2.5 text-sm text-white">{item.product_name}</td>
                                      <td className="p-2.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{item.sku || '—'}</td>
                                      <td className="p-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(item.unit_price)}</td>
                                      <td className="p-2.5 text-sm text-white">{item.quantity}</td>
                                      <td className="p-2.5 text-sm" style={{ color: item.discount_amount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                                        {item.discount_amount > 0 ? `-${formatCurrency(item.discount_amount)}` : '—'}
                                      </td>
                                      <td className="p-2.5 text-sm font-semibold" style={{ color: 'var(--gold-400)' }}>
                                        {formatCurrency(item.line_total)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Summary Totals */}
                            <div className="flex justify-between items-start mt-4">
                              <div style={{ maxWidth: '50%' }}>
                                {sale.note && (
                                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    📝 โน้ตลูกค้า: {sale.note.split(' | SLIP:')[0]}
                                  </p>
                                )}
                              </div>
                              <div className="text-xs space-y-1.5" style={{ minWidth: '180px' }}>
                                <div className="flex justify-between gap-4">
                                  <span style={{ color: 'var(--text-muted)' }}>ก่อนหักส่วนลด</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(sale.subtotal)}</span>
                                </div>
                                {sale.discount_amount > 0 && (
                                  <div className="flex justify-between gap-4">
                                    <span style={{ color: 'var(--text-muted)' }}>ส่วนลด</span>
                                    <span style={{ color: '#ef4444' }}>-{formatCurrency(sale.discount_amount)}</span>
                                  </div>
                                )}
                                {sale.tax_amount > 0 && (
                                  <div className="flex justify-between gap-4">
                                    <span style={{ color: 'var(--text-muted)' }}>ภาษี</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(sale.tax_amount)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between gap-4 font-bold pt-1.5" style={{ borderTop: '1px solid var(--border-color)' }}>
                                  <span className="text-white">ยอดสุทธิ</span>
                                  <span style={{ color: 'var(--gold-400)' }}>{formatCurrency(sale.total_amount)}</span>
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
      ) : (
        /* REPORT TAB: Inline Shop Report Form (iOS Glassmorphism layout) */
        <div style={{
          maxWidth: '560px',
          margin: '0 auto',
          background: 'rgba(26, 31, 46, 0.45)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '24px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          animation: 'fadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}>
          {/* Top gradient bar */}
          <div style={{ height: 4, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8, #7dd3fc)' }} />

          {/* Form Header */}
          <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, #0c4a6e, #38bdf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ClipboardList size={18} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'white' }}>รายงานความเรียบร้อยของร้าน</h2>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>ส่งรายงานเพื่อบันทึกประวัติความเรียบร้อยเข้าสู่ระบบผู้จัดการ</p>
            </div>
          </div>

          {/* Form Body */}
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {reportSuccess ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', animation: 'reportFadeIn 0.3s ease' }}>
                <div style={{
                  width: 60, height: 60, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 28px rgba(56,189,248,0.35)',
                }}>
                  <CheckCircle2 size={28} color="white" />
                </div>
                <h3 style={{ color: 'white', fontWeight: 800, fontSize: '17px', margin: '0 0 6px' }}>ส่งรายงานสำเร็จ!</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>ระบบกำลังพากลับไปหน้าหลักออเดอร์...</p>
              </div>
            ) : (
              <>
                {/* Title */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    หัวข้อรายงาน *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น เปิดร้านเรียบร้อย / เคลียร์ขยะและทำความสะอาดแล้ว..."
                    value={reportTitle}
                    onChange={e => setReportTitle(e.target.value)}
                    style={{ width: '100%', padding: '13px 16px', borderRadius: '14px', border: '1.5px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '14px', fontWeight: 500, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.2s' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </div>

                {/* Note */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    รายละเอียดรายงาน
                  </label>
                  <textarea
                    placeholder="ใส่โน้ตหรือรายละเอียดเพิ่มเติมเกี่ยวกับความเรียบร้อยของร้าน (ถ้ามี)..."
                    value={reportNote}
                    onChange={e => setReportNote(e.target.value)}
                    rows={4}
                    style={{ width: '100%', padding: '13px 16px', borderRadius: '14px', border: '1.5px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '13px', fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6, transition: 'border-color 0.2s' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: 10 }}>
                    รูปภาพประกอบ ({reportImages.length}/5)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 12 }}>
                    {reportImages.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', aspectRatio: '1', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={img} alt={`rpt-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <button
                          onClick={() => setReportImages(prev => prev.filter((_, i) => i !== idx))}
                          style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
                        >×</button>
                      </div>
                    ))}
                    {reportImages.length < 5 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{ aspectRatio: '1', borderRadius: '14px', border: '2px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
                      >
                        <Camera size={20} />
                        <span style={{ fontSize: '10px', fontWeight: 700 }}>เพิ่มรูปภาพ</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Action button */}
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!reportTitle.trim() || reportLoading}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '14px 20px', borderRadius: '16px', border: 'none',
                      background: reportTitle.trim() && !reportLoading ? 'linear-gradient(135deg, #0c4a6e, #0ea5e9)' : 'rgba(255,255,255,0.03)',
                      color: reportTitle.trim() && !reportLoading ? 'white' : 'var(--text-muted)',
                      fontSize: '14px', fontWeight: 800,
                      cursor: reportTitle.trim() && !reportLoading ? 'pointer' : 'not-allowed',
                      boxShadow: reportTitle.trim() && !reportLoading ? '0 6px 20px rgba(14,165,233,0.35)' : 'none',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {reportLoading ? (
                      <><Loader2 size={16} style={{ animation: 'reportSpin 1s linear infinite' }} /> กำลังส่งข้อมูล...</>
                    ) : (
                      <><Send size={15} /> ส่งรายงานความเรียบร้อย</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes reportFadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes reportSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
