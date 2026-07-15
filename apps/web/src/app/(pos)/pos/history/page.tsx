'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Sale, SaleItem } from '@/lib/types'
import {
  Search, ChevronDown, ChevronRight, Loader2, Receipt,
  RotateCcw, CalendarRange, CreditCard, Banknote, QrCode,
  TrendingUp, ShoppingBag, X, Filter
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
  qr:       { label: 'QR', icon: <QrCode size={13} />, color: '#fb923c' },
  card:     { label: 'บัตร', icon: <CreditCard size={13} />, color: '#a78bfa' },
  mixed:    { label: 'ผสม', icon: <CreditCard size={13} />, color: '#94a3b8' },
}

export default function SalesHistoryPage() {
  const supabase = createClient()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refundingId, setRefundingId] = useState<string | null>(null)
  const [showFilter, setShowFilter] = useState(false)

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
                      {['', 'เลขบิล', 'วันที่/เวลา', 'ลูกค้า', 'สินค้า', 'ยอดรวม', 'ชำระ', 'สถานะ', ''].map((h, i) => (
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
                              {sale.status === 'paid' && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleRefund(sale) }}
                                  disabled={refundingId === sale.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    background: 'rgba(168,85,247,0.12)', color: '#c084fc',
                                    border: '1px solid rgba(168,85,247,0.25)',
                                    cursor: 'pointer', whiteSpace: 'nowrap'
                                  }}
                                >
                                  {refundingId === sale.id
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <RotateCcw size={11} />}
                                  คืนสินค้า
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Items */}
                          {isExpanded && (
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td colSpan={9} style={{ padding: '0 14px 14px 46px' }}>
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
                                  {/* Summary */}
                                  <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
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
                          <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>
                            {sale.receipt_no}
                          </span>
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
                          {sale.status === 'paid' && (
                            <button
                              onClick={() => handleRefund(sale)}
                              disabled={refundingId === sale.id}
                              style={{
                                marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
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
    </div>
  )
}
