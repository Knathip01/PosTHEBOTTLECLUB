'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Category } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  TrendingUp, ShoppingBag, Users, Package, AlertTriangle, Wine,
  ArrowUpRight, RefreshCw, BarChart3, Tag, Warehouse, Sparkles, Check, X,
  Search, Edit3, Loader2, Key, ClipboardList, Clock, Image as ImageIcon,
  CheckCircle2, Eye, MessageSquare
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip
} from 'recharts'

export default function ManagerDashboard() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'stock' | 'discounts' | 'reports' | 'shop_reports'>('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Overview Stats
  const [todaySales, setTodaySales] = useState(0)
  const [todayOrders, setTodayOrders] = useState(0)
  const [monthSales, setMonthSales] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [chartData, setChartData] = useState<{ date: string; sales: number }[]>([])

  // Products & Stock
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [updatingProdId, setUpdatingProdId] = useState<string | null>(null)
  
  // Stock Adjustment Form
  const [adjustProdId, setAdjustProdId] = useState<string | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('ปรับปรุงสต๊อกรอบบิล')

  // Top Products (Reports)
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([])

  // Discount Requests Queue
  const [discountRequests, setDiscountRequests] = useState<any[]>([])

  // Allowed Discount Percentages Configured by Manager
  const [allowedDiscounts, setAllowedDiscounts] = useState<number[]>([10, 20, 30, 40, 50, 60, 70, 80, 90])
  const [customDiscountInput, setCustomDiscountInput] = useState('')
  const [savingDiscounts, setSavingDiscounts] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Stock Receipts (New Stock Reports)
  const [stockReceipts, setStockReceipts] = useState<any[]>([])
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null)
  const [receiptItems, setReceiptItems] = useState<any[]>([])
  const [loadingReceiptItems, setLoadingReceiptItems] = useState(false)

  // Shop Reports from Cashier
  const [shopReports, setShopReports] = useState<any[]>([])
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [shopReportsLoading, setShopReportsLoading] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')

  // Stock receipts date filters
  const [stockDateFrom, setStockDateFrom] = useState('')
  const [stockDateTo, setStockDateTo] = useState('')

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    else setRefreshing(true)

    try {
      const today = new Date().toISOString().slice(0, 10)
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenDaysAgoISO = sevenDaysAgo.toISOString()

      // Fetch Sales
      const [{ data: todaySalesData }, { data: monthSalesData }, { data: last7DaysData }] = await Promise.all([
        supabase.from('sales').select('total_amount').eq('status', 'paid').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
        supabase.from('sales').select('total_amount').eq('status', 'paid').gte('created_at', monthStart),
        supabase.from('sales').select('total_amount, created_at').eq('status', 'paid').gte('created_at', sevenDaysAgoISO)
      ])

      const todayVal = (todaySalesData || []).reduce((s, r) => s + r.total_amount, 0)
      const todayCount = (todaySalesData || []).length
      const monthVal = (monthSalesData || []).reduce((s, r) => s + r.total_amount, 0)

      setTodaySales(todayVal)
      setTodayOrders(todayCount)
      setMonthSales(monthVal)

      // Chart Data
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        const daySales = (last7DaysData || []).filter(s => s.created_at.slice(0, 10) === dateStr)
        const totalSalesVal = daySales.reduce((sum, s) => sum + s.total_amount, 0)
        days.push({
          date: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
          sales: totalSalesVal
        })
      }
      setChartData(days)

      // Fetch Products & Categories
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from('products').select('*, categories(*)').order('name'),
        supabase.from('categories').select('*').order('sort_order')
      ])

      const productList = (prods || []) as Product[]
      setProducts(productList)
      setCategories(cats || [])

      const lowStock = productList.filter(p => p.stock <= p.min_stock).length
      setLowStockCount(lowStock)

      // Fetch Top Products
      const { data: items } = await supabase.from('sale_items').select('product_name, quantity, line_total').limit(300)
      const productMap = new Map<string, { qty: number; revenue: number }>()
      for (const item of items || []) {
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

      // Fetch Discount Requests
      await loadDiscountRequests()

      // Fetch Allowed Discounts Setting
      try {
        const { data: discountSetting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'allowed_discounts')
          .single()
        if (discountSetting?.value) {
          setAllowedDiscounts(JSON.parse(discountSetting.value))
        }
      } catch (e) {
        console.log('No allowed_discounts setting found:', e)
      }

      // Fetch Stock Receipts
      let receiptsQuery = supabase
        .from('stock_receipts')
        .select('*, profiles!received_by(full_name)')
        .order('created_at', { ascending: false })

      if (stockDateFrom) {
        receiptsQuery = receiptsQuery.gte('created_at', `${stockDateFrom}T00:00:00`)
      }
      if (stockDateTo) {
        receiptsQuery = receiptsQuery.lte('created_at', `${stockDateTo}T23:59:59`)
      } else if (!stockDateFrom) {
        receiptsQuery = receiptsQuery.limit(10)
      }

      const { data: receipts } = await receiptsQuery
      setStockReceipts(receipts || [])

      // Fetch Shop Reports
      await loadShopReports()

    } catch (err) {
      console.error('Error loading manager dashboard data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, reportDateFrom, reportDateTo, stockDateFrom, stockDateTo])

  const loadDiscountRequests = async () => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('status', 'pending')
      .ilike('note', 'PENDING_DISCOUNT:%')
      .order('created_at', { ascending: false })

    if (data) {
      const parsed = data.map((sale: any) => {
        const parts = sale.note.split(':')
        const amount = parseFloat(parts[1]) || 0
        const table = parts[2] || 'หน้าร้าน'
        const reason = parts[3] || 'ส่วนลดเงินสด'
        return {
          id: sale.id,
          receipt_no: sale.receipt_no,
          amount,
          table,
          reason,
          created_at: sale.created_at,
          original_note: sale.note
        }
      })
      setDiscountRequests(parsed)
    }
  }

  const loadShopReports = async () => {
    setShopReportsLoading(true)
    try {
      let query = supabase
        .from('shop_reports')
        .select('*, profiles!reported_by(full_name)')
        .order('created_at', { ascending: false })

      if (reportDateFrom) {
        query = query.gte('created_at', `${reportDateFrom}T00:00:00`)
      }
      if (reportDateTo) {
        query = query.lte('created_at', `${reportDateTo}T23:59:59`)
      } else if (!reportDateFrom) {
        // Only limit if no filter is active
        query = query.limit(50)
      }

      const { data } = await query
      setShopReports(data || [])
    } catch (err) {
      console.error('Error loading shop reports:', err)
    } finally {
      setShopReportsLoading(false)
    }
  }

  const loadReceiptDetails = async (receipt: any) => {
    setSelectedReceipt(receipt)
    setLoadingReceiptItems(true)
    setReceiptItems([])
    try {
      const { data } = await supabase
        .from('stock_receipt_items')
        .select('*, products(name, sku)')
        .eq('stock_receipt_id', receipt.id)
      setReceiptItems(data || [])
    } catch (err) {
      console.error('Error loading receipt items:', err)
    } finally {
      setLoadingReceiptItems(false)
    }
  }

  useEffect(() => {
    loadData(true)

    // Auto-polling all dashboard data every 15 seconds
    const interval = setInterval(() => {
      loadData(false)
    }, 15000)

    return () => {
      clearInterval(interval)
    }
  }, [loadData])

  // Toggle active status of product
  const handleToggleProductActive = async (id: string, currentStatus: boolean) => {
    setUpdatingProdId(id)
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !currentStatus })
        .eq('id', id)
      if (error) throw error
      setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p))
    } catch (err: any) {
      alert('ไม่สามารถอัปเดตสถานะได้: ' + err.message)
    } finally {
      setUpdatingProdId(null)
    }
  }

  // Adjust product stock level
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustProdId || !adjustQty) return
    const qty = parseInt(adjustQty)
    if (isNaN(qty)) return

    setUpdatingProdId(adjustProdId)
    try {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', adjustProdId).single()
      if (!prod) return
      
      const newStock = Math.max(0, prod.stock + qty)
      
      const { error: stockErr } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', adjustProdId)
      if (stockErr) throw stockErr

      // Log movement record
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('inventory_movements').insert({
        product_id: adjustProdId,
        movement_type: qty >= 0 ? 'adjustment' : 'damage',
        quantity: qty,
        quantity_before: prod.stock,
        quantity_after: newStock,
        note: adjustReason,
        created_by: user?.id || null
      })

      // Update local state
      setProducts(prev => prev.map(p => p.id === adjustProdId ? { ...p, stock: newStock } : p))
      setAdjustProdId(null)
      setAdjustQty('')
      alert('ปรับปรุงสต๊อกสินค้าเรียบร้อยแล้ว')
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setUpdatingProdId(null)
    }
  }

  // Approve Discount Request
  const handleApproveDiscount = async (reqId: string, reqAmount: number) => {
    if (!confirm('ยืนยันอนุมัติส่วนลดจำนวนนี้ให้กับแคชเชียร์?')) return
    try {
      const { error } = await supabase
        .from('sales')
        .update({
          note: `APPROVED_DISCOUNT:${reqAmount}`,
          discount_amount: reqAmount
        })
        .eq('id', reqId)

      if (error) throw error
      alert('อนุมัติส่วนลดสำเร็จ พนักงานหน้าร้านจะได้รับการอัปเดตทันที')
      await loadDiscountRequests()
    } catch (err: any) {
      alert('ไม่สามารถทำรายการได้: ' + err.message)
    }
  }

  // Reject Discount Request
  const handleRejectDiscount = async (reqId: string) => {
    if (!confirm('ต้องการปฏิเสธคำขอส่วนลดนี้?')) return
    try {
      const { error } = await supabase
        .from('sales')
        .update({
          note: 'REJECTED_DISCOUNT',
          discount_amount: 0
        })
        .eq('id', reqId)

      if (error) throw error
      alert('ปฏิเสธคำขอส่วนลดเรียบร้อย')
      await loadDiscountRequests()
    } catch (err: any) {
      alert('ไม่สามารถทำรายการได้: ' + err.message)
    }
  }

  // Save discount setting
  const handleSaveDiscounts = async (newDiscounts: number[]) => {
    setSavingDiscounts(true)
    setSaveSuccess(false)
    try {
      const sorted = [...newDiscounts].sort((a, b) => a - b)
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'allowed_discounts', value: JSON.stringify(sorted) }, { onConflict: 'key' })
      if (error) throw error
      setAllowedDiscounts(sorted)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setSavingDiscounts(false)
    }
  }

  // Acknowledge shop report
  const handleAcknowledgeReport = async (reportId: string) => {
    try {
      await supabase.from('shop_reports').update({ status: 'acknowledged' }).eq('id', reportId)
      setShopReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'acknowledged' } : r))
      if (selectedReport?.id === reportId) setSelectedReport((prev: any) => ({ ...prev, status: 'acknowledged' }))
    } catch (err) {
      console.error('Error acknowledging report:', err)
    }
  }

  // Filters
  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <Loader2 size={42} className="animate-spin mb-4" style={{ color: '#a78bfa' }} />
        <p style={{ color: 'var(--text-secondary)' }}>กำลังเตรียมข้อมูลสำหรับผู้จัดการ...</p>
      </div>
    )
  }

  return (
    <>
      <div className="animate-in" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">แผงควบคุมหลักผู้จัดการ (Manager Console)</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>ระบบวิเคราะห์ผลประกอบการ บริหารสต๊อก และสิทธิ์การอนุมัติร้าน</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="hidden md:flex gap-2 border-b mb-6 overflow-x-auto" style={{ borderColor: 'var(--border-color)', scrollbarWidth: 'none' }}>
        {[
                { key: 'overview',      label: '📊 ยอดขายและกราฟ',     icon: <TrendingUp size={14} /> },
          { key: 'products',      label: '📦 จัดการสินค้า',       icon: <Package size={14} /> },
          { key: 'stock',         label: '⚙️ ตรวจสต๊อก',         icon: <Warehouse size={14} /> },
          { key: 'discounts',     label: '🔑 อนุมัติส่วนลด',     icon: <Key size={14} />, badge: discountRequests.length || null },
          { key: 'reports',       label: '📈 รายงานผลกำไร',      icon: <BarChart3 size={14} /> },
          { key: 'shop_reports',  label: '📋 รายงานร้าน',        icon: <ClipboardList size={14} />, badge: shopReports.filter(r => r.status === 'pending').length || null },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all relative shrink-0"
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #a78bfa' : '2px solid transparent',
              color: activeTab === tab.key ? 'white' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#f43f5e' }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>TODAY SALES (ยอดขายวันนี้)</span>
              <h3 className="text-2xl font-bold mt-1 text-white">{formatCurrency(todaySales)}</h3>
              <p className="text-xs mt-2" style={{ color: '#34d399' }}>สะสมรวม {todayOrders} ออเดอร์</p>
            </div>
            <div className="glass-card p-5">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>MONTH SALES (ยอดขายเดือนนี้)</span>
              <h3 className="text-2xl font-bold mt-1 text-white">{formatCurrency(monthSales)}</h3>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>ตั้งแต่วันที่ 1 ของเดือน</p>
            </div>
            <div className="glass-card p-5">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>LOW STOCK ALERTS</span>
              <h3 className="text-2xl font-bold mt-1" style={{ color: lowStockCount > 0 ? '#f59e0b' : 'white' }}>{lowStockCount} รายการ</h3>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>สินค้ามีของน้อยกว่าจุดวิกฤต</p>
            </div>
            <div className="glass-card p-5">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>PENDING DISCOUNTS</span>
              <h3 className="text-2xl font-bold mt-1" style={{ color: discountRequests.length > 0 ? '#f43f5e' : 'white' }}>{discountRequests.length} คำขอ</h3>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>รอผู้จัดการตรวจสอบ</p>
            </div>
          </div>

          {/* Chart Area */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white mb-4">กราฟแสดงยอดขายสะสมรายวัน (ย้อนหลัง 7 วัน)</h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="managerGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'white' }} />
                  <Area type="monotone" dataKey="sales" name="ยอดขาย" stroke="#a78bfa" fill="url(#managerGlow)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="glass-card p-5">
          {/* Controls */}
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="relative flex-1" style={{ minWidth: 240 }}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="ค้นหาสินค้า / คีย์ SKU..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="wine-input pl-9 w-full text-sm"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="wine-input text-sm"
              style={{ width: 180 }}
            >
              <option value="all">หมวดหมู่ทั้งหมด</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                  {['สินค้า', 'หมวดหมู่', 'ราคาขาย', 'ระดับสต๊อก', 'สถานะการขาย', ''].map(h => (
                    <th key={h} className="p-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td className="p-3">
                      <p className="text-sm font-bold text-white">{p.name}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SKU: {p.sku || '—'}</p>
                    </td>
                    <td className="p-3 text-sm text-secondary" style={{ color: 'var(--text-secondary)' }}>{(p.categories as any)?.name || '—'}</td>
                    <td className="p-3 text-sm font-bold" style={{ color: 'var(--gold-400)' }}>{formatCurrency(p.price)}</td>
                    <td className="p-3">
                      <span className="text-sm font-semibold" style={{ color: p.stock <= p.min_stock ? '#f59e0b' : 'white' }}>{p.stock} ชิ้น</span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                        style={{
                          background: p.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: p.is_active ? '#22c55e' : '#ef4444',
                          borderColor: p.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'
                        }}>
                        {p.is_active ? 'เปิดขายปกติ' : 'ปิดจำหน่าย'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleToggleProductActive(p.id, p.is_active)}
                        disabled={updatingProdId === p.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                        style={{
                          background: 'var(--bg-secondary)',
                          color: 'white',
                          borderColor: 'var(--border-color)',
                          cursor: 'pointer'
                        }}
                      >
                        {updatingProdId === p.id ? '...' : (p.is_active ? 'ระงับจำหน่าย' : 'เปิดรับบิล')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STOCK TAB */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Products List & Levels */}
            <div className="glass-card p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-white mb-4">ระดับสต๊อกสินค้าทั้งหมด</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {['สินค้า', 'ระดับขั้นต่ำ', 'สต๊อกปัจจุบัน', 'สถานะ', ''].map(h => (
                        <th key={h} className="p-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td className="p-3">
                          <p className="text-sm font-bold text-white">{p.name}</p>
                          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SKU: {p.sku || '—'}</p>
                        </td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>{p.min_stock} ชิ้น</td>
                        <td className="p-3 text-sm font-bold" style={{ color: p.stock <= p.min_stock ? '#f59e0b' : 'white' }}>{p.stock} ชิ้น</td>
                        <td className="p-3">
                          {p.stock === 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">OUT OF STOCK</span>
                          ) : p.stock <= p.min_stock ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">LOW STOCK</span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">SAFE</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setAdjustProdId(p.id)
                              setAdjustQty('')
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                            style={{
                              background: 'var(--bg-secondary)',
                              color: 'white',
                              borderColor: 'var(--border-color)',
                              marginLeft: 'auto'
                            }}
                          >
                            <Edit3 size={11} /> ปรับสต๊อก
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Side section containing Adjust Form and Receipt Details */}
            <div className="space-y-6">
              {/* Adjust Stock Form (Sidebar style) */}
              <div className="glass-card p-5 h-fit">
                <h3 className="text-sm font-bold text-white mb-4">🔧 แบบฟอร์มปรับปรุงคลังสินค้า</h3>
                {adjustProdId ? (
                  <form onSubmit={handleAdjustStock} className="space-y-4">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>สินค้าที่เลือก</label>
                      <p className="text-sm font-bold text-white">{products.find(p => p.id === adjustProdId)?.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        สต๊อกปัจจุบัน: {products.find(p => p.id === adjustProdId)?.stock} ชิ้น
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>จำนวนการเปลี่ยนแปลง (เพิ่ม/ลด)</label>
                      <input
                        type="number"
                        placeholder="เช่น 10 หรือ -5"
                        value={adjustQty}
                        onChange={e => setAdjustQty(e.target.value)}
                        required
                        className="wine-input w-full text-sm"
                      />
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>*พิมพ์ค่าลบ (เช่น -5) เพื่อระบุของชำรุดเสียหาย</p>
                    </div>

                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>เหตุผลประกอบการปรับปรุง</label>
                      <input
                        type="text"
                        value={adjustReason}
                        onChange={e => setAdjustReason(e.target.value)}
                        required
                        className="wine-input w-full text-sm"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="btn-wine flex-1 py-2 text-xs font-bold">บันทึกสต๊อก</button>
                      <button type="button" onClick={() => setAdjustProdId(null)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold border"
                        style={{ background: 'transparent', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                        ยกเลิก
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                    <Warehouse size={32} className="mx-auto mb-3" style={{ opacity: 0.3 }} />
                    <p className="text-xs">กรุณากดปุ่ม <b>"ปรับสต๊อก"</b> ในตารางสินค้า เพื่อป้อนรายละเอียดแก้ไขสต๊อก</p>
                  </div>
                )}
              </div>

              {/* Selected Receipt Items Details Panel */}
              {selectedReceipt && (
                <div className="glass-card p-5 animate-in">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-white">รายละเอียดใบรับของ #{selectedReceipt.receipt_no}</h4>
                    <button onClick={() => setSelectedReceipt(null)} className="text-xs p-1" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>ปิด</button>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}><b>ผู้ส่ง:</b> {selectedReceipt.supplier_name || 'ไม่ระบุ'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}><b>ราคารวม:</b> {formatCurrency(selectedReceipt.total_cost)}</p>
                    <div className="border-t pt-2 mt-2" style={{ borderColor: 'var(--border-color)' }}>
                      {loadingReceiptItems ? (
                        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-amber-500" /></div>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr style={{ color: 'var(--text-muted)' }}>
                              <th className="pb-1.5">สินค้า</th>
                              <th className="pb-1.5 text-center">จำนวน</th>
                              <th className="pb-1.5 text-right">ทุน/หน่วย</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receiptItems.map((item, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td className="py-2 text-white font-semibold">{(item.products as any)?.name || '—'}</td>
                                <td className="py-2 text-center text-white">{item.quantity}</td>
                                <td className="py-2 text-right text-white">{formatCurrency(item.cost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* New Stock Receipts Table */}
          <div className="glass-card p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 className="text-sm font-bold text-white font-display flex items-center gap-2" style={{ margin: 0 }}>
                <Warehouse size={16} style={{ color: '#fbbf24' }} />
                รายงานข้อมูลสินค้าเข้าใหม่ (คีย์โดยพนักงานคลังสินค้า)
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Start Date */}
                <input
                  type="date"
                  value={stockDateFrom}
                  onChange={e => setStockDateFrom(e.target.value)}
                  className="wine-input"
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-color)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ถึง</span>
                {/* End Date */}
                <input
                  type="date"
                  value={stockDateTo}
                  onChange={e => setStockDateTo(e.target.value)}
                  className="wine-input"
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-color)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
                {(stockDateFrom || stockDateTo) && (
                  <button
                    onClick={() => { setStockDateFrom(''); setStockDateTo('') }}
                    style={{
                      fontSize: 12,
                      padding: '6px 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>
            {stockReceipts.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลการนำเข้าสินค้าใหม่ในระบบ</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                      {['เลขบิลใบนำเข้า', 'ผู้ผลิต/ผู้จัดส่ง', 'ราคาทุนรวม', 'พนักงานคลังผู้บันทึก', 'วันเวลาคีย์นำเข้า', ''].map(h => (
                        <th key={h} className="p-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stockReceipts.map(rec => (
                      <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td className="p-3 font-mono text-sm font-bold text-white">#{rec.receipt_no}</td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{rec.supplier_name || '—'}</td>
                        <td className="p-3 text-sm font-bold" style={{ color: 'var(--gold-400)' }}>{formatCurrency(rec.total_cost)}</td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{(rec.profiles as any)?.full_name || 'ไม่ระบุ'}</td>
                        <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(rec.created_at).toLocaleString('th-TH')}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => loadReceiptDetails(rec)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border"
                            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'white', cursor: 'pointer' }}
                          >
                            ดูรายการย่อย
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCOUNTS TAB */}
      {activeTab === 'discounts' && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Key size={18} style={{ color: '#a78bfa' }} />
            <h3 className="text-base font-bold text-white">ตั้งค่าปุ่มส่วนลดสำหรับพนักงานแคชเชียร์ (POS Preset Discounts Config)</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
            เลือกเปิดใช้งานเปอร์เซ็นต์ส่วนลดมาตรฐาน เพื่อให้พนักงานหน้าร้านกดเลือกใช้งานบนเครื่อง POS ได้โดยตรง ไม่ต้องพิมพ์ระบุเอง
          </p>

          {/* Success / Loading indicators */}
          {saveSuccess && (
            <div className="mb-4 p-3 rounded-lg flex items-center gap-2 border border-green-500/20 bg-green-500/10 text-green-400 text-sm animate-in" style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.1)' }}>
              <CheckCircle2 size={16} />
              <span>บันทึกการตั้งค่าส่วนลดลงฐานข้อมูลเรียบร้อยแล้ว! ข้อมูลจะอัปเดตไปที่เครื่อง POS ทันที</span>
            </div>
          )}

          {/* Preset list selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(pct => {
              const active = allowedDiscounts.includes(pct)
              return (
                <button
                  key={pct}
                  onClick={() => {
                    let updated = []
                    if (active) {
                      updated = allowedDiscounts.filter(x => x !== pct)
                    } else {
                      updated = [...allowedDiscounts, pct]
                    }
                    setAllowedDiscounts(updated)
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    border: active ? '1.5px solid rgba(167,139,250,0.5)' : '1px solid var(--border-color)',
                    background: active ? 'rgba(167,139,250,0.15)' : 'transparent',
                    color: active ? '#a78bfa' : 'var(--text-muted)'
                  }}
                >
                  ลด {pct}%
                </button>
              )
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }} className="flex flex-wrap gap-4 items-center justify-between">
            {/* Custom discount add option */}
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="ระบุเปอร์เซ็นต์อื่นๆ (เช่น 15, 25)"
                value={customDiscountInput}
                onChange={e => setCustomDiscountInput(e.target.value)}
                className="wine-input"
                style={{ fontSize: 13, width: 220 }}
              />
              <button
                onClick={() => {
                  const pct = parseInt(customDiscountInput)
                  if (!isNaN(pct) && pct > 0 && pct < 100) {
                    if (allowedDiscounts.includes(pct)) {
                      alert('มีเปอร์เซ็นต์นี้อยู่แล้ว')
                    } else {
                      setAllowedDiscounts([...allowedDiscounts, pct])
                      setCustomDiscountInput('')
                    }
                  }
                }}
                className="btn-ghost"
                style={{ fontSize: 13, padding: '9px 16px' }}
              >
                เพิ่มปุ่ม
              </button>
            </div>

            <button
              onClick={() => handleSaveDiscounts(allowedDiscounts)}
              disabled={savingDiscounts}
              className="btn-wine"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                padding: '12px 28px',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 12
              }}
            >
              {savingDiscounts ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
      )}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top selling report */}
          <div className="glass-card p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-white mb-4">🏆 อันดับสินค้าขายดี (จำแนกตามรายได้รวม)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['อันดับ', 'ชื่อสินค้า', 'จำนวนขวดที่จำหน่าย', 'รายได้สะสม'].map(h => (
                      <th key={h} className="p-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td className="p-3 text-sm font-bold text-white">{idx + 1}</td>
                      <td className="p-3 text-sm font-bold text-white">{p.name}</td>
                      <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{p.qty} ขวด</td>
                      <td className="p-3 text-sm font-bold" style={{ color: 'var(--gold-400)' }}>{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick portfolio share */}
          <div className="glass-card p-5 h-fit">
            <h3 className="text-sm font-bold text-white mb-4">🍷 รายงานอัตราส่วนประเภทผลิตภัณฑ์</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>ไวน์แดง (Red Wine)</span>
                  <span className="font-bold text-white">65%</span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 9 }}>
                  <div style={{ width: '65%', height: '100%', background: '#b02238', borderRadius: 9 }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>ไวน์ขาว (White Wine)</span>
                  <span className="font-bold text-white">25%</span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 9 }}>
                  <div style={{ width: '25%', height: '100%', background: '#06b6d4', borderRadius: 9 }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>สปาร์คกลิ้ง (Sparkling)</span>
                  <span className="font-bold text-white">10%</span>
                </div>
                <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 9 }}>
                  <div style={{ width: '100%', height: '100%', background: '#a78bfa', borderRadius: 9, maxWidth: '10%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* SHOP REPORTS TAB */}
      {activeTab === 'shop_reports' && (
        <div className={selectedReport ? "grid grid-cols-1 lg:grid-cols-2 gap-5" : "grid grid-cols-1 gap-5"}>
          {/* Reports list */}
          <div className={selectedReport ? "glass-card hidden lg:block" : "glass-card"} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#0c4a6e,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={16} color="white" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white' }}>รายงานความเรียบร้อยจาก Cashier</h3>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                    {shopReports.filter(r => r.status === 'pending').length} รายการรอตรวจสอบ
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Start Date */}
                <input
                  type="date"
                  value={reportDateFrom}
                  onChange={e => setReportDateFrom(e.target.value)}
                  className="wine-input"
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-color)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ถึง</span>
                {/* End Date */}
                <input
                  type="date"
                  value={reportDateTo}
                  onChange={e => setReportDateTo(e.target.value)}
                  className="wine-input"
                  style={{
                    fontSize: 12,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-color)',
                    color: 'white',
                    outline: 'none'
                  }}
                />
                {(reportDateFrom || reportDateTo) && (
                  <button
                    onClick={() => { setReportDateFrom(''); setReportDateTo('') }}
                    style={{
                      fontSize: 12,
                      padding: '6px 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>

            {shopReportsLoading && shopReports.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <Loader2 size={28} style={{ color: '#38bdf8', animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>กำลังโหลดรายงาน...</p>
              </div>
            ) : shopReports.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <ClipboardList size={24} style={{ color: '#38bdf8' }} />
                </div>
                <h4 style={{ color: 'white', fontWeight: 700, margin: '0 0 6px' }}>ยังไม่มีรายงานจากพนักงาน</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>เมื่อ Cashier ส่งรายงานความเรียบร้อย จะปรากฏที่นี่</p>
              </div>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 600 }}>
                {shopReports.map(report => (
                  <div
                    key={report.id}
                    onClick={() => setSelectedReport(report)}
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      background: selectedReport?.id === report.id
                        ? 'rgba(56,189,248,0.06)'
                        : report.status === 'pending' ? 'rgba(56,189,248,0.02)' : 'transparent',
                      borderLeft: selectedReport?.id === report.id ? '3px solid #38bdf8'
                        : report.status === 'pending' ? '3px solid rgba(56,189,248,0.3)' : '3px solid transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          {/* Status badge */}
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: report.status === 'pending' ? 'rgba(56,189,248,0.15)' : 'rgba(34,197,94,0.12)',
                            color: report.status === 'pending' ? '#38bdf8' : '#4ade80',
                            border: `1px solid ${report.status === 'pending' ? 'rgba(56,189,248,0.3)' : 'rgba(34,197,94,0.25)'}`,
                            flexShrink: 0,
                          }}>
                            {report.status === 'pending' ? '🔵 รอตรวจสอบ' : '✅ รับทราบแล้ว'}
                          </span>
                        </div>
                        <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {report.title}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            👤 {report.profiles?.full_name || 'ไม่ทราบชื่อ'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            🕐 {new Date(report.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {report.images?.length > 0 && (
                            <span style={{ fontSize: 11, color: '#38bdf8' }}>📸 {report.images.length} รูป</span>
                          )}
                        </div>
                      </div>
                      <Eye size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Report detail panel */}
          {selectedReport && (
            <div className="glass-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Detail header */}
              <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={16} style={{ color: '#38bdf8' }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white' }}>รายละเอียดรายงาน</h3>
                </div>
                <button
                  onClick={() => setSelectedReport(null)}
                  style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
                ><X size={14} /></button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Status + Acknowledge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
                    background: selectedReport.status === 'pending' ? 'rgba(56,189,248,0.15)' : 'rgba(34,197,94,0.12)',
                    color: selectedReport.status === 'pending' ? '#38bdf8' : '#4ade80',
                    border: `1px solid ${selectedReport.status === 'pending' ? 'rgba(56,189,248,0.3)' : 'rgba(34,197,94,0.25)'}`,
                  }}>
                    {selectedReport.status === 'pending' ? '🔵 รอตรวจสอบ' : '✅ รับทราบแล้ว'}
                  </span>
                  {selectedReport.status === 'pending' && (
                    <button
                      onClick={() => handleAcknowledgeReport(selectedReport.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #166534, #22c55e)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.25)' }}
                    >
                      <CheckCircle2 size={14} /> รับทราบรายงาน
                    </button>
                  )}
                </div>

                {/* Title */}
                <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#7dd3fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>หัวข้อ</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'white' }}>{selectedReport.title}</p>
                </div>

                {/* Reporter info */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                    <p style={{ margin: '0 0 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>ส่งโดย</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'white' }}>{selectedReport.profiles?.full_name || 'ไม่ทราบชื่อ'}</p>
                  </div>
                  <div style={{ flex: 1, padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                    <p style={{ margin: '0 0 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>เวลาที่ส่ง</p>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'white' }}>
                      {new Date(selectedReport.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* Note */}
                {selectedReport.note && (
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>รายละเอียด</p>
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedReport.note}</p>
                    </div>
                  </div>
                )}

                {/* Images */}
                {selectedReport.images?.length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📸 รูปภาพประกอบ ({selectedReport.images.length} รูป)
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                      {selectedReport.images.map((img: string, idx: number) => (
                        <div
                          key={idx}
                          onClick={() => window.open(img, '_blank')}
                          style={{ borderRadius: 12, overflow: 'hidden', aspectRatio: '1', border: '1px solid var(--border-color)', cursor: 'zoom-in', position: 'relative' }}
                        >
                          <img
                            src={img}
                            alt={`report-img-${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.2s ease' }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                          />
                          <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 5px', fontSize: 9, color: 'white', fontWeight: 600 }}>
                            {idx + 1}/{selectedReport.images.length}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Mobile Bottom Tab Bar for Manager Console */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 60, height: 60,
        background: 'rgba(10,12,16,0.96)',
        borderTop: '1px solid var(--border-color)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        alignItems: 'center',
        justifyContent: 'space-around',
      }} className="flex md:hidden">
        {[
          { key: 'overview',      label: 'ยอดขาย',     icon: <TrendingUp size={18} /> },
          { key: 'products',      label: 'สินค้า',       icon: <Package size={18} /> },
          { key: 'stock',         label: 'สต๊อก',       icon: <Warehouse size={18} /> },
          { key: 'discounts',     label: 'อนุมัติ',       icon: <Key size={18} />, badge: discountRequests.length || null },
          { key: 'reports',       label: 'กำไร',        icon: <BarChart3 size={18} /> },
          { key: 'shop_reports',  label: 'รายงานร้าน',    icon: <ClipboardList size={18} />, badge: shopReports.filter(r => r.status === 'pending').length || null },
        ].map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, background: 'none', border: 'none',
                color: active ? '#a78bfa' : 'var(--text-muted)',
                fontSize: 9, fontWeight: 700, cursor: 'pointer', transition: 'color 150ms',
                position: 'relative',
                padding: '4px 0'
              }}
            >
              <div style={{
                width: 36, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'rgba(167,139,250,0.15)' : 'transparent',
                transition: 'background 150ms'
              }}>
                {tab.icon}
              </div>
              <span>{tab.label}</span>
              
              {/* Notification Badges */}
              {tab.badge && (
                <span style={{
                  position: 'absolute',
                  top: 2,
                  right: '18%',
                  background: '#f43f5e',
                  color: 'white',
                  borderRadius: '50%',
                  minWidth: 14,
                  height: 14,
                  fontSize: 8,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 8px rgba(244,63,94,0.4)',
                  padding: '0 3px'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </>
  )
}
