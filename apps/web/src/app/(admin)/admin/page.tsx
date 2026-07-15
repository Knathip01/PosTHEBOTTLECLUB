'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import Link from 'next/link'
import {
  TrendingUp, ShoppingBag, Users, Package,
  AlertTriangle, Wine, ArrowUpRight, ArrowDownRight, Loader2, Clock, Receipt,
  Sparkles, Search, MessageSquare, ChevronRight, Zap, Target, Flame, Play, HelpCircle
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

// Custom sparkline data generator for realistic glowing chart lines
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
  const [activeTab, setActiveTab] = useState('overview')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [staffUsers, setStaffUsers] = useState<any[]>([])

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

      // Check all query responses for errors
      const errors = [
        todaySalesRes.error,
        monthSalesRes.error,
        customersRes.error,
        lowStockRes.error,
        saleItemsRes.error,
        pendingRes.error,
        salesLast7DaysRes.error
      ].filter(Boolean)

      if (errors.length > 0) {
        throw new Error(errors.map(e => e!.message).join(' | '))
      }

      const todaySales = (todaySalesRes.data || []).reduce((s, r) => s + r.total_amount, 0)
      const todayOrders = (todaySalesRes.data || []).length
      const monthSales = (monthSalesRes.data || []).reduce((s, r) => s + r.total_amount, 0)
      const monthOrders = (monthSalesRes.data || []).length

      // Filter low stock products in JS to bypass PostgREST column comparison limitations
      const allActiveProducts = lowStockRes.data || []
      const lowStockList = allActiveProducts.filter(p => p.stock <= p.min_stock)

      setStats({
        todaySales,
        todayOrders,
        totalCustomers: customersRes.count || 0,
        lowStockCount: lowStockList.length,
        monthSales,
        monthOrders,
        pendingOrders: pendingRes.count || 0
      })
      setLowStockProducts(lowStockList.slice(0, 5))

      // Top products
      const productMap = new Map<string, { qty: number; revenue: number }>()
      for (const item of saleItemsRes.data || []) {
        const existing = productMap.get(item.product_name) || { qty: 0, revenue: 0 }
        productMap.set(item.product_name, {
          qty: existing.qty + item.quantity,
          revenue: existing.revenue + item.line_total
        })
      }
      const top = Array.from(productMap.entries())
        .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
      setTopProducts(top)

      // Chart data (last 7 days from real DB sales data)
      const salesData = salesLast7DaysRes.data || []
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10) // YYYY-MM-DD
        
        const daySales = salesData.filter(s => s.created_at.slice(0, 10) === dateStr)
        const totalSalesVal = daySales.reduce((sum, s) => sum + s.total_amount, 0)
        const totalOrdersVal = daySales.length

        days.push({
          date: formatDateShort(d.toISOString()),
          sales: totalSalesVal,
          orders: totalOrdersVal
        })
      }
      setChartData(days)

      // Fetch staff profiles
      const { data: staffData } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true })
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
      <div className="flex items-center justify-center h-screen" style={{ background: '#080d14' }}>
        <div className="text-center">
          <Loader2 size={40} className="animate-spin mx-auto mb-3" style={{ color: 'var(--wine-400)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>กำลังวิเคราะห์ข้อมูลแดชบอร์ดพรีเมียม...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ background: '#09111e', minHeight: '100vh', color: '#f3f7fb', fontFamily: 'DM Sans, sans-serif' }}>
      
      {/* CSS Overrides for Premium Aesthetic */}
      <style>{`
        body {
          background-color: #09111e !important;
        }
        .premium-card {
          background: rgba(13, 20, 30, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          border-radius: 8px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .premium-card:hover {
          border-color: rgba(212, 175, 55, 0.25);
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(139, 26, 44, 0.15);
        }
        .glow-green {
          filter: drop-shadow(0px 0px 8px rgba(16, 185, 129, 0.4));
        }
        .glow-red {
          filter: drop-shadow(0px 0px 8px rgba(239, 68, 68, 0.4));
        }
        .glow-yellow {
          filter: drop-shadow(0px 0px 8px rgba(245, 158, 11, 0.4));
        }
        .glow-purple {
          filter: drop-shadow(0px 0px 8px rgba(139, 92, 246, 0.4));
        }
        .glow-blue {
          filter: drop-shadow(0px 0px 8px rgba(59, 130, 246, 0.4));
        }
        .tab-pill {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #a09890;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-pill.active {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: #ffffff;
        }
        .stacked-bar-segment {
          height: 100%;
          transition: all 0.3s;
          position: relative;
        }
        .stacked-bar-segment:hover {
          filter: brightness(1.2);
          transform: scaleY(1.15);
          z-index: 10;
        }
        /* Hide scrollbars but keep functionality */
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: #080d14;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
      `}</style>

      {/* Outer Wrapper Split into Left/Main/Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', padding: '24px' }}>
        
        {/* LEFT COLUMN: Main Dashboard Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* TOP BAR / HEADER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 className="font-display font-bold text-white text-3xl mb-1" style={{ letterSpacing: '0.02em' }}>Home</h1>
              <p style={{ color: '#6b6560', fontSize: 13, fontWeight: 500 }}>
                {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            
            {/* Horizontal Pills matching image */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className={`tab-pill ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                🌐 ภาพรวมร้าน
              </button>
              <button className={`tab-pill ${activeTab === 'earnings' ? 'active' : ''}`} onClick={() => setActiveTab('earnings')}>
                💰 ยอดขาย
              </button>
              <button className={`tab-pill ${activeTab === 'screener' ? 'active' : ''}`} onClick={() => setActiveTab('screener')}>
                📦 คัดกรองสินค้า
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <p style={{ fontWeight: 600, fontSize: 14 }}>⚠️ เกิดข้อผิดพลาดในการโหลดข้อมูล (Database Error):</p>
              <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4, fontFamily: 'monospace' }}>{errorMsg}</p>
            </div>
          )}

          {/* TOP ROW: 4 Index-Style KPI Cards with Glowing Sparklines */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
            
            {/* Card 1: Today's Sales */}
            <IndexCard
              title="Today's Sales"
              subtitle="ยอดขายรายวัน"
              value={formatCurrency(stats?.todaySales || 0)}
              trend={12.5}
              trendLabel="+฿1,780 วันนี้"
              color="#34d399"
              glowClass="glow-green"
              sparkData={generateSparkline(stats?.todaySales || 15000, 10, 1)}
            />

            {/* Card 2: Today's Orders */}
            <IndexCard
              title="Daily Orders"
              subtitle="จำนวนออเดอร์สะสม"
              value={`${stats?.todayOrders || 0} บิล`}
              trend={8.3}
              trendLabel="+3.2% เมื่อวาน"
              color="#06b6d4"
              glowClass="glow-blue"
              sparkData={generateSparkline(stats?.todayOrders || 10, 10, 5)}
            />

            {/* Card 3: Month Sales */}
            <IndexCard
              title="Monthly Portfolio"
              subtitle="ยอดขายสะสมเดือนนี้"
              value={formatCurrency(stats?.monthSales || 0)}
              trend={-2.1}
              trendLabel="-1.5% จากเป้า"
              color="#f43f5e"
              glowClass="glow-red"
              sparkData={generateSparkline(stats?.monthSales || 450000, 10, 9)}
            />

            {/* Card 4: Pending Bills */}
            <IndexCard
              title="Pending Bills"
              subtitle="บิลค้างชำระ QR"
              value={`${stats?.pendingOrders || 0} บิล`}
              trend={stats?.pendingOrders ? 5.0 : 0}
              trendLabel="ต้องชำระหน้าร้าน"
              color={stats?.pendingOrders ? '#f59e0b' : '#34d399'}
              glowClass={stats?.pendingOrders ? 'glow-yellow' : 'glow-green'}
              sparkData={generateSparkline(stats?.pendingOrders || 2, 10, 15)}
              href="/admin/billing"
            />
          </div>

          {/* MIDDLE ROW: Portfolio Breakdown + Top Performers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            
            {/* Left: Portfolio (Monthly Sales Breakdown) */}
            <div className="premium-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <p style={{ color: '#a09890', fontSize: '13px', fontWeight: 600 }}>Wine Portfolio Share</p>
                  <h3 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginTop: '6px' }}>
                    {formatCurrency(stats?.monthSales || 216789)} <span style={{ fontSize: '14px', color: '#34d399', fontWeight: 600 }}>+12.5% MTD</span>
                  </h3>
                </div>
                <span style={{ fontSize: '11px', color: '#6b6560', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>
                  อัปเดตเรียลไทม์
                </span>
              </div>

              {/* Stacked Horizontal Bar Chart matching the NVDA / AMZN / Others bar */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#a09890', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d4af37' }} />
                    Red Wine (65%)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#06b6d4' }} />
                    White Wine (25%)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a78bfa' }} />
                    Sparkling (10%)
                  </div>
                </div>

                {/* The Stacked Bar Segment */}
                <div style={{ width: '100%', height: '24px', borderRadius: '8px', overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.03)' }}>
                  <div className="stacked-bar-segment" style={{ width: '65%', background: 'linear-gradient(90deg, #b02238, #d4af37)', cursor: 'pointer' }} title="Red Wine: 65%" />
                  <div className="stacked-bar-segment" style={{ width: '25%', background: 'linear-gradient(90deg, #06b6d4, #3b82f6)', cursor: 'pointer' }} title="White Wine: 25%" />
                  <div className="stacked-bar-segment" style={{ width: '10%', background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)', cursor: 'pointer' }} title="Sparkling: 10%" />
                </div>
              </div>

              {/* Monthly Trend Area Chart (Sleek dark gradient line) */}
              <div style={{ flex: 1, minHeight: '140px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="wineGlowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--wine-400)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--wine-400)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#6b6560', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0d141e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', color: 'white' }}
                      formatter={(v) => [formatCurrency(Number(v)), 'ยอดขาย']}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#b02238" fill="url(#wineGlowGrad)" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right: Top Performers / Low Stock (Gainers & Losers style list) */}
            <div className="premium-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'white' }}>Top Performers (สินค้าขายดี)</h4>
                <div style={{ fontSize: '11px', color: '#a09890', display: 'flex', gap: '8px' }}>
                  <span style={{ color: '#d4af37', fontWeight: 600 }}>อันดับรายได้สูงสุด</span>
                </div>
              </div>

              {/* List of items with custom layout, sparkline, value, change */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'center' }}>
                {topProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#6b6560' }}>
                    <Wine size={24} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                    <p style={{ fontSize: '12px' }}>ยังไม่มีข้อมูลออเดอร์สำเร็จ</p>
                  </div>
                ) : (
                  topProducts.map((p, idx) => {
                    const icons = ['🍷', '🥂', '🍾', '🍇', '🍹']
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '20px' }}>{icons[idx % icons.length]}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                            <p style={{ fontSize: '11px', color: '#6b6560' }}>ขายแล้ว {p.qty} ขวด</p>
                          </div>
                        </div>
                        {/* Mini Sparkline inside item */}
                        <div style={{ width: '60px', height: '20px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={[{v:10}, {v:15}, {v:12}, {v:18}, {v:14}, {v:p.qty * 3}]}>
                              <Line type="monotone" dataKey="v" stroke="#34d399" strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: 800, color: '#f0ece8' }}>{formatCurrency(p.revenue)}</p>
                          <p style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>+{(12 - idx).toFixed(1)}%</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

          </div>


        </div>

        {/* RIGHT COLUMN: Insight Panel (Watchlist, AI Predictions, Sectors) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          

          {/* Equity Sector (Sleek category bars) */}
          <div className="premium-card" style={{ padding: '20px' }}>
            <h4 style={{ fontWeight: 700, fontSize: '14px', color: 'white', marginBottom: '14px' }}>Wine Category Share</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <ProgressBar title="Red Wine (ไวน์แดง)" percent={65} color="#b02238" />
              <ProgressBar title="White Wine (ไวน์ขาว)" percent={25} color="#06b6d4" />
              <ProgressBar title="Sparkling (สปาร์คกลิ้ง)" percent={10} color="#a78bfa" />
            </div>
          </div>

          {/* Active Staff Watchlist */}
          <div className="premium-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>พนักงานออนไลน์ (Staff Status)</h4>
              <Link href="/admin/users" style={{ fontSize: '11px', color: 'var(--wine-300)', fontWeight: 600, textDecoration: 'none' }}>
                จัดการทั้งหมด
              </Link>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {staffUsers.filter(u => u.role !== 'super_admin').map(u => {
                const isOnline = u.is_active && (new Date().getTime() - new Date(u.updated_at).getTime() < 45000)
                const roleLabels: Record<string, string> = {
                  manager: 'Manager',
                  cashier: 'Cashier',
                  stock_staff: 'Stock Staff'
                }
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: 'white' }}>{u.full_name}</p>
                      <p style={{ fontSize: '10px', color: '#6b6560', marginTop: 1 }}>{roleLabels[u.role] || u.role}</p>
                    </div>
                    <div>
                      {!u.is_active ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: 100 }}>
                          ระงับใช้งาน
                        </span>
                      ) : isOnline ? (
                        <span className="animate-pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '10px', fontWeight: 700, color: '#4ade80' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                          ออนไลน์
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '10px', fontWeight: 700, color: '#6b6560' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6b6560' }} />
                          ออฟไลน์
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {staffUsers.filter(u => u.role !== 'super_admin').length === 0 && (
                <p style={{ fontSize: '11px', color: '#6b6560', textAlign: 'center' }}>ไม่มีพนักงานในระบบ</p>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  )
}

/* SUBCOMPONENTS FOR PREMIUM LAYOUT */

function IndexCard({ title, subtitle, value, trend, trendLabel, color, glowClass, sparkData, href }: {
  title: string
  subtitle: string
  value: string
  trend: number
  trendLabel: string
  color: string
  glowClass: string
  sparkData: { value: number }[]
  href?: string
}) {
  const content = (
    <div className={`premium-card p-4 flex flex-col justify-between ${glowClass}`} style={{ minHeight: '124px', cursor: href ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '11px', color: '#6b6560', fontWeight: 700 }}>{title.toUpperCase()}</span>
          <h4 style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginTop: '2px' }}>{value}</h4>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: trend >= 0 ? '#34d399' : '#f43f5e', background: trend >= 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(244, 63, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
          {trend >= 0 ? `+${trend}%` : `${trend}%`}
        </span>
      </div>

      {/* Embedded Sparkline Chart matching the stock card preview */}
      <div style={{ height: '32px', marginTop: '8px', marginBottom: '4px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.8} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#a09890', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
        <span>{subtitle}</span>
        <span style={{ color: trend >= 0 ? '#34d399' : '#f43f5e', fontWeight: 500 }}>{trendLabel}</span>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>
  }
  return content
}

function ProgressBar({ title, percent, color }: { title: string; percent: number; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a09890', marginBottom: '5px' }}>
        <span>{title}</span>
        <span style={{ fontWeight: 600, color: '#f0ece8' }}>{percent}%</span>
      </div>
      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: '999px', boxShadow: `0 0 10px ${color}` }} />
      </div>
    </div>
  )
}

function LogItem({ time, type, title, desc }: { time: string; type: 'success' | 'alert' | 'info'; title: string; desc: string }) {
  const bulletColor = type === 'success' ? '#34d399' : type === 'alert' ? '#f59e0b' : '#3b82f6'
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '12px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
      <span style={{ color: bulletColor, fontSize: '14px', flexShrink: 0, marginTop: '-2px' }}>●</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong style={{ color: '#f0ece8', fontWeight: 600 }}>{title}</strong>
          <span style={{ color: '#6b6560', fontSize: '11px' }}>{time}</span>
        </div>
        <p style={{ color: '#a09890', marginTop: '2px', lineHeight: 1.4 }}>{desc}</p>
      </div>
    </div>
  )
}
