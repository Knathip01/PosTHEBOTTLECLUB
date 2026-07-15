'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, generateStockReceiptNo } from '@/lib/utils'
import { Product } from '@/lib/types'
import {
  Package, Plus, Search, ArrowDown, History,
  AlertTriangle, CheckCircle, XCircle, Loader2, ChevronLeft, ChevronRight, X, Save
} from 'lucide-react'

type Tab = 'stock' | 'receive' | 'history'

interface ReceiveRow {
  id: string
  product_id: string
  quantity: number
  cost: number
}

interface HistoryItem {
  id: string
  product_id: string
  movement_type: string
  quantity: number
  quantity_before: number
  quantity_after: number
  reference_type?: string
  note?: string
  created_at: string
  products?: { name: string } | null
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock === 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
        style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
        <XCircle size={12} /> หมด
      </span>
    )
  }
  if (stock <= minStock) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
        <AlertTriangle size={12} /> {stock}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
      style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
      <CheckCircle size={12} /> {stock}
    </span>
  )
}

function MovementBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; bg: string; color: string; border: string }> = {
    in:     { label: 'รับเข้า',  bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    out:    { label: 'จ่ายออก', bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    adjust: { label: 'ปรับ',    bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    refund: { label: 'คืน',     bg: 'rgba(168,85,247,0.15)', color: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  }
  const c = config[type] || config.adjust
  return (
    <span className="text-xs font-semibold px-2 py-1 rounded-full"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  )
}

export default function InventoryPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('stock')
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Receive stock
  const [supplierName, setSupplierName] = useState('')
  const [receiveNote, setReceiveNote] = useState('')
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([{ id: '1', product_id: '', quantity: 1, cost: 0 }])
  const [submitting, setSubmitting] = useState(false)
  const [receiveSuccess, setReceiveSuccess] = useState(false)

  // History
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const PAGE_SIZE = 20

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    if (tab === 'history') loadHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, historyPage])

  const loadProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*, categories(name, color)')
      .eq('is_active', true)
      .order('name')
    setProducts((data as Product[]) || [])
    setLoading(false)
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    const from = (historyPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, count } = await supabase
      .from('inventory_movements')
      .select('*, products(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    setHistory((data as HistoryItem[]) || [])
    setHistoryTotal(count || 0)
    setHistoryLoading(false)
  }

  const addReceiveRow = () => {
    setReceiveRows(prev => [...prev, { id: Date.now().toString(), product_id: '', quantity: 1, cost: 0 }])
  }

  const removeReceiveRow = (id: string) => {
    setReceiveRows(prev => prev.filter(r => r.id !== id))
  }

  const updateReceiveRow = (id: string, field: keyof ReceiveRow, value: string | number) => {
    setReceiveRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const handleReceiveSubmit = async () => {
    const validRows = receiveRows.filter(r => r.product_id && r.quantity > 0)
    if (validRows.length === 0) return
    setSubmitting(true)
    try {
      const totalCost = validRows.reduce((s, r) => s + r.cost * r.quantity, 0)
      const receiptNo = generateStockReceiptNo()

      const { data: receipt, error: receiptError } = await supabase
        .from('stock_receipts')
        .insert({ receipt_no: receiptNo, supplier_name: supplierName, note: receiveNote, total_cost: totalCost })
        .select()
        .single()
      if (receiptError) throw receiptError

      for (const row of validRows) {
        await supabase.from('stock_receipt_items').insert({
          stock_receipt_id: receipt.id,
          product_id: row.product_id,
          quantity: row.quantity,
          cost: row.cost
        })

        const product = products.find(p => p.id === row.product_id)
        const before = product?.stock ?? 0
        const after = before + row.quantity

        await supabase.from('products').update({ stock: after }).eq('id', row.product_id)
        await supabase.from('inventory_movements').insert({
          product_id: row.product_id,
          movement_type: 'in',
          quantity: row.quantity,
          quantity_before: before,
          quantity_after: after,
          reference_type: 'purchase',
          reference_id: receipt.id,
          note: `รับสินค้าจาก: ${supplierName || 'ไม่ระบุผู้จัดจำหน่าย'}`,
        })
      }

      setReceiveSuccess(true)
      setSupplierName('')
      setReceiveNote('')
      setReceiveRows([{ id: '1', product_id: '', quantity: 1, cost: 0 }])
      loadProducts()
      setTimeout(() => setReceiveSuccess(false), 3000)
    } catch (err) {
      console.error(err)
    }
    setSubmitting(false)
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    ((p.categories as unknown as { name: string } | null)?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(historyTotal / PAGE_SIZE)

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: '1500px' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white mb-1">จัดการสต๊อก</h1>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm">ดูสต๊อกปัจจุบัน รับสินค้าเข้า และประวัติการเคลื่อนไหว</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)', width: 'fit-content' }}>
        {([
          ['stock', Package, 'สต๊อกปัจจุบัน'],
          ['receive', ArrowDown, 'รับสินค้าเข้า'],
          ['history', History, 'ประวัติ'],
        ] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === key ? 'var(--bg-card)' : 'transparent',
              color: tab === key ? 'var(--wine-300)' : 'var(--text-muted)',
              border: tab === key ? '1px solid var(--border-color)' : '1px solid transparent',
            }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Current Stock Tab */}
      {tab === 'stock' && (
        <div className="glass-card">
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2" style={{ flex: 1, maxWidth: 320 }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="ค้นหาสินค้าหรือหมวดหมู่..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="wine-input w-full"
                style={{ padding: '6px 12px', fontSize: '13px' }}
              />
            </div>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{filteredProducts.length} รายการ</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-20">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--wine-500)' }} />
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['#', 'สินค้า', 'หมวดหมู่', 'ราคา', 'ต้นทุน', 'สต๊อก', 'ขั้นต่ำ', 'สถานะ'].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold"
                        style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => (
                    <tr key={p.id}
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td className="p-3">
                        <p className="text-sm font-medium text-white">{p.name}</p>
                        {p.sku && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>SKU: {p.sku}</p>}
                      </td>
                      <td className="p-3">
                        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {(p.categories as unknown as { name: string } | null)?.name || '—'}
                        </span>
                      </td>
                      <td className="p-3 text-sm font-semibold" style={{ color: 'var(--gold-400)' }}>{formatCurrency(p.price)}</td>
                      <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(p.cost)}</td>
                      <td className="p-3 text-sm font-bold text-white">{p.stock}</td>
                      <td className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>{p.min_stock}</td>
                      <td className="p-3"><StockBadge stock={p.stock} minStock={p.min_stock} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProducts.length === 0 && (
                <div className="flex flex-col items-center justify-center p-16" style={{ color: 'var(--text-muted)' }}>
                  <Package size={40} className="opacity-30 mb-3" />
                  <p>ไม่พบสินค้า</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Receive Stock Tab */}
      {tab === 'receive' && (
        <div className="glass-card p-6">
          {receiveSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
              <CheckCircle size={16} />
              <span className="text-sm font-medium">บันทึกการรับสินค้าเรียบร้อยแล้ว!</span>
            </div>
          )}

          <h3 className="text-base font-semibold text-white mb-4">ข้อมูลผู้จัดจำหน่าย</h3>
          <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ชื่อผู้จัดจำหน่าย</label>
              <input type="text" placeholder="ชื่อซัพพลายเออร์" value={supplierName}
                onChange={e => setSupplierName(e.target.value)} className="wine-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>หมายเหตุ</label>
              <input type="text" placeholder="หมายเหตุ (ไม่บังคับ)" value={receiveNote}
                onChange={e => setReceiveNote(e.target.value)} className="wine-input w-full" />
            </div>
          </div>

          <h3 className="text-base font-semibold text-white mb-3">รายการสินค้าที่รับเข้า</h3>
          <div className="space-y-2 mb-4">
            {receiveRows.map((row, idx) => (
              <div key={row.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs font-bold w-5 shrink-0" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                <select
                  value={row.product_id}
                  onChange={e => updateReceiveRow(row.id, 'product_id', e.target.value)}
                  className="wine-input flex-1"
                  style={{ minWidth: 0 }}>
                  <option value="">-- เลือกสินค้า --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1 shrink-0">
                  <label className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>จำนวน</label>
                  <input type="number" min={1} value={row.quantity}
                    onChange={e => updateReceiveRow(row.id, 'quantity', parseInt(e.target.value) || 1)}
                    className="wine-input" style={{ width: 72 }} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <label className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>ต้นทุน/ชิ้น</label>
                  <input type="number" min={0} step="0.01" value={row.cost}
                    onChange={e => updateReceiveRow(row.id, 'cost', parseFloat(e.target.value) || 0)}
                    className="wine-input" style={{ width: 96 }} />
                </div>
                <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--gold-400)', minWidth: 80, textAlign: 'right' }}>
                  {formatCurrency(row.cost * row.quantity)}
                </span>
                {receiveRows.length > 1 && (
                  <button onClick={() => removeReceiveRow(row.id)}
                    className="shrink-0 p-1 rounded-lg transition-colors"
                    style={{ color: '#ef4444' }}>
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={addReceiveRow}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--bg-secondary)', color: 'var(--wine-300)', border: '1px solid var(--border-color)' }}>
              <Plus size={16} /> เพิ่มรายการ
            </button>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>รวมต้นทุน</p>
                <p className="text-lg font-bold" style={{ color: 'var(--gold-400)' }}>
                  {formatCurrency(receiveRows.reduce((s, r) => s + r.cost * r.quantity, 0))}
                </p>
              </div>
              <button onClick={handleReceiveSubmit} disabled={submitting}
                className="btn-wine flex items-center gap-2 px-6 py-2.5">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                บันทึกการรับสินค้า
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="glass-card">
          {historyLoading ? (
            <div className="flex items-center justify-center p-20">
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--wine-500)' }} />
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {['วันที่', 'สินค้า', 'ประเภท', 'จำนวน', 'ก่อน', 'หลัง', 'หมายเหตุ'].map(h => (
                        <th key={h} className="text-left p-3 text-xs font-semibold"
                          style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id}
                        style={{ borderBottom: '1px solid var(--border-color)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="p-3 text-xs" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(h.created_at)}</td>
                        <td className="p-3 text-sm text-white">{h.products?.name || '—'}</td>
                        <td className="p-3"><MovementBadge type={h.movement_type} /></td>
                        <td className="p-3 text-sm font-bold">
                          <span style={{ color: h.movement_type === 'in' || h.movement_type === 'refund' ? '#22c55e' : '#ef4444' }}>
                            {h.movement_type === 'in' || h.movement_type === 'refund' ? '+' : '-'}{h.quantity}
                          </span>
                        </td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>{h.quantity_before}</td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{h.quantity_after}</td>
                        <td className="p-3 text-xs" style={{ color: 'var(--text-muted)', maxWidth: 200 }}>
                          <span className="truncate block">{h.note || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {history.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-16" style={{ color: 'var(--text-muted)' }}>
                    <History size={40} className="opacity-30 mb-3" />
                    <p>ไม่มีประวัติการเคลื่อนไหว</p>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {historyTotal} รายการ | หน้า {historyPage} จาก {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: historyPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', background: 'var(--bg-secondary)' }}>
                      <ChevronLeft size={16} />
                    </button>
                    <button onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))} disabled={historyPage === totalPages}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: historyPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)', background: 'var(--bg-secondary)' }}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
