'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Category } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, Download, Package, AlertTriangle, RefreshCw,
  Search, Edit3, Loader2, Warehouse, FileText, Plus, Trash2, CheckCircle2,
  X, Image as ImageIcon
} from 'lucide-react'

export default function StockStaffDashboard() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'receive' | 'adjust' | 'check'>('receive')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Products & Categories
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  // Receive Stock Form
  const [recvSupplier, setRecvSupplier] = useState('')
  const [recvNote, setRecvNote] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [recvItems, setRecvItems] = useState<{ productId: string; qty: string; cost: string }[]>([
    { productId: '', qty: '', cost: '' }
  ])

  const startCamera = async () => {
    try {
      setSelectedPhoto(null)
      setPhotoPreview(null)
      setIsCameraActive(true)
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Back camera
        audio: false
      })
      
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // Wait for metadata to load then play
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error("Error playing video:", e))
        }
      }
    } catch (err: any) {
      console.error("Camera access error:", err)
      alert("ไม่สามารถเปิดกล้องได้: " + err.message + "\nกรุณาเลือกไฟล์รูปภาพแทน")
      setIsCameraActive(false)
    }
  }

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
  }, [])

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' })
            setSelectedPhoto(file)
            setPhotoPreview(URL.createObjectURL(file))
            stopCamera()
          }
        }, 'image/jpeg', 0.85)
      }
    }
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopCamera()
    const file = e.target.files?.[0]
    if (file) {
      setSelectedPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const clearPhoto = () => {
    stopCamera()
    setSelectedPhoto(null)
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview)
      setPhotoPreview(null)
    }
  }

  // Adjust Stock Form
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('ปรับปรุงสต๊อกสินค้าเสียหาย')

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    else setRefreshing(true)

    try {
      // Fetch Products & Categories
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from('products').select('*, categories(*)').order('name'),
        supabase.from('categories').select('*').order('sort_order')
      ])

      setProducts((prods || []) as Product[])
      setCategories(cats || [])
    } catch (err) {
      console.error('Error loading inventory data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData(true)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [loadData])

  // Helper: Generate Receipt Number
  const generateReceiptNo = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const rand = Math.floor(1000 + Math.random() * 9000)
    return `RC-${date}-${rand}`
  }

  // Handle adding rows to Receive Stock
  const addRecvItemRow = () => {
    setRecvItems(prev => [...prev, { productId: '', qty: '', cost: '' }])
  }

  const removeRecvItemRow = (index: number) => {
    if (recvItems.length === 1) return
    setRecvItems(prev => prev.filter((_, i) => i !== index))
  }

  const updateRecvItemRow = (index: number, field: 'productId' | 'qty' | 'cost', value: string) => {
    setRecvItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  // Submit Receive Stock Form
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate
    const validItems = recvItems.filter(item => item.productId && parseInt(item.qty) > 0 && parseFloat(item.cost) >= 0)
    if (validItems.length === 0) {
      alert('กรุณากรอกข้อมูลสินค้า จำนวนนำเข้า และราคาทุนให้ถูกต้องอย่างน้อย 1 รายการ')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้ล็อกอิน')

      const receiptNo = generateReceiptNo()

      // Upload photo if selected
      let imageUrl = null
      if (selectedPhoto) {
        const fileExt = selectedPhoto.name.split('.').pop()
        const fileName = `receipts/${receiptNo}_${Date.now()}.${fileExt}`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('slips')
          .upload(fileName, selectedPhoto)
        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('slips')
          .getPublicUrl(fileName)
        imageUrl = publicUrl
      }
      
      // Calculate total cost
      const totalCost = validItems.reduce((sum, item) => sum + (parseInt(item.qty) * parseFloat(item.cost)), 0)

      // 1. Insert into stock_receipts
      const { data: receipt, error: receiptErr } = await supabase
        .from('stock_receipts')
        .insert({
          receipt_no: receiptNo,
          supplier_name: recvSupplier.trim() || null,
          total_cost: totalCost,
          received_by: user.id,
          note: recvNote.trim() || null,
          image_url: imageUrl
        })
        .select()
        .single()

      if (receiptErr) throw receiptErr

      // 2. Insert into stock_receipt_items & Update stock & Log movement
      for (const item of validItems) {
        const qtyVal = parseInt(item.qty)
        const costVal = parseFloat(item.cost)
        const prod = products.find(p => p.id === item.productId)
        if (!prod) continue

        // Insert item details
        const { error: itemErr } = await supabase
          .from('stock_receipt_items')
          .insert({
            stock_receipt_id: receipt.id,
            product_id: item.productId,
            quantity: qtyVal,
            cost: costVal
          })
        if (itemErr) throw itemErr

        // Calculate new stock level
        const newStock = prod.stock + qtyVal

        // Update product stock
        const { error: prodErr } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.productId)
        if (prodErr) throw prodErr

        // Log movement
        const { error: moveErr } = await supabase
          .from('inventory_movements')
          .insert({
            product_id: item.productId,
            movement_type: 'in',
            quantity: qtyVal,
            quantity_before: prod.stock,
            quantity_after: newStock,
            reference_type: 'purchase',
            reference_id: receipt.id,
            note: recvNote.trim() ? `นำเข้า: ${recvNote.trim()}` : `รับสินค้าเข้าคลัง บิล #${receiptNo}`,
            created_by: user.id
          })
        if (moveErr) throw moveErr
      }

      alert(`บันทึกการรับสินค้าเข้าคลังสำเร็จ! เลขบิลใบรับของ: ${receiptNo}`)
      
      // Reset form
      setRecvSupplier('')
      setRecvNote('')
      clearPhoto()
      setRecvItems([{ productId: '', qty: '', cost: '' }])
      
      // Reload stock data
      await loadData(false)
    } catch (err: any) {
      alert('ไม่สามารถบันทึกรายการนำเข้าได้: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Submit Adjust Stock Form
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustProductId || !adjustQty) {
      alert('กรุณาเลือกสินค้าและป้อนจำนวนที่ปรับปรุง')
      return
    }

    const qtyVal = parseInt(adjustQty)
    if (isNaN(qtyVal) || qtyVal === 0) {
      alert('จำนวนการปรับปรุงสต๊อกต้องไม่ใช่ศูนย์')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ไม่พบข้อมูลผู้ใช้ล็อกอิน')

      const prod = products.find(p => p.id === adjustProductId)
      if (!prod) throw new Error('ไม่พบข้อมูลสินค้า')

      const newStock = Math.max(0, prod.stock + qtyVal)

      // Upload photo if selected
      let imageUrl = null
      if (selectedPhoto) {
        const fileExt = selectedPhoto.name.split('.').pop()
        const fileName = `adjustments/adj_${Date.now()}_${adjustProductId}.${fileExt}`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('slips')
          .upload(fileName, selectedPhoto)
        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('slips')
          .getPublicUrl(fileName)
        imageUrl = publicUrl
      }

      // Update product stock
      const { error: prodErr } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', adjustProductId)
      if (prodErr) throw prodErr

      // Log movement
      const { error: moveErr } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: adjustProductId,
          movement_type: 'adjust',
          quantity: qtyVal,
          quantity_before: prod.stock,
          quantity_after: newStock,
          reference_type: 'adjustment',
          note: adjustReason.trim(),
          created_by: user.id,
          image_url: imageUrl
        })
      if (moveErr) throw moveErr

      alert(`ปรับปรุงสต๊อกสินค้า "${prod.name}" เรียบร้อยแล้ว! (ยอดปัจจุบัน: ${newStock} ชิ้น)`)
      setAdjustProductId('')
      setAdjustQty('')
      setAdjustReason('ปรับปรุงสต๊อกสินค้าเสียหาย')
      clearPhoto()
      await loadData(false)
    } catch (err: any) {
      alert('ไม่สามารถทำการปรับปรุงสต๊อกได้: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Search Filter
  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q)
    return matchCat && matchSearch
  })

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <Loader2 size={42} className="animate-spin mb-4" style={{ color: '#fbbf24' }} />
        <p style={{ color: 'var(--text-secondary)' }}>กำลังเตรียมข้อมูลคลังสินค้า...</p>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">แผงควบคุมระบบพนักงานคลังสินค้า</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>ระบบรับของนำเข้า ปรับระดับคลังสินค้า และสแกนตรวจสอบระดับสต๊อก</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b mb-6 overflow-x-auto" style={{ borderColor: 'var(--border-color)', scrollbarWidth: 'none' }}>
        {[
          { key: 'receive', label: '📥 รับของนำเข้าคลัง', icon: <Download size={14} /> },
          { key: 'adjust', label: '🔧 ปรับปรุงสต๊อกสินค้า', icon: <Edit3 size={14} /> },
          { key: 'check', label: '🔍 ตรวจสอบยอดสต๊อก', icon: <Warehouse size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              clearPhoto()
              setActiveTab(tab.key as any)
            }}
            className="flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all relative shrink-0"
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #fbbf24' : '2px solid transparent',
              color: activeTab === tab.key ? 'white' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: RECEIVE STOCK */}
      {activeTab === 'receive' && (
        <div className="glass-card p-6 w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <FileText size={18} style={{ color: 'var(--gold-400)' }} />
            <h2 className="font-display text-lg font-bold text-white">บันทึกรับสินค้านำเข้าคลังสินค้าใหม่</h2>
          </div>

          <form onSubmit={handleReceiveStock} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>ผู้ผลิต / ผู้จัดส่ง (Supplier)</label>
                <input
                  type="text"
                  placeholder="เช่น ไวน์ อิมพอร์เตอร์ จำกัด"
                  value={recvSupplier}
                  onChange={e => setRecvSupplier(e.target.value)}
                  className="wine-input text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>โน้ตอ้างอิงนำเข้า (Note / Memo)</label>
                <input
                  type="text"
                  placeholder="ระบุ เช่น รอบนำเข้าสงกรานต์, เลขล็อต หรือหมายเหตุ"
                  value={recvNote}
                  onChange={e => setRecvNote(e.target.value)}
                  className="wine-input text-sm w-full"
                />
              </div>
            </div>

            {/* Camera Photo Upload & Live Viewfinder */}
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4">
              <span className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                📸 ถ่ายรูปใบเสร็จ / รูปสินค้าหลักฐานนำเข้า (หลักฐานการรับสินค้า)
              </span>

              {isCameraActive ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Viewfinder crosshairs decoration */}
                    <div style={{
                      position: 'absolute', inset: '20px',
                      border: '1px dashed rgba(255,255,255,0.15)',
                      pointerEvents: 'none', borderRadius: '8px'
                    }} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="pos-btn-gradient-blue"
                      style={{
                        padding: '10px 24px', borderRadius: 14,
                        fontSize: 13, fontWeight: 700, border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      กดถ่ายรูป 📸
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2 rounded-xl text-xs font-semibold border"
                      style={{
                        background: 'transparent', borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)', cursor: 'pointer'
                      }}
                    >
                      ปิดกล้อง
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex-1 w-full flex flex-col sm:flex-row gap-3">
                    {/* Direct Camera Button */}
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex-1 flex items-center justify-center gap-2 py-4 px-3 rounded-xl border border-dashed transition-all"
                      style={{
                        background: 'rgba(251,191,36,0.05)',
                        borderColor: 'rgba(251,191,36,0.3)',
                        color: '#fbbf24', cursor: 'pointer', fontSize: 13, fontWeight: 700
                      }}
                    >
                      <ImageIcon size={16} />
                      <span>เปิดกล้องถ่ายรูปทันที 📷</span>
                    </button>

                    {/* Standard File Upload */}
                    <div className="flex-1 flex flex-col justify-center">
                      <label className="block text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        หรือเลือกไฟล์รูปภาพจากคลังรูปภาพ
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="wine-input text-xs w-full cursor-pointer"
                        style={{ padding: '8px' }}
                      />
                    </div>
                  </div>

                  {/* Photo Preview */}
                  {photoPreview && (
                    <div className="relative w-36 h-24 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                      <img src={photoPreview} alt="Receipt Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                        style={{ border: 'none', cursor: 'pointer', lineHeight: 0 }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Receipt Items list */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-white">รายการสินค้านำเข้า</span>
                <button
                  type="button"
                  onClick={addRecvItemRow}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20 font-bold transition-all"
                  style={{ cursor: 'pointer' }}
                >
                  <Plus size={12} /> เพิ่มรายการสินค้า
                </button>
              </div>

              <div className="space-y-3">
                {recvItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 flex-wrap md:flex-nowrap items-end bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>เลือกสินค้าที่นำเข้า</label>
                      <select
                        value={item.productId}
                        onChange={e => updateRecvItemRow(idx, 'productId', e.target.value)}
                        required
                        className="wine-input text-xs w-full"
                      >
                        <option value="">-- เลือกสินค้า --</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} (ในสต๊อก: {p.stock} ขวด)</option>
                        ))}
                      </select>
                    </div>

                    <div className="w-24">
                      <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>จำนวนนำเข้า</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="0"
                        value={item.qty}
                        onChange={e => updateRecvItemRow(idx, 'qty', e.target.value)}
                        required
                        className="wine-input text-xs text-center w-full"
                      />
                    </div>

                    <div className="w-32">
                      <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>ราคาทุน/หน่วย (บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={item.cost}
                        onChange={e => updateRecvItemRow(idx, 'cost', e.target.value)}
                        required
                        className="wine-input text-xs text-center w-full"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRecvItemRow(idx)}
                      disabled={recvItems.length === 1}
                      className="p-2.5 rounded-lg border text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-all mb-0.5"
                      style={{ cursor: recvItems.length === 1 ? 'not-allowed' : 'pointer', opacity: recvItems.length === 1 ? 0.3 : 1 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ยอดราคาทุนรวมสุทธิ:{' '}
                <span className="font-bold text-white text-sm ml-1.5">
                  {formatCurrency(
                    recvItems.reduce(
                      (sum, item) => sum + (parseInt(item.qty) || 0) * (parseFloat(item.cost) || 0),
                      0
                    )
                  )}
                </span>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="btn-wine px-6 py-2.5 text-xs font-bold flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: 'white' }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {saving ? 'กำลังบันทึกรายการ...' : 'บันทึกบิลนำเข้าคลัง'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: ADJUST STOCK */}
      {activeTab === 'adjust' && (
        <div className="glass-card p-6 w-full max-w-xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Edit3 size={18} style={{ color: 'var(--gold-400)' }} />
            <h2 className="font-display text-lg font-bold text-white">แบบฟอร์มปรับปรุงจำนวนสินค้าชำรุดเสียหาย</h2>
          </div>

          <form onSubmit={handleAdjustStock} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>เลือกสินค้าที่ต้องการปรับปรุง</label>
              <select
                value={adjustProductId}
                onChange={e => setAdjustProductId(e.target.value)}
                required
                className="wine-input text-sm w-full"
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (สต๊อกปัจจุบัน: {p.stock} ชิ้น)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>จำนวนเปลี่ยนแปลงสต๊อก (ใส่เลขติดลบเพื่อระบุของชำรุด)</label>
              <input
                type="number"
                placeholder="เช่น -5 (สำหรับของพัง/ลดลง) หรือ 3 (สำหรับพบบวกเพิ่ม)"
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                required
                className="wine-input text-sm w-full"
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>*ตัวอย่าง: ใส่ `-2` เพื่อหักไวน์ชำรุดแตกเสียหาย 2 ขวดออกจากระบบ</p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>เหตุผลการปรับปรุงสต๊อก</label>
              <input
                type="text"
                placeholder="เช่น ขวดยี่ห้อฉลากฉีกขาด, ตรวจนับสต๊อกรอบเย็นแตกหัก"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                required
                className="wine-input text-sm w-full"
              />
            </div>

            {/* Camera Photo Upload & Live Viewfinder */}
            <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4">
              <span className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                📸 ถ่ายรูปภาพหลักฐานการปรับสต๊อกสินค้า (สินค้าเสียหาย/มีตำหนิ)
              </span>

              {isCameraActive ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{
                      position: 'absolute', inset: '20px',
                      border: '1px dashed rgba(255,255,255,0.15)',
                      pointerEvents: 'none', borderRadius: '8px'
                    }} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="pos-btn-gradient-blue"
                      style={{
                        padding: '10px 24px', borderRadius: 14,
                        fontSize: 13, fontWeight: 700, border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      กดถ่ายรูป 📸
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2 rounded-xl text-xs font-semibold border"
                      style={{
                        background: 'transparent', borderColor: 'var(--border-color)',
                        color: 'var(--text-secondary)', cursor: 'pointer'
                      }}
                    >
                      ปิดกล้อง
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex-1 w-full flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex-1 flex items-center justify-center gap-2 py-4 px-3 rounded-xl border border-dashed transition-all"
                      style={{
                        background: 'rgba(251,191,36,0.05)',
                        borderColor: 'rgba(251,191,36,0.3)',
                        color: '#fbbf24', cursor: 'pointer', fontSize: 13, fontWeight: 700
                      }}
                    >
                      <ImageIcon size={16} />
                      <span>เปิดกล้องถ่ายรูปทันที 📷</span>
                    </button>

                    <div className="flex-1 flex flex-col justify-center">
                      <label className="block text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        หรือเลือกไฟล์รูปภาพจากคลังรูปภาพ
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="wine-input text-xs w-full cursor-pointer"
                        style={{ padding: '8px' }}
                      />
                    </div>
                  </div>

                  {photoPreview && (
                    <div className="relative w-36 h-24 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                      <img src={photoPreview} alt="Receipt Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                        style={{ border: 'none', cursor: 'pointer', lineHeight: 0 }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full btn-wine py-3 text-sm font-bold flex items-center justify-center gap-2 mt-4"
              style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: 'white' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16} />}
              {saving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกการปรับสต๊อกสินค้า'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: CHECK INVENTORY */}
      {activeTab === 'check' && (
        <div className="glass-card p-5">
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="relative flex-1" style={{ minWidth: 240 }}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="ค้นหาตามชื่อสินค้า / SKU / บาร์โค้ด..."
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
                  {['รายละเอียดสินค้า', 'หมวดหมู่', 'รหัสบาร์โค้ด', 'ระดับต่ำสุด', 'สต๊อกคงเหลือ', 'สถานะคลัง'].map(h => (
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
                    <td className="p-3 text-sm font-mono" style={{ color: 'var(--text-muted)' }}>{p.barcode || '—'}</td>
                    <td className="p-3 text-sm text-center md:text-left" style={{ color: 'var(--text-muted)' }}>{p.min_stock} ชิ้น</td>
                    <td className="p-3 text-sm font-bold" style={{ color: p.stock <= p.min_stock ? '#fbbf24' : 'white' }}>{p.stock} ขวด</td>
                    <td className="p-3">
                      {p.stock === 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">สินค้าหมด (OUT)</span>
                      ) : p.stock <= p.min_stock ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-[#fbbf24] border border-amber-500/20">ใกล้หมด (LOW)</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">ปกติ (SAFE)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
