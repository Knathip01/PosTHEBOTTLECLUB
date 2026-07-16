'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Category } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  TrendingUp, ShoppingBag, Users, Package, AlertTriangle, Wine,
  ArrowUpRight, RefreshCw, BarChart3, Tag, Warehouse, Sparkles, Check, X,
  Search, Edit3, Loader2, Key, ClipboardList, Clock, Image as ImageIcon,
  CheckCircle2, Eye, MessageSquare, CreditCard, ChevronRight
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip
} from 'recharts'

export default function ManagerDashboard() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'stock' | 'discounts' | 'reports' | 'shop_reports' | 'payments'>('overview')
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

  // Stock Adjustments
  const [stockAdjustments, setStockAdjustments] = useState<any[]>([])
  const [selectedAdjustment, setSelectedAdjustment] = useState<any | null>(null)

  // Shop Reports from Cashier
  const [shopReports, setShopReports] = useState<any[]>([])
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [shopReportsLoading, setShopReportsLoading] = useState(false)
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')

  // Stock receipts date filters
  const [stockDateFrom, setStockDateFrom] = useState('')
  const [stockDateTo, setStockDateTo] = useState('')

  // Payment Verification Tab
  const [paymentsSales, setPaymentsSales] = useState<any[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [selectedPaymentSale, setSelectedPaymentSale] = useState<any | null>(null)
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'pending' | 'paid' | 'all'>('all')
  const [paymentSourceFilter, setPaymentSourceFilter] = useState<'all' | 'pos' | 'menu'>('all')

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

      // Fetch Stock Adjustments
      let adjustmentsQuery = supabase
        .from('inventory_movements')
        .select('*, products(name, sku), profiles!created_by(full_name)')
        .eq('movement_type', 'adjust')
        .order('created_at', { ascending: false })

      if (stockDateFrom) {
        adjustmentsQuery = adjustmentsQuery.gte('created_at', `${stockDateFrom}T00:00:00`)
      }
      if (stockDateTo) {
        adjustmentsQuery = adjustmentsQuery.lte('created_at', `${stockDateTo}T23:59:59`)
      } else if (!stockDateFrom) {
        adjustmentsQuery = adjustmentsQuery.limit(10)
      }

      const { data: adjustments } = await adjustmentsQuery
      setStockAdjustments(adjustments || [])

      // Fetch Shop Reports
      await loadShopReports()

      // Fetch Payment Verification Sales
      await loadPayments()

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
        .select('*, profiles!reported_by(full_name, role)')
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

  const loadPayments = async () => {
    setPaymentsLoading(true)
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          profiles!cashier_id(full_name),
          sale_items(
            *,
            products(
              category_id,
              categories(name)
            )
          )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      setPaymentsSales(data || [])
    } catch (err) {
      console.error('Error loading payments:', err)
    } finally {
      setPaymentsLoading(false)
    }
  }

  const handleApprovePayment = async (sale: any) => {
    if (!confirm(`ยืนยันอนุมัติการชำระเงินและหักสต๊อกสินค้า\nยอดชำระ: ${sale.total_amount} บาท?`)) return
    setPaymentsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้เข้าสู่ระบบ')

      // 1. Deduct Stock for items in sale
      for (const item of sale.sale_items || []) {
        // Fetch current product stock
        const { data: prod, error: prodGetErr } = await supabase
          .from('products')
          .select('stock, name')
          .eq('id', item.product_id)
          .single()
        if (prodGetErr) throw new Error(`ไม่พบสินค้า ${item.product_name}: ${prodGetErr.message}`)

        const newStock = Math.max(0, (prod.stock || 0) - item.quantity)

        // Update product stock
        const { error: prodErr } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.product_id)
        if (prodErr) throw new Error(`ไม่สามารถหักสต๊อกสินค้า ${item.product_name} ได้: ${prodErr.message}`)

        // Create inventory movement
        const { error: moveErr } = await supabase
          .from('inventory_movements')
          .insert({
            product_id: item.product_id,
            movement_type: 'out',
            quantity: -item.quantity,
            quantity_before: prod.stock,
            quantity_after: newStock,
            reference_type: 'sale',
            reference_id: sale.id,
            note: `ยืนยันการขายผ่าน QR/Menu โต๊ะ ${sale.table_no || 'หน้าร้าน'}`,
            created_by: user.id
          })
        if (moveErr) throw new Error(`ไม่สามารถบันทึกสต๊อกสำหรับ ${item.product_name} ได้: ${moveErr.message}`)
      }

      // 2. Create entry in payments table
      const { error: payErr } = await supabase.from('payments').insert({
        sale_id: sale.id,
        payment_method: sale.payment_method || 'qr',
        amount: sale.total_amount,
        reference_no: null
      })
      if (payErr) throw new Error(`ไม่สามารถเพิ่มรายการชำระเงินได้: ${payErr.message}`)

      // 3. Update sale status to 'paid'
      const { error: saleErr } = await supabase
        .from('sales')
        .update({
          status: 'paid',
          cashier_id: user.id
        })
        .eq('id', sale.id)
      if (saleErr) throw new Error(`ไม่สามารถปรับปรุงสถานะการขายได้: ${saleErr.message}`)

      alert('อนุมัติการชำระเงินและทำการตัดสต๊อกสินค้าเรียบร้อยแล้ว!')
      await loadPayments()
      
      // Update selectedPaymentSale detail if open
      setSelectedPaymentSale((prev: any) => prev?.id === sale.id ? { ...prev, status: 'paid' } : prev)
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการอนุมัติชำระเงิน: ' + err.message)
    } finally {
      setPaymentsLoading(false)
    }
  }

  const handleCancelPayment = async (saleId: string) => {
    if (!confirm('ต้องการยกเลิกคำขอสั่งซื้อ/ชำระเงินรายการนี้?')) return
    setPaymentsLoading(true)
    try {
      const { error } = await supabase
        .from('sales')
        .update({ status: 'cancelled' })
        .eq('id', saleId)
      if (error) throw error
      alert('ยกเลิกรายการสั่งซื้อเรียบร้อย')
      await loadPayments()
      setSelectedPaymentSale(null)
    } catch (err: any) {
      alert('ไม่สามารถยกเลิกรายการได้: ' + err.message)
    } finally {
      setPaymentsLoading(false)
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

  const renderReportCard = (title: string, list: any[], titleColor: string, gradient: string, maxHeight: number = 600) => {
    const pendingCount = list.filter(r => r.status === 'pending').length
    return (
      <div className="glass-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={16} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white' }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {pendingCount} รายการรอตรวจสอบ
              </p>
            </div>
          </div>
        </div>

        {shopReportsLoading && list.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Loader2 size={24} style={{ color: titleColor, animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>กำลังโหลดรายงาน...</p>
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <ClipboardList size={20} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>ไม่มีรายการรายงานในขณะนี้</p>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: maxHeight }}>
            {list.map(report => (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report)}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  background: selectedReport?.id === report.id
                    ? 'rgba(56,189,248,0.06)'
                    : report.status === 'pending' ? 'rgba(56,189,248,0.02)' : 'transparent',
                  borderLeft: selectedReport?.id === report.id ? '3px solid #38bdf8'
                    : report.status === 'pending' ? `3px solid ${titleColor}` : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                        background: report.status === 'pending' ? 'rgba(56,189,248,0.15)' : 'rgba(34,197,94,0.12)',
                        color: report.status === 'pending' ? '#38bdf8' : '#4ade80',
                        border: `1px solid ${report.status === 'pending' ? 'rgba(56,189,248,0.3)' : 'rgba(34,197,94,0.25)'}`,
                        flexShrink: 0,
                      }}>
                        {report.status === 'pending' ? 'รอตรวจสอบ' : 'รับทราบแล้ว'}
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
                  <Eye size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

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
          { key: 'payments',      label: '💳 ตรวจสอบชำระเงิน',    icon: <CreditCard size={14} />, badge: paymentsSales.filter(r => r.status === 'pending').length || null },
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
                    {selectedReceipt.image_url && (
                      <div className="mt-3">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}><b>รูปภาพหลักฐานการรับของ:</b></p>
                        <a href={selectedReceipt.image_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={selectedReceipt.image_url}
                            alt="หลักฐานใบเสร็จคลังสินค้า"
                            style={{
                              width: '100%',
                              maxHeight: '180px',
                              objectFit: 'cover',
                              borderRadius: '10px',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer'
                            }}
                          />
                        </a>
                      </div>
                    )}
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

              {/* Selected Adjustment Details Panel */}
              {selectedAdjustment && (
                <div className="glass-card p-5 animate-in">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-white">รายละเอียดการปรับปรุงสต๊อก</h4>
                    <button onClick={() => setSelectedAdjustment(null)} className="text-xs p-1" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>ปิด</button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>สินค้าที่ปรับปรุง</p>
                      <p className="text-sm font-bold text-white">{(selectedAdjustment.products as any)?.name || '—'}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>SKU: {(selectedAdjustment.products as any)?.sku || '—'}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-black/25 p-3 rounded-xl border border-white/5 text-center">
                      <div>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>สต๊อกก่อนปรับ</p>
                        <p className="text-sm font-bold text-white">{selectedAdjustment.quantity_before} ชิ้น</p>
                      </div>
                      <div className="flex items-center justify-center">
                        <span style={{ color: selectedAdjustment.quantity > 0 ? '#10b981' : '#f43f5e', fontWeight: 'bold' }}>
                          {selectedAdjustment.quantity > 0 ? `+${selectedAdjustment.quantity}` : selectedAdjustment.quantity} ชิ้น
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>สต๊อกหลังปรับ</p>
                        <p className="text-sm font-bold text-white">{selectedAdjustment.quantity_after} ชิ้น</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}><b>ผู้บันทึก:</b> {(selectedAdjustment.profiles as any)?.full_name || 'ไม่ระบุ'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}><b>เหตุผลประกอบ:</b> {selectedAdjustment.note || '—'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}><b>วันเวลาที่บันทึก:</b> {new Date(selectedAdjustment.created_at).toLocaleString('th-TH')}</p>
                    </div>

                    {selectedAdjustment.image_url && (
                      <div className="border-t pt-3" style={{ borderColor: 'var(--border-color)' }}>
                        <p className="text-xs mb-1.5 font-semibold text-white">รูปภาพหลักฐานแนบ:</p>
                        <a href={selectedAdjustment.image_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={selectedAdjustment.image_url}
                            alt="หลักฐานสินค้าเสียหาย"
                            style={{
                              width: '100%',
                              maxHeight: '220px',
                              objectFit: 'cover',
                              borderRadius: '10px',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer'
                            }}
                          />
                        </a>
                      </div>
                    )}
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
                        <td className="p-3 font-mono text-sm font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            #{rec.receipt_no}
                            {rec.image_url && <ImageIcon size={14} style={{ color: '#fbbf24', opacity: 0.8 }} title="มีภาพหลักฐานประกอบ" />}
                          </div>
                        </td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{rec.supplier_name || '—'}</td>
                        <td className="p-3 text-sm font-bold" style={{ color: 'var(--gold-400)' }}>{formatCurrency(rec.total_cost)}</td>
                        <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{(rec.profiles as any)?.full_name || 'ไม่ระบุ'}</td>
                        <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(rec.created_at).toLocaleString('th-TH')}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedAdjustment(null)
                              loadReceiptDetails(rec)
                            }}
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

          {/* New Stock Adjustments Table */}
          <div className="glass-card p-5 mt-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 className="text-sm font-bold text-white font-display flex items-center gap-2" style={{ margin: 0 }}>
                <Edit3 size={16} style={{ color: '#a78bfa' }} />
                รายงานการปรับปรุงสต๊อกสินค้า (คีย์โดยพนักงานคลังสินค้า)
              </h3>
            </div>
            {stockAdjustments.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลการปรับปรุงยอดสต๊อกในระบบ</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                      {['สินค้า', 'จำนวนที่ปรับปรุง', 'สต๊อกก่อนหน้านี้', 'สต๊อกหลังปรับ', 'เหตุผลการปรับปรุง', 'พนักงานผู้บันทึก', 'วันเวลาที่บันทึก', ''].map(h => (
                        <th key={h} className="p-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stockAdjustments.map(adj => {
                      const isPositive = adj.quantity > 0
                      return (
                        <tr key={adj.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td className="p-3">
                            <p className="text-sm font-bold text-white">{(adj.products as any)?.name || '—'}</p>
                            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>SKU: {(adj.products as any)?.sku || '—'}</p>
                          </td>
                          <td className="p-3 text-sm font-bold" style={{ color: isPositive ? '#10b981' : '#f43f5e' }}>
                            {isPositive ? `+${adj.quantity}` : adj.quantity} ชิ้น
                          </td>
                          <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{adj.quantity_before} ชิ้น</td>
                          <td className="p-3 text-sm font-bold text-white">{adj.quantity_after} ชิ้น</td>
                          <td className="p-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span style={{ color: 'var(--text-secondary)' }}>{adj.note || '—'}</span>
                              {adj.image_url && (
                                <a href={adj.image_url} target="_blank" rel="noopener noreferrer" className="flex items-center" title="ดูรูปภาพหลักฐานการปรับปรุงสต๊อก">
                                  <ImageIcon size={14} style={{ color: '#fbbf24', cursor: 'pointer' }} />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{(adj.profiles as any)?.full_name || 'ไม่ระบุ'}</td>
                          <td className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(adj.created_at).toLocaleString('th-TH')}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedReceipt(null)
                                setSelectedAdjustment(adj)
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border"
                              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'white', cursor: 'pointer' }}
                            >
                              ดูข้อมูล
                            </button>
                          </td>
                        </tr>
                      )
                    })}
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
      {/* PAYMENTS VERIFICATION TAB */}
      {activeTab === 'payments' && (() => {
        const parseSlipUrl = (noteStr?: string) => {
          if (!noteStr) return null
          const match = noteStr.match(/SLIP:(https?:\/\/\S+)/)
          return match ? match[1] : null
        }
        const getCleanNote = (noteStr?: string) => {
          if (!noteStr) return ''
          return noteStr.split('| SLIP:')[0].split('SLIP:')[0].trim()
        }

        const filteredPayments = paymentsSales.filter(sale => {
          // Status filter
          if (paymentStatusFilter !== 'all' && sale.status !== paymentStatusFilter) return false
          
          // Source filter
          const isMenuOrder = !!(sale.table_no || (sale.note && (sale.note.includes('QR Code') || sale.note.includes('สั่งจาก QR Code'))) || !sale.cashier_id)
          if (paymentSourceFilter === 'pos' && isMenuOrder) return false
          if (paymentSourceFilter === 'menu' && !isMenuOrder) return false
          
          return true
        })

        return (
          <div className={selectedPaymentSale ? "grid grid-cols-1 lg:grid-cols-3 gap-5" : "grid grid-cols-1 gap-5"}>
            {/* Left list panel */}
            <div className={selectedPaymentSale ? "lg:col-span-1 glass-card" : "glass-card"} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header & Filters */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard size={16} color="white" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white' }}>ตรวจสอบการชำระเงิน</h3>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                      คำสั่งซื้อจาก QR Code โต๊ะอาหาร และเครื่อง POS หน้าร้าน
                    </p>
                  </div>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* Status Filter */}
                  <select
                    value={paymentStatusFilter}
                    onChange={e => setPaymentStatusFilter(e.target.value as any)}
                    className="wine-input"
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                  >
                    <option value="all">สถานะทั้งหมด</option>
                    <option value="pending">รออนุมัติชำระเงิน</option>
                    <option value="paid">ชำระเงินเสร็จแล้ว</option>
                  </select>

                  {/* Source Filter */}
                  <select
                    value={paymentSourceFilter}
                    onChange={e => setPaymentSourceFilter(e.target.value as any)}
                    className="wine-input"
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                  >
                    <option value="all">ทุกช่องทาง</option>
                    <option value="menu">สั่งจากโต๊ะ (QR Code)</option>
                    <option value="pos">สั่งจากหน้าร้าน (POS)</option>
                  </select>
                </div>
              </div>

              {/* List body */}
              {paymentsLoading && filteredPayments.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <Loader2 size={28} className="animate-spin" style={{ color: '#a855f7', margin: '0 auto 12px', display: 'block' }} />
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>กำลังโหลดประวัติการชำระเงิน...</p>
                </div>
              ) : filteredPayments.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <CreditCard size={24} style={{ color: '#a855f7' }} />
                  </div>
                  <h4 style={{ color: 'white', fontWeight: 700, margin: '0 0 6px' }}>ไม่พบรายการสั่งซื้อ</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>ไม่มีข้อมูลการชำระเงินที่ตรงตามเงื่อนไขในขณะนี้</p>
                </div>
              ) : (
                <div style={{ overflowY: 'auto', maxHeight: selectedPaymentSale ? 450 : 600 }}>
                  {filteredPayments.map(sale => {
                    const isMenuOrder = !!(sale.table_no || (sale.note && (sale.note.includes('QR Code') || sale.note.includes('สั่งจาก QR Code'))) || !sale.cashier_id)
                    const slipUrl = parseSlipUrl(sale.note)
                    return (
                      <div
                        key={sale.id}
                        onClick={() => setSelectedPaymentSale(sale)}
                        style={{
                          padding: '16px 20px',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          background: selectedPaymentSale?.id === sale.id
                            ? 'rgba(168,85,247,0.06)'
                            : sale.status === 'pending' ? 'rgba(245,158,11,0.03)' : 'transparent',
                          borderLeft: selectedPaymentSale?.id === sale.id ? '3px solid #a855f7'
                            : sale.status === 'pending' ? '3px solid #f59e0b' : '3px solid transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              {/* Source badge */}
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                background: isMenuOrder ? 'rgba(56,189,248,0.12)' : 'rgba(167,139,250,0.12)',
                                color: isMenuOrder ? '#38bdf8' : '#a78bfa',
                                border: `1px solid ${isMenuOrder ? 'rgba(56,189,248,0.2)' : 'rgba(167,139,250,0.2)'}`
                              }}>
                                {isMenuOrder ? `โต๊ะ ${sale.table_no || '1-10'}` : 'หน้าร้าน (POS)'}
                              </span>

                              {/* Status badge */}
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: sale.status === 'pending' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                                color: sale.status === 'pending' ? '#f59e0b' : '#4ade80',
                                border: `1px solid ${sale.status === 'pending' ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)'}`
                              }}>
                                {sale.status === 'pending' ? '🔵 รออนุมัติ' : '✅ ชำระแล้ว'}
                              </span>

                              {slipUrl && (
                                <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                                  📸 สลิปโอนเงิน
                                </span>
                              )}
                            </div>

                            <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'white' }}>
                              ยอดชำระ: {formatCurrency(sale.total_amount)}
                            </h4>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 11 }}>
                              <span>เลขที่: {sale.receipt_no}</span>
                              <span>•</span>
                              <span>
                                🕐 {new Date(sale.created_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 4 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right detail panel */}
            {selectedPaymentSale && (() => {
              const isMenuOrder = !!(selectedPaymentSale.table_no || (selectedPaymentSale.note && (selectedPaymentSale.note.includes('QR Code') || selectedPaymentSale.note.includes('สั่งจาก QR Code'))) || !selectedPaymentSale.cashier_id)
              const slipUrl = parseSlipUrl(selectedPaymentSale.note)
              const cleanNote = getCleanNote(selectedPaymentSale.note)

              return (
                <div className="lg:col-span-2 glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClipboardList size={16} style={{ color: '#a855f7' }} />
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white' }}>รายละเอียดบิล & การชำระเงิน</h3>
                    </div>
                    <button
                      onClick={() => setSelectedPaymentSale(null)}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Detail Body */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    
                    {/* Status & Approve actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
                        background: selectedPaymentSale.status === 'pending' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.12)',
                        color: selectedPaymentSale.status === 'pending' ? '#f59e0b' : '#4ade80',
                        border: `1px solid ${selectedPaymentSale.status === 'pending' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.25)'}`
                      }}>
                        {selectedPaymentSale.status === 'pending' ? '🔵 รอตรวจสอบชำระเงิน' : '✅ ชำระเงินเสร็จสมบูรณ์'}
                      </span>

                      {selectedPaymentSale.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleApprovePayment(selectedPaymentSale)}
                            disabled={paymentsLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.25)' }}
                          >
                            <CheckCircle2 size={14} /> อนุมัติชำระเงิน
                          </button>
                          <button
                            onClick={() => handleCancelPayment(selectedPaymentSale.id)}
                            disabled={paymentsLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ยกเลิกออเดอร์
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Source / Receipt Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                        <p style={{ margin: '0 0 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>ช่องทางที่สั่งซื้อ</p>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'white' }}>
                          {isMenuOrder ? `โต๊ะอาหาร: โต๊ะ ${selectedPaymentSale.table_no || '1-10'}` : 'พนักงานหน้าร้าน (POS)'}
                        </p>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                        <p style={{ margin: '0 0 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>หมายเลขคิว/บิล</p>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'white' }}>{selectedPaymentSale.receipt_no}</p>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                        <p style={{ margin: '0 0 3px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>วิธีชำระเงิน</p>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                          {selectedPaymentSale.payment_method || 'qr code'}
                        </p>
                      </div>
                    </div>

                    {/* Items table */}
                    <div>
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>รายการสินค้าในบิล</p>
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
                        {selectedPaymentSale.sale_items?.map((item: any, idx: number) => (
                          <div key={idx} style={{ padding: '10px 14px', borderBottom: idx === selectedPaymentSale.sale_items.length - 1 ? 'none' : '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: 'rgba(0,0,0,0.1)' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: 'white' }}>{item.product_name}</span>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                {item.unit_price} x {item.quantity}
                              </div>
                            </div>
                            <span style={{ fontWeight: 700, color: 'white' }}>{formatCurrency(item.line_total)}</span>
                          </div>
                        ))}
                        
                        {/* Summary totals */}
                        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                            <span>รวมราคา (Subtotal)</span>
                            <span>{formatCurrency(selectedPaymentSale.subtotal)}</span>
                          </div>
                          {selectedPaymentSale.discount_amount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                              <span>ส่วนลด (Discount)</span>
                              <span>-{formatCurrency(selectedPaymentSale.discount_amount)}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: 'white', marginTop: 4 }}>
                            <span>ยอดรวมสุทธิ (Total)</span>
                            <span style={{ color: '#a855f7' }}>{formatCurrency(selectedPaymentSale.total_amount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Note if any */}
                    {cleanNote && (
                      <div>
                        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>หมายเหตุ</p>
                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {cleanNote}
                        </div>
                      </div>
                    )}

                    {/* Slip Image Preview */}
                    {slipUrl && (
                      <div>
                        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                          📸 หลักฐานการโอนเงิน (สลิปลูกค้า)
                        </p>
                        <div
                          onClick={() => window.open(slipUrl, '_blank')}
                          style={{
                            border: '1px solid var(--border-color)', borderRadius: 14,
                            overflow: 'hidden', cursor: 'zoom-in', maxWidth: '320px',
                            background: '#000', transition: 'transform 0.15s ease',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <img
                            src={slipUrl}
                            alt="payment-slip"
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                          />
                        </div>
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>* คลิกที่รูปเพื่อเปิดดูรูปสลิปขนาดเต็มในแท็บใหม่</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* SHOP REPORTS TAB */}
      {activeTab === 'shop_reports' && (() => {
        const cashierReports = shopReports.filter(r => (r.profiles as any)?.role === 'cashier' || (!(r.profiles as any)?.role && (r.profiles as any)?.role !== 'bar' && (r.profiles as any)?.role !== 'kitchen'))
        const barReports = shopReports.filter(r => (r.profiles as any)?.role === 'bar')
        const kitchenReports = shopReports.filter(r => (r.profiles as any)?.role === 'kitchen')
        return (
          <div className={selectedReport ? "grid grid-cols-1 lg:grid-cols-3 gap-5" : "grid grid-cols-1 lg:grid-cols-3 gap-5"}>
            {/* If selectedReport is set, we stack them in Column 1 (lg:col-span-1) */}
            {selectedReport ? (
              <div className="lg:col-span-1 space-y-5 hidden lg:block">
                {renderReportCard("รายงานความเรียบร้อยจาก Cashier", cashierReports, "#38bdf8", "linear-gradient(135deg,#0c4a6e,#38bdf8)", 200)}
                {renderReportCard("รายงานความเรียบร้อยจาก Bar", barReports, "#f59e0b", "linear-gradient(135deg,#78350f,#f59e0b)", 200)}
                {renderReportCard("รายงานความเรียบร้อยจาก Kitchen", kitchenReports, "#10b981", "linear-gradient(135deg,#064e3b,#10b981)", 200)}
              </div>
            ) : (
              <>
                {renderReportCard("รายงานความเรียบร้อยจาก Cashier", cashierReports, "#38bdf8", "linear-gradient(135deg,#0c4a6e,#38bdf8)", 600)}
                {renderReportCard("รายงานความเรียบร้อยจาก Bar", barReports, "#f59e0b", "linear-gradient(135deg,#78350f,#f59e0b)", 600)}
                {renderReportCard("รายงานความเรียบร้อยจาก Kitchen", kitchenReports, "#10b981", "linear-gradient(135deg,#064e3b,#10b981)", 600)}
              </>
            )}

            {/* Report detail panel (takes remaining space) */}
            {selectedReport && (
              <div className="lg:col-span-2" style={{ display: 'flex' }}>
                <div className="glass-card w-full" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
              </div>
            )}
          </div>
        )
      })()}
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
          { key: 'payments',      label: 'ชำระเงิน',     icon: <CreditCard size={18} />, badge: paymentsSales.filter(r => r.status === 'pending').length || null },
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
