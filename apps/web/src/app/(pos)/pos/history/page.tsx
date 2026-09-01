'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Sale, SaleItem } from '@/lib/types'
import {
  Search, ChevronDown, ChevronRight, Loader2, Receipt,
  RotateCcw, CalendarRange, CreditCard, Banknote, QrCode,
  TrendingUp, ShoppingBag, X, Filter, Printer, Eye
} from 'lucide-react'

type StatusType = Sale['status']

function StatusBadge({ status }: { status: StatusType }) {
  const config: Record<StatusType, { label: string; bg: string; color: string; border: string }> = {
    paid:      { label: 'ชำระแล้ว', bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    pending:   { label: 'รอชำระ',   bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
    refunded:  { label: 'คืนสินค้า', bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(168,85,247,0.25)' },
    cancelled: { label: 'ยกเลิก',   bg: 'rgba(239,68,68,0.12)',  color: '#f87171', border: 'rgba(239,68,68,0.25)' },
    hold:      { label: 'พัก',      bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
    completed: { label: 'เสร็จสิ้น', bg: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: 'rgba(56,189,248,0.25)' },
  }
  const c = config[status] || config.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      {c.label}
    </span>
  )
}

const PAYMENT_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  cash:     { label: 'เงินสด', icon: <Banknote size={13} />, color: '#4ade80' },
  transfer: { label: 'โอนเงิน', icon: <CreditCard size={13} />, color: '#60a5fa' },
  qr:       { label: 'QR พร้อมเพย์', icon: <QrCode size={13} />, color: '#fb923c' },
  card:     { label: 'บัตรเครดิต', icon: <CreditCard size={13} />, color: '#a78bfa' },
  mixed:    { label: 'ผสม', icon: <CreditCard size={13} />, color: '#94a3b8' },
}

export default function SalesHistoryPage() {
  const supabase = createClient()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refundingId, setRefundingId] = useState<string | null>(null)
  const [showFilter, setShowFilter] = useState(false)
  const [selectedReceiptSale, setSelectedReceiptSale] = useState<Sale | null>(null)

  // Filters
  const [searchReceipt, setSearchReceipt] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { loadSales() }, [])

  const loadSales = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('sales')
        .select('*, sale_items(*)')
        .neq('status', 'hold')
        .order('created_at', { ascending: false })
        .limit(100)

      if (searchReceipt) query = query.ilike('receipt_no', `%${searchReceipt}%`)
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`)

      const { data: rawSales, error } = await query
      if (error) throw error

      let salesData: any[] = rawSales || []

      const customerIds = [...new Set(salesData.map(s => s.customer_id).filter(Boolean))]
      if (customerIds.length > 0) {
        const { data: customersData } = await supabase.from('customers').select('id, full_name').in('id', customerIds)
        if (customersData) {
          salesData = salesData.map(sale => ({ ...sale, customers: customersData.find(c => c.id === sale.customer_id) || null }))
        }
      }

      const cashierIds = [...new Set(salesData.map(s => s.cashier_id).filter(Boolean))]
      if (cashierIds.length > 0) {
        const { data: profilesData } = await supabase.from('profiles').select('id, full_name').in('id', cashierIds)
        if (profilesData) {
          salesData = salesData.map(sale => ({ ...sale, profiles: profilesData.find(p => p.id === sale.cashier_id) || null }))
        }
      }

      setSales(salesData as Sale[])
    } catch (err) {
      console.error('Error loading sales history:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePrintReceipt = (sale: Sale) => {
    const printWindow = window.open('', '_blank', 'width=380,height=650')
    if (!printWindow) {
      alert('กรุณาอนุญาตป๊อปอัป (Pop-up) เพื่อพิมพ์ใบเสร็จ')
      return
    }

    const items: SaleItem[] = sale.sale_items || []
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding:4px 0;font-size:12px;vertical-align:top;line-height:1.3;">${item.product_name}</td>
        <td style="padding:4px 0;font-size:12px;text-align:center;vertical-align:top;white-space:nowrap;">x${item.quantity}</td>
        <td style="padding:4px 0;font-size:12px;text-align:right;vertical-align:top;white-space:nowrap;font-weight:600;">${formatCurrency(item.line_total)}</td>
      </tr>
      ${item.discount_amount > 0 ? `
      <tr>
        <td colspan="2" style="padding:0 0 4px 0;font-size:11px;color:#666;">- ส่วนลดสินค้า</td>
        <td style="padding:0 0 4px 0;font-size:11px;text-align:right;color:#666;">-${formatCurrency(item.discount_amount)}</td>
      </tr>` : ''}
    `).join('')

    const paymentInfo = PAYMENT_MAP[sale.payment_method] || { label: sale.payment_method || 'เงินสด' }
    const customerName = (sale.customers as any)?.full_name
    const cashierName = (sale.profiles as any)?.full_name
    const subtotalCalc = sale.subtotal || (sale.total_amount + (sale.discount_amount || 0))

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>ใบเสร็จ #${sale.receipt_no}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body {
              font-family: 'Courier New', 'Sarabun', Tahoma, monospace;
              width: 76mm;
              margin: 0 auto;
              padding: 14px 10px;
              color: #000;
              background: #fff;
              box-sizing: border-box;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .fw-bold { font-weight: bold; }
            h2 { margin: 0 0 3px; font-size: 16px; text-align: center; letter-spacing: 0.5px; }
            p { margin: 2px 0; font-size: 11px; }
            .muted { color: #555; }
            .dash { border-top: 1px dashed #000; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; }
            td, th { font-size: 12px; }
            .summary-table td { padding: 2px 0; }
            @media print {
              body { padding: 4px; }
            }
          </style>
        </head>
        <body>
          <div class="text-center">
            <h2>THE BOTTLE CLUB</h2>
            <p style="font-size:11px;color:#555;margin-top:2px;">ใบเสร็จรับเงิน</p>
          </div>
          <div class="dash"></div>
          <table style="font-size: 11px;">
            <tbody>
              <tr>
                <td style="color:#555;">เลขที่บิล:</td>
                <td class="text-right fw-bold">${sale.receipt_no}</td>
              </tr>
              <tr>
                <td style="color:#555;">วันที่:</td>
                <td class="text-right">${new Date(sale.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
              </tr>
              ${sale.table_no ? `<tr><td style="color:#555;">โต๊ะ:</td><td class="text-right fw-bold">${sale.table_no}</td></tr>` : ''}
              ${cashierName ? `<tr><td style="color:#555;">พนักงาน:</td><td class="text-right">${cashierName}</td></tr>` : ''}
              ${customerName ? `<tr><td style="color:#555;">ลูกค้า/สมาชิก:</td><td class="text-right fw-bold">${customerName}</td></tr>` : ''}
            </tbody>
          </table>
          <div class="dash"></div>
          <table>
            <thead>
              <tr style="border-bottom: 1px solid #000; font-size: 11px;">
                <th style="text-align:left; padding-bottom: 4px;">รายการ</th>
                <th style="text-align:center; padding-bottom: 4px; width: 35px;">จน.</th>
                <th style="text-align:right; padding-bottom: 4px; width: 65px;">รวม</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="dash"></div>
          <table class="summary-table">
            <tbody>
              <tr>
                <td>ยอดรวม</td>
                <td class="text-right">${formatCurrency(subtotalCalc)}</td>
              </tr>
              ${sale.discount_amount > 0 ? `
              <tr>
                <td>ส่วนลด ${sale.discount_note ? `(${sale.discount_note})` : ''}</td>
                <td class="text-right">-${formatCurrency(sale.discount_amount)}</td>
              </tr>` : ''}
              ${sale.service_charge ? `
              <tr>
                <td>Service Charge</td>
                <td class="text-right">${formatCurrency(sale.service_charge)}</td>
              </tr>` : ''}
              ${sale.tax_amount ? `
              <tr>
                <td>ภาษีมูลค่าเพิ่ม (VAT)</td>
                <td class="text-right">${formatCurrency(sale.tax_amount)}</td>
              </tr>` : ''}
              <tr class="fw-bold" style="font-size: 14px; border-top: 1px solid #000; border-bottom: 1px solid #000;">
                <td style="padding: 6px 0;">ยอดสุทธิ</td>
                <td class="text-right" style="padding: 6px 0;">${formatCurrency(sale.total_amount)}</td>
              </tr>
              <tr>
                <td style="padding-top: 5px;">ชำระด้วย</td>
                <td class="text-right" style="padding-top: 5px; font-weight: 600;">${paymentInfo.label}</td>
              </tr>
              ${sale.payment_method === 'cash' && sale.cash_received ? `
              <tr>
                <td>รับเงินสด</td>
                <td class="text-right">${formatCurrency(sale.cash_received)}</td>
              </tr>
              <tr>
                <td>เงินทอน</td>
                <td class="text-right">${formatCurrency(sale.change_amount || 0)}</td>
              </tr>` : ''}
            </tbody>
          </table>
          <div class="dash"></div>
          <div class="text-center" style="margin-top: 12px;">
            <p style="font-size: 11px; font-weight: bold;">ขอบคุณที่ใช้บริการ / Thank You</p>
            <p style="font-size: 10px; color: #777;">THE BOTTLE CLUB</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleRefund = async (sale: Sale) => {
    if (!confirm(`ยืนยันคืนสินค้าบิล ${sale.receipt_no}?`)) return
    setRefundingId(sale.id)
    try {
      await supabase.from('sales').update({ status: 'refunded' }).eq('id', sale.id)
      for (const item of sale.sale_items || []) {
        if (!item.product_id) continue
        const { data: product } = await supabase.from('products').select('stock').eq('id', item.product_id).single()
        if (product) {
          const before = product.stock
          const after = before + item.quantity
          await supabase.from('products').update({ stock: after }).eq('id', item.product_id)
          await supabase.from('inventory_movements').insert({
            product_id: item.product_id, movement_type: 'refund',
            quantity: item.quantity, quantity_before: before, quantity_after: after,
            reference_type: 'refund', reference_id: sale.id,
            note: `คืนสินค้าจากบิล ${sale.receipt_no}`,
          })
        }
      }
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, status: 'refunded' } : s))
    } catch (err) {
      console.error(err)
    }
    setRefundingId(null)
  }

  // Stats
  const paidSales = sales.filter(s => s.status === 'paid' || s.status === 'completed')
  const totalRevenue = paidSales.reduce((sum, s) => sum + s.total_amount, 0)
  const totalItems = paidSales.reduce((sum, s) => sum + (s.sale_items?.length || 0), 0)

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg-primary)' }} className="no-scrollbar">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
              ประวัติการขาย
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              แสดง {sales.length} รายการล่าสุด
            </p>
          </div>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className="btn-ghost"
            style={{ fontSize: 13 }}
          >
            <Filter size={14} />
            กรองข้อมูล
            {(searchReceipt || dateFrom || dateTo) && (
              <span style={{
                background: 'var(--info)', color: 'white',
                borderRadius: 999, width: 18, height: 18, fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>!</span>
            )}
          </button>
        </div>

        {/* ── Summary Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'ยอดขายรวม', value: formatCurrency(totalRevenue), icon: <TrendingUp size={18} />, color: 'var(--gold-400)', bg: 'rgba(216,169,60,0.1)', border: 'rgba(216,169,60,0.2)' },
            { label: 'บิลที่ขาย', value: `${paidSales.length} บิล`, icon: <Receipt size={18} />, color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)' },
            { label: 'รายการสินค้า', value: `${totalItems} รายการ`, icon: <ShoppingBag size={18} />, color: '#93c5fd', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: stat.bg, border: `1px solid ${stat.border}`,
              borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12
            }}>
              <div style={{ color: stat.color }}>{stat.icon}</div>
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ── */}
        {showFilter && (
          <div className="glass-card animate-in" style={{ padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                  ค้นหาเลขบิล
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text" placeholder="POS-XXXXXX"
                    value={searchReceipt} onChange={e => setSearchReceipt(e.target.value)}
                    className="wine-input" style={{ paddingLeft: 30, fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                  จากวันที่
                </label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="wine-input" style={{ fontSize: 13 }} />
              </div>
              <div style={{ flex: '1 1 130px', minWidth: 120 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
                  ถึงวันที่
                </label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="wine-input" style={{ fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={loadSales} className="btn-primary" style={{ padding: '10px 18px', fontSize: 13 }}>
                  <Search size={13} /> ค้นหา
                </button>
                <button
                  onClick={() => { setSearchReceipt(''); setDateFrom(''); setDateTo('') }}
                  className="btn-ghost" style={{ padding: '10px 14px', fontSize: 13 }}
                >
                  ล้าง
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Table / Card List ── */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
              <div style={{ textAlign: 'center' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: '#93c5fd', margin: '0 auto 12px' }} />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>กำลังโหลดข้อมูล...</p>
              </div>
            </div>
          ) : sales.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Receipt size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>ไม่พบรายการขาย</p>
              <p style={{ margin: 0, fontSize: 13 }}>ลองปรับตัวกรองหรือค้นหาใหม่อีกครั้ง</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                      {['', 'เลขบิล', 'วันที่/เวลา', 'โต๊ะ', 'ลูกค้า', 'สินค้า', 'ยอดรวม', 'ชำระ', 'สถานะ', 'การกระทำ'].map((h, i) => (
                        <th key={i} style={{
                          textAlign: 'left', padding: '10px 14px',
                          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                          letterSpacing: '0.06em', whiteSpace: 'nowrap'
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale, idx) => {
                      const isExpanded = expandedId === sale.id
                      const items: SaleItem[] = sale.sale_items || []
                      const payment = PAYMENT_MAP[sale.payment_method] || PAYMENT_MAP.cash

                      return (
                        <React.Fragment key={sale.id}>
                          <tr
                            onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                            className="animate-in"
                            style={{
                              animationDelay: `${idx * 20}ms`,
                              borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                              cursor: 'pointer',
                              background: isExpanded ? 'rgba(59,130,246,0.04)' : 'transparent',
                              transition: 'background 150ms'
                            }}
                            onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                            onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={{ padding: '12px 14px', width: 32 }}>
                              {isExpanded
                                ? <ChevronDown size={14} style={{ color: '#93c5fd' }} />
                                : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>
                                {sale.receipt_no}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {formatDate(sale.created_at)}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: sale.table_no ? '#60a5fa' : 'var(--text-muted)' }}>
                              {sale.table_no ? `โต๊ะ ${sale.table_no}` : '—'}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 140 }}>
                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {(sale.customers as any)?.full_name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                minWidth: 28, height: 20, borderRadius: 999, fontSize: 11, fontWeight: 700,
                                background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)'
                              }}>
                                {items.length}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold-400)' }}>
                                {formatCurrency(sale.total_amount)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: payment.color }}>
                                {payment.icon}
                                <span style={{ fontSize: 12, fontWeight: 600 }}>{payment.label}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <StatusBadge status={sale.status} />
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setSelectedReceiptSale(sale) }}
                                  title="ดูใบเสร็จ"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '5px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    background: 'rgba(59,130,246,0.12)', color: '#93c5fd',
                                    border: '1px solid rgba(59,130,246,0.25)',
                                    cursor: 'pointer', whiteSpace: 'nowrap'
                                  }}
                                >
                                  <Eye size={12} />
                                  ดูบิล
                                </button>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); handlePrintReceipt(sale) }}
                                  title="พิมพ์ใบเสร็จ"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '5px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    background: 'rgba(216,169,60,0.12)', color: 'var(--gold-400)',
                                    border: '1px solid rgba(216,169,60,0.25)',
                                    cursor: 'pointer', whiteSpace: 'nowrap'
                                  }}
                                >
                                  <Printer size={12} />
                                  พิมพ์
                                </button>
                                {sale.status === 'paid' && (
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); handleRefund(sale) }}
                                    disabled={refundingId === sale.id}
                                    title="คืนสินค้า"
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 4,
                                      padding: '5px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                      background: 'rgba(168,85,247,0.12)', color: '#c084fc',
                                      border: '1px solid rgba(168,85,247,0.25)',
                                      cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {refundingId === sale.id
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <RotateCcw size={11} />}
                                    คืน
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Items */}
                          {isExpanded && (
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td colSpan={10} style={{ padding: '0 14px 14px 46px' }}>
                                <div style={{
                                  borderRadius: 12, overflow: 'hidden',
                                  border: '1px solid var(--border-color)', background: 'var(--bg-primary)'
                                }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                        {['สินค้า', 'ราคา/ชิ้น', 'จำนวน', 'ส่วนลด', 'รวม'].map(h => (
                                          <th key={h} style={{
                                            textAlign: 'left', padding: '8px 12px',
                                            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)'
                                          }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map(item => (
                                        <tr key={item.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                                          <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{item.product_name}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{formatCurrency(item.unit_price)}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.quantity}</td>
                                          <td style={{ padding: '8px 12px', fontSize: 12, color: item.discount_amount > 0 ? '#f87171' : 'var(--text-muted)' }}>
                                            {item.discount_amount > 0 ? `-${formatCurrency(item.discount_amount)}` : '—'}
                                          </td>
                                          <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--gold-400)' }}>{formatCurrency(item.line_total)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {/* Summary and Print Action */}
                                  <div style={{
                                    padding: '12px 16px', borderTop: '1px solid var(--border-color)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                                  }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedReceiptSale(sale)}
                                        className="btn-ghost"
                                        style={{ fontSize: 12, padding: '7px 12px' }}
                                      >
                                        <Eye size={14} /> ดูตัวอย่างใบเสร็จ
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handlePrintReceipt(sale)}
                                        className="btn-primary"
                                        style={{ fontSize: 12, padding: '7px 14px' }}
                                      >
                                        <Printer size={14} /> พิมพ์ใบเสร็จ
                                      </button>
                                    </div>
                                    <div style={{ minWidth: 200 }}>
                                      {sale.discount_amount > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                          <span style={{ color: 'var(--text-muted)' }}>ส่วนลด</span>
                                          <span style={{ color: '#f87171' }}>-{formatCurrency(sale.discount_amount)}</span>
                                        </div>
                                      )}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, paddingTop: 4, borderTop: '1px solid var(--border-color)' }}>
                                        <span style={{ color: 'var(--text-primary)' }}>ยอดสุทธิ</span>
                                        <span style={{ color: 'var(--gold-400)' }}>{formatCurrency(sale.total_amount)}</span>
                                      </div>
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

              {/* Mobile Card List */}
              <div className="md:hidden" style={{ padding: '8px 0' }}>
                {sales.map((sale, idx) => {
                  const items: SaleItem[] = sale.sale_items || []
                  const payment = PAYMENT_MAP[sale.payment_method] || PAYMENT_MAP.cash
                  const isExpanded = expandedId === sale.id

                  return (
                    <div
                      key={sale.id}
                      className="animate-in"
                      style={{
                        animationDelay: `${idx * 20}ms`,
                        borderBottom: '1px solid var(--border-color)'
                      }}
                    >
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                        style={{
                          width: '100%', textAlign: 'left', background: 'none', border: 'none',
                          padding: '14px 16px', cursor: 'pointer', display: 'block'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>
                              {sale.receipt_no}
                            </span>
                            {sale.table_no && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                                โต๊ะ {sale.table_no}
                              </span>
                            )}
                          </div>
                          <StatusBadge status={sale.status} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(sale.created_at)}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: payment.color, fontSize: 12 }}>
                              {payment.icon} {payment.label} · {items.length} รายการ
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold-400)' }}>
                              {formatCurrency(sale.total_amount)}
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* Expanded mobile detail */}
                      {isExpanded && (
                        <div className="animate-in" style={{ padding: '0 16px 14px' }}>
                          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                            {items.map((item, i) => (
                              <div key={item.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 12px',
                                borderTop: i === 0 ? 'none' : '1px solid var(--border-color)',
                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                              }}>
                                <div>
                                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.product_name}</p>
                                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                                    {formatCurrency(item.unit_price)} × {item.quantity}
                                  </p>
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-400)' }}>{formatCurrency(item.line_total)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Mobile Action Buttons */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptSale(sale)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                                background: 'rgba(59,130,246,0.12)', color: '#93c5fd',
                                border: '1px solid rgba(59,130,246,0.25)', cursor: 'pointer'
                              }}
                            >
                              <Eye size={13} /> ดูใบเสร็จ
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintReceipt(sale)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                                background: 'rgba(216,169,60,0.15)', color: 'var(--gold-400)',
                                border: '1px solid rgba(216,169,60,0.3)', cursor: 'pointer'
                              }}
                            >
                              <Printer size={13} /> พิมพ์ใบเสร็จ
                            </button>
                          </div>

                          {sale.status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleRefund(sale)}
                              disabled={refundingId === sale.id}
                              style={{
                                marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                                background: 'rgba(168,85,247,0.12)', color: '#c084fc',
                                border: '1px solid rgba(168,85,247,0.25)', cursor: 'pointer'
                              }}
                            >
                              {refundingId === sale.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                              คืนสินค้า
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Receipt Preview Modal ── */}
      {selectedReceiptSale && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}
          onClick={() => setSelectedReceiptSale(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="animate-in"
            style={{
              background: '#ffffff', color: '#1e293b',
              borderRadius: 20, maxWidth: 420, width: '100%',
              maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              fontFamily: "'Courier New', 'Sarabun', Tahoma, monospace"
            }}
          >
            {/* Modal Top Bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
              borderTopLeftRadius: 20, borderTopRightRadius: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Receipt size={18} style={{ color: '#b02238' }} />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                  ตัวอย่างใบเสร็จรับเงิน
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceiptSale(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Receipt Body (Paper style) */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#b02238', letterSpacing: 0.5 }}>
                  THE BOTTLE CLUB
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>ใบเสร็จรับเงิน</p>
              </div>

              <div style={{ borderTop: '1px dashed #cbd5e1', margin: '12px 0' }} />

              {/* Meta Info */}
              <div style={{ fontSize: 12, lineHeight: '1.6', color: '#475569' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>เลขที่บิล:</span>
                  <strong style={{ color: '#0f172a' }}>{selectedReceiptSale.receipt_no}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>วันที่:</span>
                  <span>{new Date(selectedReceiptSale.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                {selectedReceiptSale.table_no && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>โต๊ะ:</span>
                    <strong style={{ color: '#2563eb' }}>โต๊ะ {selectedReceiptSale.table_no}</strong>
                  </div>
                )}
                {(selectedReceiptSale.profiles as any)?.full_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>พนักงาน:</span>
                    <span>{(selectedReceiptSale.profiles as any).full_name}</span>
                  </div>
                )}
                {(selectedReceiptSale.customers as any)?.full_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ลูกค้า/สมาชิก:</span>
                    <strong style={{ color: '#0f172a' }}>{(selectedReceiptSale.customers as any).full_name}</strong>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #cbd5e1', margin: '12px 0' }} />

              {/* Items List */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #cbd5e1', color: '#64748b' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 6 }}>รายการ</th>
                    <th style={{ textAlign: 'center', paddingBottom: 6, width: 40 }}>จน.</th>
                    <th style={{ textAlign: 'right', paddingBottom: 6, width: 75 }}>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReceiptSale.sale_items || []).map((item, idx) => (
                    <React.Fragment key={item.id || idx}>
                      <tr>
                        <td style={{ padding: '6px 0', verticalAlign: 'top', color: '#1e293b', fontWeight: 600 }}>
                          {item.product_name}
                        </td>
                        <td style={{ padding: '6px 0', textAlign: 'center', verticalAlign: 'top', color: '#64748b' }}>
                          x{item.quantity}
                        </td>
                        <td style={{ padding: '6px 0', textAlign: 'right', verticalAlign: 'top', fontWeight: 700, color: '#0f172a' }}>
                          {formatCurrency(item.line_total)}
                        </td>
                      </tr>
                      {item.discount_amount > 0 && (
                        <tr>
                          <td colSpan={2} style={{ padding: '0 0 4px 0', fontSize: 11, color: '#ef4444' }}>
                            - ส่วนลดสินค้า
                          </td>
                          <td style={{ padding: '0 0 4px 0', textAlign: 'right', fontSize: 11, color: '#ef4444' }}>
                            -{formatCurrency(item.discount_amount)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <div style={{ borderTop: '1px dashed #cbd5e1', margin: '12px 0' }} />

              {/* Summary calculations */}
              <div style={{ fontSize: 12, lineHeight: '1.7', color: '#475569' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>ยอดรวมสินค้า</span>
                  <span>{formatCurrency(selectedReceiptSale.subtotal || (selectedReceiptSale.total_amount + (selectedReceiptSale.discount_amount || 0)))}</span>
                </div>
                {selectedReceiptSale.discount_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                    <span>ส่วนลด {selectedReceiptSale.discount_note ? `(${selectedReceiptSale.discount_note})` : ''}</span>
                    <span>-{formatCurrency(selectedReceiptSale.discount_amount)}</span>
                  </div>
                )}
                {selectedReceiptSale.service_charge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Service Charge</span>
                    <span>{formatCurrency(selectedReceiptSale.service_charge)}</span>
                  </div>
                )}
                {selectedReceiptSale.tax_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>ภาษีมูลค่าเพิ่ม (VAT)</span>
                    <span>{formatCurrency(selectedReceiptSale.tax_amount)}</span>
                  </div>
                )}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', marginTop: 4,
                  borderTop: '1.5px solid #0f172a', borderBottom: '1.5px solid #0f172a',
                  fontSize: 15, fontWeight: 900, color: '#0f172a'
                }}>
                  <span>ยอดสุทธิ</span>
                  <span style={{ color: '#b02238' }}>{formatCurrency(selectedReceiptSale.total_amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                  <span>วิธีชำระเงิน</span>
                  <strong style={{ color: '#0f172a' }}>
                    {PAYMENT_MAP[selectedReceiptSale.payment_method]?.label || selectedReceiptSale.payment_method}
                  </strong>
                </div>
                {selectedReceiptSale.payment_method === 'cash' && selectedReceiptSale.cash_received && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>รับเงินสด</span>
                      <span>{formatCurrency(selectedReceiptSale.cash_received)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>เงินทอน</span>
                      <strong style={{ color: '#16a34a' }}>{formatCurrency(selectedReceiptSale.change_amount || 0)}</strong>
                    </div>
                  </>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #cbd5e1', margin: '14px 0 10px' }} />

              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>ขอบคุณที่ใช้บริการ / Thank You</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94a3b8' }}>THE BOTTLE CLUB</p>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div style={{
              display: 'flex', gap: 10, padding: '14px 20px', background: '#f8fafc',
              borderTop: '1px solid #e2e8f0', borderBottomLeftRadius: 20, borderBottomRightRadius: 20
            }}>
              <button
                type="button"
                onClick={() => setSelectedReceiptSale(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: '#e2e8f0', color: '#475569', border: 'none', cursor: 'pointer'
                }}
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => handlePrintReceipt(selectedReceiptSale)}
                style={{
                  flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: '#b02238', color: '#ffffff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(176,34,56,0.3)'
                }}
              >
                <Printer size={16} /> พิมพ์ใบเสร็จ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

