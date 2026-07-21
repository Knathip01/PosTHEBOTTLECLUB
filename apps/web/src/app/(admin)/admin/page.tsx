'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import {
  TrendingUp, ShoppingBag, Users, Package,
  AlertTriangle, Wine, ArrowUpRight, ArrowDownRight, Loader2, Clock, Receipt,
  ChevronRight, Flame, RefreshCw
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, Area, AreaChart, Tooltip, YAxis, XAxis
} from 'recharts'

interface DashboardStats {
  todaySales: number
  todayOrders: number
  totalCustomers: number
  lowStockCount: number
  monthSales: number
  monthOrders: number
  pendingOrders: number
}

const generateSparkline = (base: number, points: number, seed: number) => {
  const arr = []
  let val = base
  for (let i = 0; i < points; i++) {
    const change = (Math.sin(i + seed) * 0.4 + (Math.random() - 0.5) * 0.6) * (base * 0.05)
    val = Math.max(base * 0.5, val + change)
    arr.push({ value: val })
  }
  return arr
}

export default function AdminDashboard() {
  const supabase = createClient()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<{ date: string; sales: number; orders: number }[]>([])
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([])
  const [lowStockProducts, setLowStockProducts] = useState<{ id: string; name: string; stock: number; min_stock: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [staffUsers, setStaffUsers] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'stock' | 'staff'>('overview')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      const sevenDaysAgoISO = sevenDaysAgo.toISOString()

      const [todaySalesRes, monthSalesRes, customersRes, lowStockRes, saleItemsRes, pendingRes, salesLast7DaysRes] = await Promise.all([
        supabase.from('sales').select('total_amount').eq('status', 'paid').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
        supabase.from('sales').select('total_amount').eq('status', 'paid').gte('created_at', monthStart),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id, name, stock, min_stock').eq('is_active', true),
        supabase.from('sale_items').select('product_name, quantity, line_total').limit(200),
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('sales').select('total_amount, created_at').in('status', ['paid', 'pending']).gte('created_at', sevenDaysAgoISO)
      ])

      const errors = [
        todaySalesRes.error, monthSalesRes.error, customersRes.error,
        lowStockRes.error, saleItemsRes.error, pendingRes.error, salesLast7DaysRes.error
      ].filter(Boolean)
      if (errors.length > 0) throw new Error(errors.map(e => e!.message).join(' | '))

      const todaySales = (todaySalesRes.data || []).reduce((s, r) => s + r.total_amount, 0)
      const todayOrders = (todaySalesRes.data || []).length
      const monthSales = (monthSalesRes.data || []).reduce((s, r) => s + r.total_amount, 0)
      const monthOrders = (monthSalesRes.data || []).length
      const allActiveProducts = lowStockRes.data || []
      const lowStockList = allActiveProducts.filter(p => p.stock <= p.min_stock)

      setStats({ todaySales, todayOrders, totalCustomers: customersRes.count || 0, lowStockCount: lowStockList.length, monthSales, monthOrders, pendingOrders: pendingRes.count || 0 })
      setLowStockProducts(lowStockList.slice(0, 5))

      const productMap = new Map<string, { qty: number; revenue: number }>()
      for (const item of saleItemsRes.data || []) {
        const existing = productMap.get(item.product_name) || { qty: 0, revenue: 0 }
        productMap.set(item.product_name, { qty: existing.qty + item.quantity, revenue: existing.revenue + item.line_total })
      }
      const top = Array.from(productMap.entries())
        .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      setTopProducts(top)

      const salesData = salesLast7DaysRes.data || []
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        const daySales = salesData.filter(s => s.created_at.slice(0, 10) === dateStr)
        days.push({ date: formatDateShort(d.toISOString()), sales: daySales.reduce((sum, s) => sum + s.total_amount, 0), orders: daySales.length })
      }
      setChartData(days)

      const { data: staffData } = await supabase.from('profiles').select('*').order('role', { ascending: true })
      setStaffUsers(staffData || [])
    } catch (err: any) {
      console.error('Error loading dashboard:', err)
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', background: '#080d14' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: '#b02238', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 14 }}>กำลังโหลดข้อมูลแดชบอร์ด...</p>
        </div>
      </div>
    )
  }

  const kpiCards = [
    {
      title: 'ยอดขายวันนี้',
      value: formatCurrency(stats?.todaySales || 0),
      sub: `${stats?.todayOrders || 0} ออเดอร์`,
      trend: 12.5,
      color: '#34d399',
      bg: 'rgba(52,211,153,0.08)',
      border: 'rgba(52,211,153,0.2)',
      icon: <TrendingUp size={18} />,
      spark: generateSparkline(stats?.todaySales || 15000, 10, 1),
      href: undefined
    },
    {
      title: 'ยอดขายเดือนนี้',
      value: formatCurrency(stats?.monthSales || 0),
      sub: `${stats?.monthOrders || 0} บิล`,
      trend: 8.3,
      color: '#60a5fa',
      bg: 'rgba(96,165,250,0.08)',
      border: 'rgba(96,165,250,0.2)',
      icon: <Receipt size={18} />,
      spark: generateSparkline(stats?.monthSales || 450000, 10, 5),
      href: '/admin/reports'
    },
    {
      title: 'ลูกค้าทั้งหมด',
      value: `${stats?.totalCustomers || 0} คน`,
      sub: 'สมาชิกสะสม',
      trend: 5.1,
      color: '#c084fc',
      bg: 'rgba(192,132,252,0.08)',
      border: 'rgba(192,132,252,0.2)',
      icon: <Users size={18} />,
      spark: generateSparkline(stats?.totalCustomers || 100, 10, 9),
      href: undefined
    },
    {
      title: 'บิลค้างชำระ',
      value: `${stats?.pendingOrders || 0} บิล`,
      sub: 'รอชำระเงิน',
      trend: stats?.pendingOrders ? 5.0 : 0,
      color: stats?.pendingOrders ? '#fbbf24' : '#34d399',
      bg: stats?.pendingOrders ? 'rgba(251,191,36,0.08)' : 'rgba(52,211,153,0.08)',
      border: stats?.pendingOrders ? 'rgba(251,191,36,0.2)' : 'rgba(52,211,153,0.2)',
      icon: <AlertTriangle size={18} />,
      spark: generateSparkline(stats?.pendingOrders || 2, 10, 15),
      href: '/admin/billing'
    },
  ]

  return (
    <div style={{ background: '#080d14', minHeight: '100vh', color: '#f3f7fb' }}>
      <style>{`
        .dash-card {
          background: rgba(13,20,30,0.85);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .dash-card:hover {
          border-color: rgba(255,255,255,0.12);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .kpi-card {
          background: rgba(13,20,30,0.9);
          border-radius: 14px;
          padding: 16px;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: default;
        }
        .kpi-card:active {
          transform: scale(0.98);
        }
        .tab-btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #6b7280;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .tab-btn.active {
          background: rgba(255,255,255,0.08);
          color: #f3f7fb;
        }
        .product-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          transition: background 0.15s;
        }
        .product-row:hover {
          background: rgba(255,255,255,0.03);
        }
        .stock-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @media (max-width: 640px) {
          .dash-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-grid-2 { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(12px, 3vw, 24px)' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(18px, 4vw, 26px)', fontWeight: 800, color: '#fff', margin: 0 }}>
              📊 แดชบอร์ด
            </h1>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0' }}>
              {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={loadDashboard}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: '#9ca3af', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >
            <RefreshCw size={14} />
            <span className="hide-mobile">รีเฟรช</span>
          </button>
        </div>

        {/* ── Error ── */}
        {errorMsg && (
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', marginBottom: 16, fontSize: 13 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="dash-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {kpiCards.map((card, i) => {
            const inner = (
              <div key={i} className="kpi-card" style={{ border: `1px solid ${card.border}`, background: card.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: card.bg, border: `1px solid ${card.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color }}>
                    {card.icon}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: card.trend >= 0 ? '#34d399' : '#f43f5e',
                    background: card.trend >= 0 ? 'rgba(52,211,153,0.1)' : 'rgba(244,63,94,0.1)',
                    padding: '2px 7px', borderRadius: 999
                  }}>
                    {card.trend >= 0 ? `+${card.trend}%` : `${card.trend}%`}
                  </span>
                </div>
                <p style={{ fontSize: 'clamp(16px, 3vw, 22px)', fontWeight: 800, color: '#fff', margin: '0 0 2px' }}>
                  {card.value}
                </p>
                <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{card.title}</p>
                <div style={{ height: 28, marginTop: 10 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={card.spark}>
                      <Line type="monotone" dataKey="value" stroke={card.color} strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
            return card.href
              ? <Link key={i} href={card.href} style={{ textDecoration: 'none' }}>{inner}</Link>
              : inner
          })}
        </div>

        {/* ── Main Content Grid ── */}
        <div className="dash-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 16 }}>

          {/* ── Chart Card ── */}
          <div className="dash-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, margin: 0 }}>ยอดขาย 7 วันล่าสุด</p>
                <h3 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 800, color: '#fff', margin: '4px 0 0' }}>
                  {formatCurrency(stats?.monthSales || 0)}
                  <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600, marginLeft: 8 }}>+12.5% MTD</span>
                </h3>
              </div>
              <span style={{ fontSize: 11, color: '#6b7280', background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                เรียลไทม์
              </span>
            </div>

            {/* Category Bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#9ca3af', marginBottom: 6, flexWrap: 'wrap' }}>
                {[['#b02238', 'Red Wine', '65%'], ['#06b6d4', 'White Wine', '25%'], ['#a78bfa', 'Sparkling', '10%']].map(([c, l, p]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    {l} ({p})
                  </div>
                ))}
              </div>
              <div style={{ width: '100%', height: 10, borderRadius: 999, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ width: '65%', background: 'linear-gradient(90deg,#b02238,#d4af37)' }} />
                <div style={{ width: '25%', background: 'linear-gradient(90deg,#06b6d4,#3b82f6)' }} />
                <div style={{ width: '10%', background: 'linear-gradient(90deg,#a78bfa,#8b5cf6)' }} />
              </div>
            </div>

            {/* Area Chart */}
            <div style={{ height: 'clamp(140px, 20vw, 180px)' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="wineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b02238" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#b02238" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: '#0d141e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                    formatter={(v) => [formatCurrency(Number(v)), 'ยอดขาย']}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#b02238" fill="url(#wineGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Right Panel ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Quick Links */}
            <div className="dash-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', margin: '0 0 10px', letterSpacing: '0.05em' }}>เมนูด่วน</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'สินค้า', icon: '📦', href: '/admin/products' },
                  { label: 'สต็อก', icon: '🏭', href: '/admin/inventory' },
                  { label: 'รายงาน', icon: '📈', href: '/admin/reports' },
                  { label: 'รับชำระ', icon: '💳', href: '/admin/billing' },
                  { label: 'ผู้ใช้', icon: '👥', href: '/admin/users' },
                  { label: 'ตั้งค่า', icon: '⚙️', href: '/admin/settings' },
                ].map(item => (
                  <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 4, padding: '10px 4px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                    >
                      <span style={{ fontSize: 20 }}>{item.icon}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{item.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Category Progress */}
            <div className="dash-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', margin: '0 0 12px', letterSpacing: '0.05em' }}>สัดส่วนหมวดหมู่</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Red Wine (ไวน์แดง)', pct: 65, color: '#b02238' },
                  { label: 'White Wine (ไวน์ขาว)', pct: 25, color: '#06b6d4' },
                  { label: 'Sparkling (สปาร์คกลิ้ง)', pct: 10, color: '#a78bfa' },
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                      <span>{item.label}</span>
                      <span style={{ fontWeight: 700, color: '#f3f7fb' }}>{item.pct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 999, boxShadow: `0 0 8px ${item.color}` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Bottom Section with Tabs on Mobile ── */}
        {/* Tab Switcher - mobile only */}
        <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 14 }} className="sm:hidden">
          {([['overview', '🏆 สินค้าขายดี'], ['stock', '⚠️ สต็อกต่ำ'], ['staff', '👥 พนักงาน']] as const).map(([tab, label]) => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {label}
            </button>
          ))}
        </div>

        <div className="dash-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>

          {/* ── Top Products ── */}
          <div
            className="dash-card"
            style={{
              padding: 18,
              display: activeTab === 'overview' || typeof window !== 'undefined' && window.innerWidth >= 640 ? 'block' : 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>🏆 สินค้าขายดีสุด</h4>
              <span style={{ fontSize: 11, color: '#d4af37', fontWeight: 600 }}>Top 5</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
                  <Wine size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <p style={{ fontSize: 12, margin: 0 }}>ยังไม่มีข้อมูลการขาย</p>
                </div>
              ) : (
                topProducts.map((p, idx) => {
                  const icons = ['🍷', '🥂', '🍾', '🍇', '🍹']
                  return (
                    <div key={idx} className="product-row">
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', width: 14, flexShrink: 0 }}>#{idx + 1}</span>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[idx % icons.length]}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </p>
                        <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>ขายแล้ว {p.qty} ขวด</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#f3f7fb', margin: 0 }}>{formatCurrency(p.revenue)}</p>
                        <p style={{ fontSize: 11, color: '#34d399', margin: 0 }}>+{(12 - idx).toFixed(1)}%</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── Low Stock ── */}
          <div className="dash-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>⚠️ สต็อกต่ำ</h4>
              <Link href="/admin/inventory" style={{ fontSize: 11, color: '#b02238', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                ดูทั้งหมด <ChevronRight size={12} />
              </Link>
            </div>
            {lowStockProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
                <Package size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 12, margin: 0 }}>สต็อกปกติทุกรายการ ✓</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lowStockProducts.map((p) => {
                  const pct = Math.round((p.stock / Math.max(p.min_stock, 1)) * 100)
                  const isOut = p.stock === 0
                  return (
                    <div key={p.id} style={{ padding: '10px 12px', borderRadius: 10, background: isOut ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.05)', border: `1px solid ${isOut ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#f3f7fb', margin: 0, flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </p>
                        <span className="stock-chip" style={{ background: isOut ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.1)', color: isOut ? '#f87171' : '#fbbf24', flexShrink: 0 }}>
                          {isOut ? '🔴 หมด' : `🟡 ${p.stock}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 999 }}>
                          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: isOut ? '#f87171' : '#fbbf24', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>min {p.min_stock}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Staff Status ── */}
          <div className="dash-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>👥 สถานะพนักงาน</h4>
              <Link href="/admin/users" style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                จัดการ <ChevronRight size={12} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {staffUsers.filter(u => u.role !== 'super_admin').length === 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '20px 0', margin: 0 }}>ไม่มีพนักงานในระบบ</p>
              ) : (
                staffUsers.filter(u => u.role !== 'super_admin').map(u => {
                  const isOnline = u.is_active && (new Date().getTime() - new Date(u.updated_at).getTime() < 45000)
                  const roleIcons: Record<string, string> = { manager: '🏢', cashier: '💰', stock_staff: '📦', kitchen: '🍳', bar: '🍸' }
                  const roleLabels: Record<string, string> = { manager: 'Manager', cashier: 'Cashier', stock_staff: 'Stock Staff', kitchen: 'Kitchen', bar: 'Bar' }
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                        {roleIcons[u.role] || '👤'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#f3f7fb', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.full_name}
                        </p>
                        <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>{roleLabels[u.role] || u.role}</p>
                      </div>
                      {!u.is_active ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                          ระงับ
                        </span>
                      ) : isOnline ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#4ade80', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80', flexShrink: 0 }} />
                          ออนไลน์
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563', flexShrink: 0 }} />
                          ออฟไลน์
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
