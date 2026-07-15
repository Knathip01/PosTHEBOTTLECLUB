'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CreditCard,
  Loader2,
  Package,
  Receipt,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type DateRange = 7 | 30 | 90 | 'custom'

interface ReportSaleItem {
  product_name: string
  quantity: number
  line_total: number
  cost: number
}

interface ReportSale {
  id: string
  receipt_no: string
  created_at: string
  total_amount: number
  payment_method: 'cash' | 'transfer' | 'qr' | 'card' | 'mixed'
  profiles: { full_name: string }[] | { full_name: string } | null
  sale_items: ReportSaleItem[] | null
}

interface ChartPoint {
  date: string
  sales: number
}

const PAYMENT_META = {
  cash: { label: 'เงินสด', color: '#f2c65c' },
  transfer: { label: 'โอนเงิน', color: '#38bdf8' },
  qr: { label: 'QR Payment', color: '#68dfcb' },
  card: { label: 'บัตร', color: '#a78bfa' },
  mixed: { label: 'หลายช่องทาง', color: '#fb7185' },
}

const numberValue = (value: number | string | null | undefined) => Number(value || 0)

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [range, setRange] = useState<DateRange>(30)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<ReportSale[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [selectedCashierDetail, setSelectedCashierDetail] = useState<string | null>(null)
  const [selectedStockStaffDetail, setSelectedStockStaffDetail] = useState<string | null>(null)
  const [shopReports, setShopReports] = useState<any[]>([])
  const [newArrivals, setNewArrivals] = useState<any[]>([])
  const [bottomTab, setBottomTab] = useState<'staff' | 'arrivals' | 'readiness'>('staff')
  const [selectedShopReportImage, setSelectedShopReportImage] = useState<string[] | null>(null)

  const loadReport = useCallback(async (days: DateRange, customStart?: string, customEnd?: string) => {
    setLoading(true)
    let fromISO: string
    let toISO: string = new Date().toISOString()

    if (days === 'custom' && customStart) {
      const start = new Date(customStart)
      start.setHours(0, 0, 0, 0)
      fromISO = start.toISOString()

      if (customEnd) {
        const end = new Date(customEnd)
        end.setHours(23, 59, 59, 999)
        toISO = end.toISOString()
      }
    } else {
      const d = typeof days === 'number' ? days : 30
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      from.setDate(from.getDate() - (d - 1))
      fromISO = from.toISOString()
    }

    const [
      { data: salesData },
      { data: receiptsData },
      { data: shopReportsData },
      { data: newArrivalsData }
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('id, receipt_no, created_at, total_amount, payment_method, profiles(full_name), sale_items(product_name, quantity, line_total, cost)')
        .eq('status', 'paid')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false }),
      supabase
        .from('stock_receipts')
        .select('id, receipt_no, supplier_name, total_cost, created_at, profiles(full_name)')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false }),
      supabase
        .from('shop_reports')
        .select('id, title, note, images, status, created_at, profiles(full_name)')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false }),
      supabase
        .from('stock_receipt_items')
        .select('id, quantity, cost, created_at, products(name, sku), stock_receipts(receipt_no, supplier_name, profiles(full_name))')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false })
    ])

    setSales((salesData as ReportSale[]) || [])
    setReceipts(receiptsData || [])
    setShopReports(shopReportsData || [])
    setNewArrivals(newArrivalsData || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadReport(range, startDate, endDate) }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadReport, range, startDate, endDate])

  const report = useMemo(() => {
    const totalSales = sales.reduce((sum, sale) => sum + numberValue(sale.total_amount), 0)
    const orderCount = sales.length
    const grossProfit = sales.reduce(
      (sum, sale) => sum + (sale.sale_items || []).reduce(
        (itemSum, item) => itemSum + numberValue(item.line_total) - numberValue(item.cost) * numberValue(item.quantity),
        0,
      ),
      0,
    )

    const buckets = new Map<string, number>()
    let daysDiff = 30
    if (range === 'custom' && startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      daysDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      for (let i = 0; i < daysDiff; i++) {
        const date = new Date(start)
        date.setDate(date.getDate() + i)
        buckets.set(date.toISOString().slice(0, 10), 0)
      }
    } else {
      const d = typeof range === 'number' ? range : 30
      daysDiff = d
      for (let offset = d - 1; offset >= 0; offset -= 1) {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        date.setDate(date.getDate() - offset)
        buckets.set(date.toISOString().slice(0, 10), 0)
      }
    }

    for (const sale of sales) {
      const key = sale.created_at.slice(0, 10)
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) || 0) + numberValue(sale.total_amount))
      }
    }
    const chartData: ChartPoint[] = Array.from(buckets.entries()).map(([key, amount]) => ({
      date: new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: daysDiff > 30 ? 'short' : undefined }).format(new Date(`${key}T12:00:00`)),
      sales: amount,
    }))

    const paymentTotals = Object.keys(PAYMENT_META).map(key => {
      const method = key as keyof typeof PAYMENT_META
      return {
        method,
        amount: sales
          .filter(sale => sale.payment_method === method)
          .reduce((sum, sale) => sum + numberValue(sale.total_amount), 0),
      }
    }).filter(item => item.amount > 0)

    const productMap = new Map<string, { quantity: number; sales: number }>()
    for (const sale of sales) {
      for (const item of sale.sale_items || []) {
        const current = productMap.get(item.product_name) || { quantity: 0, sales: 0 }
        productMap.set(item.product_name, {
          quantity: current.quantity + numberValue(item.quantity),
          sales: current.sales + numberValue(item.line_total),
        })
      }
    }
    const topProducts = Array.from(productMap.entries())
      .map(([name, values]) => ({ name, ...values }))
      .sort((left, right) => right.sales - left.sales)
      .slice(0, 5)

    const recentSales = sales.slice(0, 5)
    const previousHalf = chartData.slice(0, Math.ceil(chartData.length / 2)).reduce((sum, point) => sum + point.sales, 0)
    const currentHalf = chartData.slice(Math.ceil(chartData.length / 2)).reduce((sum, point) => sum + point.sales, 0)
    const change = previousHalf ? ((currentHalf - previousHalf) / previousHalf) * 100 : 0

    // Cashier performance report
    const cashierMap = new Map<string, { totalSales: number; orderCount: number }>()
    for (const sale of sales) {
      let cashierName = 'ไม่ระบุแคชเชียร์'
      if (sale.profiles) {
        if (Array.isArray(sale.profiles)) {
          if (sale.profiles.length > 0) {
            cashierName = sale.profiles[0].full_name
          }
        } else {
          cashierName = (sale.profiles as any).full_name
        }
      }
      const current = cashierMap.get(cashierName) || { totalSales: 0, orderCount: 0 }
      cashierMap.set(cashierName, {
        totalSales: current.totalSales + numberValue(sale.total_amount),
        orderCount: current.orderCount + 1
      })
    }
    const cashierReports = Array.from(cashierMap.entries()).map(([name, data]) => ({
      name,
      totalSales: data.totalSales,
      orderCount: data.orderCount,
      avgBill: data.orderCount ? data.totalSales / data.orderCount : 0
    })).sort((a, b) => b.totalSales - a.totalSales)

    // Stock staff performance report
    const stockStaffMap = new Map<string, { totalCost: number; receiptCount: number }>()
    for (const receipt of receipts) {
      let staffName = 'ไม่ระบุพนักงาน'
      if (receipt.profiles) {
        if (Array.isArray(receipt.profiles)) {
          if (receipt.profiles.length > 0) {
            staffName = receipt.profiles[0].full_name
          }
        } else {
          staffName = (receipt.profiles as any).full_name
        }
      }
      const current = stockStaffMap.get(staffName) || { totalCost: 0, receiptCount: 0 }
      stockStaffMap.set(staffName, {
        totalCost: current.totalCost + numberValue(receipt.total_cost),
        receiptCount: current.receiptCount + 1
      })
    }
    const stockStaffReports = Array.from(stockStaffMap.entries()).map(([name, data]) => ({
      name,
      totalCost: data.totalCost,
      receiptCount: data.receiptCount
    })).sort((a, b) => b.totalCost - a.totalCost)

    return {
      totalSales,
      orderCount,
      grossProfit,
      averageOrder: orderCount ? totalSales / orderCount : 0,
      change,
      chartData,
      paymentTotals,
      topProducts,
      recentSales,
      cashierReports,
      stockStaffReports,
    }
  }, [range, sales, receipts, startDate, endDate])

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: 1540 }}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold tracking-[0.12em]" style={{ color: 'var(--wine-300)' }}>ANALYTICS</p>
          <h1 className="admin-page-heading">รายงานยอดขาย</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>ภาพรวมยอดขายและสินค้าที่ทำผลงานดี</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Presets */}
          <div className="flex rounded-lg border p-1" style={{ borderColor: 'var(--border-color)', background: '#0d1726' }}>
            {([7, 30, 90] as DateRange[]).map(days => (
              <button
                key={days}
                type="button"
                onClick={() => setRange(days)}
                className="rounded-md px-3.5 py-2 text-xs font-bold transition-colors"
                style={range === days
                  ? { background: 'var(--wine-500)', color: '#05211f', cursor: 'pointer' }
                  : { color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {days} วัน
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRange('custom')}
              className="rounded-md px-3.5 py-2 text-xs font-bold transition-colors"
              style={range === 'custom'
                ? { background: 'var(--wine-500)', color: '#05211f', cursor: 'pointer' }
                : { color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              กำหนดเอง
            </button>
          </div>

          {/* Date Picker Inputs (shown if range is 'custom') */}
          {range === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="animate-in">
              <input
                type="date"
                className="wine-input text-xs"
                style={{ padding: '8px 12px', width: 'auto', background: '#0d1726', color: 'white', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>ถึง</span>
              <input
                type="date"
                className="wine-input text-xs"
                style={{ padding: '8px 12px', width: 'auto', background: '#0d1726', color: 'white', border: '1px solid var(--border-color)', borderRadius: '6px' }}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-96 items-center justify-center">
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--wine-400)' }} />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={WalletCards} label="ยอดขายรวม" value={formatCurrency(report.totalSales)} tone="#68dfcb" />
            <MetricCard icon={Receipt} label="จำนวนบิล" value={`${report.orderCount.toLocaleString('th-TH')} บิล`} tone="#38bdf8" />
            <MetricCard icon={TrendingUp} label="ยอดขายเฉลี่ยต่อบิล" value={formatCurrency(report.averageOrder)} tone="#f2c65c" />
            <MetricCard icon={BarChart3} label="กำไรขั้นต้น" value={formatCurrency(report.grossProfit)} tone="#a78bfa" />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
            <div className="glass-card p-5">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">แนวโน้มยอดขาย</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>ยอดขายที่ชำระแล้วในช่วง {range} วันล่าสุด</p>
                </div>
                <span
                  className="flex items-center gap-1 text-xs font-bold"
                  style={{ color: report.change >= 0 ? '#68dfcb' : '#fda4af' }}
                >
                  {report.change >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  {Math.abs(report.change).toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 285 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="sales-area" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2fc6b5" stopOpacity={0.34} />
                        <stop offset="100%" stopColor="#2fc6b5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#25364d" strokeDasharray="3 3" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#718198', fontSize: 11 }} minTickGap={22} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#718198', fontSize: 11 }}
                      width={68}
                      tickFormatter={value => `฿${Math.round(value / 1000)}k`}
                    />
                    <Tooltip
                      cursor={{ stroke: '#68dfcb', strokeOpacity: 0.35 }}
                      contentStyle={{ border: '1px solid #344963', borderRadius: 7, background: '#101d2d', color: '#f3f7fb', boxShadow: '0 12px 28px rgba(1,8,18,.3)' }}
                      formatter={value => [
                        formatCurrency(typeof value === 'number' || typeof value === 'string' ? Number(value) : 0),
                        'ยอดขาย',
                      ]}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#2fc6b5" strokeWidth={2} fill="url(#sales-area)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-5">
              <h2 className="text-base font-bold text-white">ช่องทางการชำระ</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>สัดส่วนตามยอดรับชำระ</p>
              <div className="mt-6 space-y-5">
                {report.paymentTotals.length === 0 ? (
                  <EmptyState label="ยังไม่มีรายการชำระเงิน" />
                ) : report.paymentTotals.map(item => {
                  const meta = PAYMENT_META[item.method]
                  const share = report.totalSales ? (item.amount / report.totalSales) * 100 : 0
                  return (
                    <div key={item.method}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="font-bold text-white">{share.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: '#0c1625' }}>
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: meta.color }} />
                      </div>
                      <p className="mt-1.5 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{formatCurrency(item.amount)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <h2 className="text-base font-bold text-white">สินค้าขายดี</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>เรียงตามยอดขาย</p>
                </div>
                <Package size={18} style={{ color: 'var(--wine-300)' }} />
              </div>
              {report.topProducts.length === 0 ? <EmptyState label="ยังไม่มีข้อมูลสินค้า" /> : (
                <div>
                  {report.topProducts.map((product, index) => (
                    <div key={product.name} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: 'var(--border-color)' }}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold" style={{ background: '#1b2c42', color: index === 0 ? 'var(--gold-400)' : 'var(--text-secondary)' }}>
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{product.name}</p>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{product.quantity.toLocaleString('th-TH')} หน่วย</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold" style={{ color: 'var(--wine-300)' }}>{formatCurrency(product.sales)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <h2 className="text-base font-bold text-white">บิลล่าสุด</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>การชำระเงินที่ยืนยันแล้ว</p>
                </div>
                <CreditCard size={18} style={{ color: 'var(--wine-300)' }} />
              </div>
              {report.recentSales.length === 0 ? <EmptyState label="ยังไม่มีรายการขาย" /> : (
                <div>
                  {report.recentSales.map(sale => {
                    const meta = PAYMENT_META[sale.payment_method]
                    return (
                      <div key={sale.id} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: 'var(--border-color)' }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">{meta.label}</p>
                          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.created_at))}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-white">{formatCurrency(numberValue(sale.total_amount))}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Bottom Tab Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-7 border-b animate-in" style={{ borderColor: 'var(--border-color)', paddingBottom: 8 }}>
            <div className="flex gap-2">
              <button
                onClick={() => setBottomTab('staff')}
                className="font-display font-bold text-sm transition-all"
                style={{
                  background: 'none', border: 'none', color: bottomTab === 'staff' ? 'white' : 'var(--text-muted)',
                  borderBottom: bottomTab === 'staff' ? '2px solid var(--wine-400)' : '2px solid transparent',
                  padding: '8px 16px 12px', cursor: 'pointer', marginBottom: -10
                }}
              >
                👥 วิเคราะห์พนักงาน (Staff)
              </button>
              <button
                onClick={() => setBottomTab('arrivals')}
                className="font-display font-bold text-sm transition-all"
                style={{
                  background: 'none', border: 'none', color: bottomTab === 'arrivals' ? 'white' : 'var(--text-muted)',
                  borderBottom: bottomTab === 'arrivals' ? '2px solid var(--wine-400)' : '2px solid transparent',
                  padding: '8px 16px 12px', cursor: 'pointer', marginBottom: -10
                }}
              >
                📦 สินค้าเข้าใหม่ (Arrivals)
              </button>
              <button
                onClick={() => setBottomTab('readiness')}
                className="font-display font-bold text-sm transition-all"
                style={{
                  background: 'none', border: 'none', color: bottomTab === 'readiness' ? 'white' : 'var(--text-muted)',
                  borderBottom: bottomTab === 'readiness' ? '2px solid var(--wine-400)' : '2px solid transparent',
                  padding: '8px 16px 12px', cursor: 'pointer', marginBottom: -10
                }}
              >
                📋 รายงานความเรียบร้อย (Readiness)
              </button>
            </div>

            {/* Inline Date Filter for Tabs */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>ตัวกรองวันที่:</span>
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-color)', background: '#0d1726' }}>
                {([7, 30, 90] as DateRange[]).map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setRange(days)}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={range === days
                      ? { background: 'var(--wine-500)', color: '#05211f', cursor: 'pointer' }
                      : { color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    {days} วัน
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setRange('custom')}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                  style={range === 'custom'
                    ? { background: 'var(--wine-500)', color: '#05211f', cursor: 'pointer' }
                    : { color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  กำหนดเอง
                </button>
              </div>
              {range === 'custom' && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} className="animate-in">
                  <input
                    type="date"
                    className="wine-input text-xs"
                    style={{ padding: '4px 8px', width: 'auto', background: '#0d1726', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>-</span>
                  <input
                    type="date"
                    className="wine-input text-xs"
                    style={{ padding: '4px 8px', width: 'auto', background: '#0d1726', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cashier & Stock Staff Reports Grid */}
          {bottomTab === 'staff' && (
            <section className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Cashier Sales Report */}
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <h2 className="text-base font-bold text-white">รายงานยอดขายตามแคชเชียร์</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>ประสิทธิภาพการขายรายบุคคลในช่วง {range === 'custom' ? `${startDate} ถึง ${endDate}` : `${range} วันล่าสุด`}</p>
                </div>
                <Receipt size={18} style={{ color: 'var(--wine-300)' }} />
              </div>
              {report.cashierReports.length === 0 ? <EmptyState label="ยังไม่มีข้อมูลแคชเชียร์" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>แคชเชียร์</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>จำนวนบิล</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ยอดขายเฉลี่ย/บิล</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ยอดขายรวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.cashierReports.map(c => (
                        <tr key={c.name}
                          onClick={() => setSelectedCashierDetail(c.name)}
                          className="cursor-pointer hover:bg-[rgba(255,255,255,0.03)]"
                          style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                          <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: 'white' }}>{c.name}</td>
                          <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', color: 'var(--text-secondary)' }}>{c.orderCount} บิล</td>
                          <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(c.avgBill)}</td>
                          <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: 'var(--gold-400)' }}>{formatCurrency(c.totalSales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Stock Staff Intake Report */}
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <h2 className="text-base font-bold text-white">รายงานการนำเข้าสต๊อกตามเจ้าหน้าที่</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>การทำรายการรับสินค้าเข้าในช่วง {range === 'custom' ? `${startDate} ถึง ${endDate}` : `${range} วันล่าสุด`}</p>
                </div>
                <Package size={18} style={{ color: 'var(--wine-300)' }} />
              </div>
              {report.stockStaffReports.length === 0 ? <EmptyState label="ยังไม่มีข้อมูลการรับเข้าสต๊อก" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>เจ้าหน้าที่สต๊อก</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>จำนวนครั้งที่รับเข้า</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>มูลค่าสินค้ารวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.stockStaffReports.map(s => (
                        <tr key={s.name}
                          onClick={() => setSelectedStockStaffDetail(s.name)}
                          className="cursor-pointer hover:bg-[rgba(255,255,255,0.03)]"
                          style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                          <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: 'white' }}>{s.name}</td>
                          <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', color: 'var(--text-secondary)' }}>{s.receiptCount} ครั้ง</td>
                          <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: 'var(--wine-300)' }}>{formatCurrency(s.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
          )}

          {bottomTab === 'arrivals' && (
            <div className="glass-card overflow-hidden mt-5 animate-in">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <h2 className="text-base font-bold text-white">รายงานสินค้าเข้าใหม่ (คีย์โดยพนักงานคลังสินค้า)</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>ข้อมูลสินค้าใหม่ที่คีย์นำเข้าในช่วง {range === 'custom' ? `${startDate} ถึง ${endDate}` : `${range} วันล่าสุด`}</p>
                </div>
                <Package size={18} style={{ color: 'var(--wine-300)' }} />
              </div>
              {newArrivals.length === 0 ? <EmptyState label="ไม่มีประวัติการนำเข้าสินค้าในช่วงเวลานี้" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>สินค้า</th>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>SKU</th>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>เลขใบรับของ / ซัพพลายเออร์</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>จำนวนรับเข้า</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ราคาทุนต่อหน่วย</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>มูลค่าทุนรวม</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ผู้รับสินค้า / วันที่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newArrivals.map(item => {
                        const prod = item.products || {}
                        const receipt = item.stock_receipts || {}
                        const staffName = receipt.profiles?.full_name || 'ไม่ระบุพนักงาน'
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: 'white' }}>{prod.name || 'ไม่ทราบชื่อ'}</td>
                            <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--text-secondary)' }}>{prod.sku || '—'}</td>
                            <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--text-secondary)' }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 600, color: '#f3f7fb' }}>{receipt.receipt_no || 'ไม่ระบุ'}</p>
                                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{receipt.supplier_name || '—'}</p>
                              </div>
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: '#4ade80' }}>
                              {item.quantity.toLocaleString('th-TH')} ชิ้น
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', color: 'var(--text-secondary)' }}>
                              {formatCurrency(item.cost)}
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: 'var(--wine-300)' }}>
                              {formatCurrency(item.quantity * item.cost)}
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', color: 'var(--text-secondary)' }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 600, color: '#f3f7fb' }}>{staffName}</p>
                                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                                  {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at))}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {bottomTab === 'readiness' && (
            <div className="glass-card overflow-hidden mt-5 animate-in">
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
                <div>
                  <h2 className="text-base font-bold text-white">รายงานความเรียบร้อยหน้าร้าน</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>รายงานสถานะและการจัดเตรียมความเรียบร้อยของร้านในช่วง {range === 'custom' ? `${startDate} ถึง ${endDate}` : `${range} วันล่าสุด`}</p>
                </div>
                <Receipt size={18} style={{ color: 'var(--wine-300)' }} />
              </div>
              {shopReports.length === 0 ? <EmptyState label="ไม่มีข้อมูลการส่งรายงานความเรียบร้อยในช่วงเวลานี้" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>หัวข้อรายงาน</th>
                        <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>รายละเอียด / บันทึกเพิ่มเติม</th>
                        <th style={{ padding: '12px 18px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>รูปภาพ</th>
                        <th style={{ padding: '12px 18px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>สถานะ</th>
                        <th style={{ padding: '12px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ผู้รายงาน / วันเวลา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopReports.map(reportItem => {
                        const reporter = reportItem.profiles?.full_name || 'ไม่ระบุชื่อ'
                        const imageCount = reportItem.images ? reportItem.images.length : 0
                        return (
                          <tr key={reportItem.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 700, color: 'white' }}>{reportItem.title}</td>
                            <td style={{ padding: '12px 18px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 280 }}>
                              {reportItem.note || '—'}
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'center' }}>
                              {imageCount > 0 ? (
                                <button
                                  onClick={() => setSelectedShopReportImage(reportItem.images)}
                                  className="text-xs px-2.5 py-1.5 rounded-lg font-bold hover:brightness-110 cursor-pointer"
                                  style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold-400)', border: '1px solid rgba(212,175,55,0.3)' }}
                                >
                                  📷 ดูรูปภาพ ({imageCount})
                                </button>
                              ) : (
                                <span className="text-xs text-muted" style={{ color: 'var(--text-muted)' }}>ไม่มีรูป</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'center' }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                color: reportItem.status === 'acknowledged' ? '#4ade80' : '#f59e0b',
                                background: reportItem.status === 'acknowledged' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                                border: reportItem.status === 'acknowledged' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(245,158,11,0.3)',
                                padding: '2px 8px', borderRadius: 100
                              }}>
                                {reportItem.status === 'acknowledged' ? 'รับทราบแล้ว' : 'รอดำเนินการ'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 18px', fontSize: 13, textAlign: 'right', color: 'var(--text-secondary)' }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 600, color: '#f3f7fb' }}>{reporter}</p>
                                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                                  {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(reportItem.created_at))}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Shop Report Image Modal */}
          {selectedShopReportImage && (
            <div className="fixed inset-0 flex items-center justify-center z-50"
              style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', padding: 16 }}>
              <div className="relative w-full max-w-4xl" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => setSelectedShopReportImage(null)}
                  className="absolute -top-12 right-0 p-2 text-white bg-white/10 hover:bg-white/20 rounded-full cursor-pointer transition-colors"
                  style={{ border: 'none', background: 'rgba(255,255,255,0.1)' }}
                >
                  <X size={20} />
                </button>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
                  {selectedShopReportImage.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`Report image ${idx + 1}`}
                      style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 12, objectFit: 'contain', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cashier Detail Modal */}
      {selectedCashierDetail && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="glass-card w-full" style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <h3 className="text-base font-bold text-white">ประวัติบิล: {selectedCashierDetail}</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>รายการขายที่แคชเชียร์คนนี้ทำรายการในช่วง {range} วันล่าสุด</p>
              </div>
              <button onClick={() => setSelectedCashierDetail(null)}>
                <X size={20} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {sales.filter(sale => {
                let cashierName = 'ไม่ระบุแคชเชียร์'
                if (sale.profiles) {
                   if (Array.isArray(sale.profiles)) {
                     if (sale.profiles.length > 0) cashierName = sale.profiles[0].full_name
                   } else {
                     cashierName = (sale.profiles as any).full_name
                   }
                }
                return cashierName === selectedCashierDetail
              }).length === 0 ? <EmptyState label="ไม่มีบิลประวัติในช่วงเวลานี้" /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>เลขที่บิล</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>วัน/เวลา</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ช่องทาง</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ยอดเงิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.filter(sale => {
                      let cashierName = 'ไม่ระบุแคชเชียร์'
                      if (sale.profiles) {
                        if (Array.isArray(sale.profiles)) {
                          if (sale.profiles.length > 0) cashierName = sale.profiles[0].full_name
                        } else {
                          cashierName = (sale.profiles as any).full_name
                        }
                      }
                      return cashierName === selectedCashierDetail
                    }).map(sale => {
                      const meta = PAYMENT_META[sale.payment_method]
                      return (
                        <tr key={sale.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'white' }}>{sale.receipt_no}</td>
                          <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                            {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(sale.created_at))}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'center' }}>
                            <span style={{ fontSize: 11, color: meta?.color, background: `${meta?.color}11`, border: `1px solid ${meta?.color}33`, padding: '2px 8px', borderRadius: 100 }}>
                              {meta?.label || sale.payment_method}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: 'var(--gold-400)' }}>
                            {formatCurrency(sale.total_amount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button onClick={() => setSelectedCashierDetail(null)} className="w-full btn-wine py-2.5 rounded-lg text-sm font-bold">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Staff Detail Modal */}
      {selectedStockStaffDetail && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="glass-card w-full" style={{ maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <h3 className="text-base font-bold text-white">ประวัติรับของเข้า: {selectedStockStaffDetail}</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>รายการรับสินค้าเข้าสต๊อกที่ทำรายการในช่วง {range} วันล่าสุด</p>
              </div>
              <button onClick={() => setSelectedStockStaffDetail(null)}>
                <X size={20} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {receipts.filter(receipt => {
                let staffName = 'ไม่ระบุพนักงาน'
                if (receipt.profiles) {
                  if (Array.isArray(receipt.profiles)) {
                    if (receipt.profiles.length > 0) staffName = receipt.profiles[0].full_name
                  } else {
                    staffName = (receipt.profiles as any).full_name
                  }
                }
                return staffName === selectedStockStaffDetail
              }).length === 0 ? <EmptyState label="ไม่มีรายการรับสินค้าในช่วงเวลานี้" /> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>เลขใบรับสินค้า</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>วัน/เวลา</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ผู้ผลิต/ซัพพลายเออร์</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>ราคาทุนรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.filter(receipt => {
                      let staffName = 'ไม่ระบุพนักงาน'
                      if (receipt.profiles) {
                        if (Array.isArray(receipt.profiles)) {
                          if (receipt.profiles.length > 0) staffName = receipt.profiles[0].full_name
                        } else {
                          staffName = (receipt.profiles as any).full_name
                        }
                      }
                      return staffName === selectedStockStaffDetail
                    }).map(receipt => (
                      <tr key={receipt.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'white' }}>{receipt.receipt_no || 'ไม่ระบุ'}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(receipt.created_at))}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {receipt.supplier_name || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: 'var(--wine-300)' }}>
                          {formatCurrency(receipt.total_cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button onClick={() => setSelectedStockStaffDetail(null)} className="w-full btn-wine py-2.5 rounded-lg text-sm font-bold">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof WalletCards
  label: string
  value: string
  tone: string
}) {
  return (
    <article className="glass-card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${tone}18`, color: tone }}>
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-5 text-xl font-bold tracking-normal text-white">{value}</p>
    </article>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div className="flex min-h-40 items-center justify-center px-5 text-sm" style={{ color: 'var(--text-muted)' }}>{label}</div>
}
