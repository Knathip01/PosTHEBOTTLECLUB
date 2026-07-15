'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Product, Category } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  Plus, Search, Edit2, Trash2, Wine, Loader2, X, Save,
  Upload, Image as ImageIcon, Camera, Tag
} from 'lucide-react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'

export default function ProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Discount config states
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [allowedDiscounts, setAllowedDiscounts] = useState<number[]>([10, 20, 30, 40, 50, 60, 70, 80, 90])
  const [customDiscountInput, setCustomDiscountInput] = useState('')
  const [savingDiscounts, setSavingDiscounts] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*, categories(name, icon)').order('name')
    ])
    setCategories(cats || [])
    setProducts(prods || [])
    
    // Fetch allowed discounts
    const { data: discountSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'allowed_discounts')
      .single()
    if (discountSetting?.value) {
      try {
        setAllowedDiscounts(JSON.parse(discountSetting.value))
      } catch (e) {
        console.error(e)
      }
    }
    setLoading(false)
  }

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
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err: any) {
      alert('บันทึกไม่สำเร็จ: ' + err.message)
    } finally {
      setSavingDiscounts(false)
    }
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return (catFilter === 'all' || p.category_id === catFilter) &&
      (!q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q))
  })

  const openEdit = (product?: Partial<Product>, defaultType?: 'wine' | 'food') => {
    let defaultCatId = undefined
    if (defaultType === 'wine') {
      const wineCat = categories.find(c => ['wine', 'ไวน์'].some(name => c.name.toLowerCase().includes(name)))
      if (wineCat) defaultCatId = wineCat.id
    } else if (defaultType === 'food') {
      const foodCat = categories.find(c => ['อาหาร', 'food', 'snack', 'ของทานเล่น'].some(name => c.name.toLowerCase().includes(name)))
      if (foodCat) defaultCatId = foodCat.id
    }

    const p = product || {
      name: '', sku: '', barcode: '', price: 0, cost: 0, stock: 0, min_stock: 5,
      country: '', region: '', brand: '', grape: '', vintage: '',
      alcohol_percent: undefined, volume_ml: 750, is_active: true, category_id: defaultCatId, image_url: ''
    }
    setEditingProduct(p)
    setPreviewUrl(p.image_url || null)
  }

  // Upload image to Supabase Storage
  const handleImageUpload = async (file: File) => {
    if (!file) return
    setUploading(true)

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)

    const ext = file.name.split('.').pop()
    const fileName = `product_${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('products')
      .upload(fileName, file, { upsert: true, contentType: file.type })

    if (error) {
      alert('อัพโหลดรูปไม่สำเร็จ: ' + error.message)
      setPreviewUrl(editingProduct?.image_url || null)
    } else {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/products/${data.path}`
      setEditingProduct(prev => prev ? { ...prev, image_url: publicUrl } : prev)
      setPreviewUrl(publicUrl)
    }
    setUploading(false)
  }

  const handleSave = async () => {
    if (!editingProduct?.name) return
    setSaving(true)

    const payload = { ...editingProduct }
    delete (payload as Record<string, unknown>).categories

    // Omit wine fields if it is a food/snack category to keep database records clean
    if (!isWineCategory) {
      delete payload.country
      delete payload.region
      delete payload.winery
      delete payload.grape
      delete payload.vintage
      delete payload.alcohol_percent
      delete payload.volume_ml
    }

    if (editingProduct.id) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id)
    } else {
      if (!payload.sku) {
        payload.sku = `PRD-${Date.now().toString().slice(-6)}`
      }
      if (!payload.barcode) {
        payload.barcode = `885${Date.now().toString().slice(-10)}`
      }
      await supabase.from('products').insert(payload)
    }
    setSaving(false)
    setEditingProduct(null)
    setPreviewUrl(null)
    loadData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ยืนยันการลบสินค้านี้ถาวร?')) return
    
    // Try to delete permanently first
    const { error } = await supabase.from('products').delete().eq('id', id)
    
    if (error) {
      // If it fails (due to foreign keys), fall back to deactivating it
      console.warn('Hard delete failed, deactivating product instead:', error)
      const { error: updateError } = await supabase.from('products').update({ is_active: false }).eq('id', id)
      if (updateError) {
        alert('ไม่สามารถลบสินค้าได้: ' + updateError.message)
      } else {
        alert('สินค้านี้มีประวัติการขายอยู่ในระบบ จึงไม่สามารถลบถาวรได้ ระบบได้ทำการเปลี่ยนสถานะเป็น "หยุดขาย" แทน')
      }
    } else {
      alert('ลบสินค้าสำเร็จ')
    }
    loadData()
  }

  const getCategoryDisplay = (p: Product) => {
    const cat = (p.categories as unknown as { name: string; icon?: string } | null)
    return cat ? `${cat.icon || ''} ${cat.name}` : '-'
  }

  const selectedCategoryName = categories.find(c => c.id === editingProduct?.category_id)?.name || ''
  const isWineCategory = !editingProduct?.category_id || ['wine', 'rosé', 'sparkling', 'champagne', 'ไวน์'].some(name => selectedCategoryName.toLowerCase().includes(name))

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: '1500px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-1">จัดการสินค้า</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{products.filter(p => p.is_active).length} รายการที่ขายอยู่</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => openEdit(undefined, 'wine')} className="btn-wine flex items-center gap-2 px-4 py-2.5">
            <Plus size={16} />เพิ่มสินค้า Wine
          </button>
          <button onClick={() => openEdit(undefined, 'food')} className="btn-wine flex items-center gap-2 px-4 py-2.5" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 15px rgba(16,185,129,0.3)' }}>
            <Plus size={16} />เพิ่มอาหาร
          </button>
          <button onClick={() => setShowDiscountModal(true)} className="btn-wine flex items-center gap-2 px-4 py-2.5" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 15px rgba(59,130,246,0.3)' }}>
            <Tag size={16} />ตั้งค่าปุ่มส่วนลด
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: '200px' }}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input className="wine-input pl-9 text-sm" placeholder="ค้นหาชื่อ / SKU / แบรนด์..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="wine-input text-sm" style={{ width: 'auto', minWidth: '160px' }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="all">ทุกหมวดหมู่</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      {/* Product Grid + Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={{ color: 'var(--wine-400)' }} /></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['รูป', 'ชื่อสินค้า', 'หมวดหมู่', 'ราคา', 'ต้นทุน', 'สต๊อก', 'สถานะ', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    {/* Product Image */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: 'rgba(139,26,44,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Wine size={20} style={{ color: 'var(--wine-500)', opacity: 0.5 }} />
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {(() => {
                          const catName = (p.categories as any)?.name || ''
                          const isWine = ['wine', 'rosé', 'sparkling', 'champagne', 'ไวน์'].some(name => catName.toLowerCase().includes(name))
                          return [p.sku, isWine ? [p.vintage, p.grape].filter(Boolean).join(' · ') : p.brand].filter(Boolean).join(' · ')
                        })()}
                      </p>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className="badge text-xs" style={{ background: 'rgba(139,26,44,0.15)', color: 'var(--wine-200)', borderColor: 'rgba(139,26,44,0.2)' }}>
                        {getCategoryDisplay(p)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--gold-400)' }}>{formatCurrency(p.price)}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(p.cost)}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className={`text-sm font-medium`} style={{ color: p.stock === 0 ? '#ef4444' : p.stock <= p.min_stock ? '#f59e0b' : '#4ade80' }}>
                        {p.stock} ชิ้น/ขวด
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className="badge text-xs"
                        style={p.is_active
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.3)' }
                          : { background: 'rgba(239,68,68,0.15)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}>
                        {p.is_active ? 'ขายอยู่' : 'หยุดขาย'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg"
                          style={{ color: 'var(--text-muted)', transition: 'all 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold-400)'; (e.currentTarget as HTMLElement).style.background = 'rgba(212,175,55,0.1)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg"
                          style={{ color: 'var(--text-muted)', transition: 'all 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
                <Wine size={40} className="mx-auto mb-3 opacity-30" />
                <p>ไม่พบสินค้า</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Edit / Add Modal ─── */}
      {editingProduct && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="glass-card w-full" style={{ maxWidth: '720px', maxHeight: '92vh', overflow: 'auto', margin: '16px' }}>

              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <h2 className="font-display text-xl font-bold text-white">
                  {editingProduct.id ? 'แก้ไขสินค้า' : isWineCategory ? 'เพิ่มสินค้า Wine' : 'เพิ่มอาหาร'}
                </h2>
                <button onClick={() => { setEditingProduct(null); setPreviewUrl(null) }}>
                <X size={20} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <div className="p-6">
              {/* ── Image Upload Section ── */}
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--gold-400)' }}>
                  📸 รูปภาพสินค้า
                </label>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Preview */}
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    style={{
                      width: 120, height: 120, borderRadius: 16,
                      background: previewUrl ? 'transparent' : 'rgba(139,26,44,0.1)',
                      border: `2px dashed ${previewUrl ? 'var(--wine-500)' : 'var(--border-color)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: uploading ? 'not-allowed' : 'pointer', overflow: 'hidden',
                      transition: 'all 0.2s', flexShrink: 0, position: 'relative'
                    }}
                    onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.borderColor = 'var(--wine-400)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = previewUrl ? 'var(--wine-500)' : 'var(--border-color)' }}
                  >
                    {uploading ? (
                      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--wine-400)' }} />
                    ) : previewUrl ? (
                      <>
                        <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}>
                          <Camera size={24} color="white" />
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        <ImageIcon size={28} style={{ margin: '0 auto 6px', opacity: 0.5 }} />
                        <p style={{ fontSize: 10 }}>คลิกอัพโหลด</p>
                      </div>
                    )}
                  </div>

                  {/* Upload controls */}
                  <div style={{ flex: 1 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mb-3"
                      style={{ background: 'rgba(139,26,44,0.2)', border: '1px solid rgba(139,26,44,0.3)', color: 'var(--wine-200)', cursor: 'pointer' }}>
                      <Upload size={14} />
                      {uploading ? 'กำลังอัพโหลด...' : 'เลือกรูปภาพ'}
                    </button>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      รองรับ JPG, PNG, WEBP<br />
                      ขนาดแนะนำ 800×800px หรือสี่เหลี่ยมจัตุรัส
                    </p>
                    {previewUrl && (
                      <button
                        onClick={() => { setPreviewUrl(null); setEditingProduct(prev => prev ? { ...prev, image_url: '' } : prev) }}
                        style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}>
                        ✕ ลบรูป
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Form Fields Grid ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

                {/* Name - full width */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ชื่อสินค้า *</label>
                  <input className="wine-input" placeholder="เช่น Premium Ribeye Steak หรือ Château Margaux" value={editingProduct.name || ''} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                </div>
                {isWineCategory && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>SKU</label>
                      <input className="wine-input text-sm" placeholder="FD-001 หรือ WN-001" value={editingProduct.sku || ''} onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Barcode</label>
                      <input className="wine-input text-sm" placeholder="8850000000000" value={editingProduct.barcode || ''} onChange={e => setEditingProduct({ ...editingProduct, barcode: e.target.value })} />
                    </div>
                  </>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>หมวดหมู่</label>
                  <select className="wine-input text-sm" value={editingProduct.category_id || ''} onChange={e => setEditingProduct({ ...editingProduct, category_id: e.target.value })}>
                    <option value="">-- เลือกหมวดหมู่ --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ราคาขาย (บาท) *</label>
                  <input type="number" className="wine-input text-sm" min="0" step="1" value={editingProduct.price || 0} onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ต้นทุน (บาท)</label>
                  <input type="number" className="wine-input text-sm" min="0" step="1" value={editingProduct.cost || 0} onChange={e => setEditingProduct({ ...editingProduct, cost: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>สต๊อก (ชิ้น/ขวด)</label>
                  <input type="number" className="wine-input text-sm" min="0" value={editingProduct.stock || 0} onChange={e => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>แจ้งเตือนเมื่อต่ำกว่า</label>
                  <input type="number" className="wine-input text-sm" min="0" value={editingProduct.min_stock || 5} onChange={e => setEditingProduct({ ...editingProduct, min_stock: parseInt(e.target.value) || 0 })} />
                </div>

                {/* Wine-specific fields (Rendered conditionally) */}
                {isWineCategory && (
                  <>
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--gold-400)' }}>🍷 ข้อมูลเฉพาะไวน์</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ประเทศ</label>
                      <input className="wine-input text-sm" placeholder="France" value={editingProduct.country || ''} onChange={e => setEditingProduct({ ...editingProduct, country: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ภูมิภาค</label>
                      <input className="wine-input text-sm" placeholder="Bordeaux" value={editingProduct.region || ''} onChange={e => setEditingProduct({ ...editingProduct, region: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>แบรนด์</label>
                      <input className="wine-input text-sm" placeholder="Château Margaux" value={editingProduct.brand || ''} onChange={e => setEditingProduct({ ...editingProduct, brand: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Winery</label>
                      <input className="wine-input text-sm" placeholder="Margaux AOC" value={editingProduct.winery || ''} onChange={e => setEditingProduct({ ...editingProduct, winery: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>พันธุ์องุ่น</label>
                      <input className="wine-input text-sm" placeholder="Cabernet Sauvignon" value={editingProduct.grape || ''} onChange={e => setEditingProduct({ ...editingProduct, grape: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ปีผลิต (Vintage)</label>
                      <input className="wine-input text-sm" placeholder="2020" value={editingProduct.vintage || ''} onChange={e => setEditingProduct({ ...editingProduct, vintage: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Alcohol (%)</label>
                      <input type="number" step="0.1" min="0" max="100" className="wine-input text-sm" placeholder="13.5" value={editingProduct.alcohol_percent || ''} onChange={e => setEditingProduct({ ...editingProduct, alcohol_percent: parseFloat(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>ปริมาณ (ml)</label>
                      <select className="wine-input text-sm" value={editingProduct.volume_ml || 750} onChange={e => setEditingProduct({ ...editingProduct, volume_ml: parseInt(e.target.value) })}>
                        {[187, 375, 500, 750, 1000, 1500, 3000].map(v => <option key={v} value={v}>{v} ml{v === 750 ? ' (มาตรฐาน)' : ''}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {/* Description */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>คำอธิบาย</label>
                  <textarea className="wine-input text-sm" rows={3} placeholder="รายละเอียดสินค้า..." value={editingProduct.description || ''} onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })} style={{ resize: 'vertical' }} />
                </div>

                {/* Status toggle */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ color: 'var(--text-secondary)', fontSize: 13 }}>สถานะ:</label>
                  <button
                    onClick={() => setEditingProduct({ ...editingProduct, is_active: !editingProduct.is_active })}
                    style={{
                      padding: '6px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                      background: editingProduct.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: editingProduct.is_active ? '#4ade80' : '#f87171',
                      borderColor: editingProduct.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'
                    }}>
                    {editingProduct.is_active ? '✓ ขายอยู่' : '✕ หยุดขาย'}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setEditingProduct(null); setPreviewUrl(null) }} className="flex-1 py-3 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  ยกเลิก
                </button>
                <button onClick={handleSave} disabled={saving || uploading || !editingProduct.name}
                  className="flex-1 btn-wine py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ opacity: (!editingProduct.name || saving) ? 0.6 : 1 }}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Discount Config Modal ─── */}
      {showDiscountModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="glass-card w-full" style={{ maxWidth: '520px', margin: '16px' }}>
            <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <Tag size={20} style={{ color: 'var(--wine-400)' }} />
                ตั้งค่าปุ่มส่วนลดสินค้าสำหรับเครื่อง POS
              </h2>
              <button onClick={() => setShowDiscountModal(false)}>
                <X size={20} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                เลือกเปิดใช้งานเปอร์เซ็นต์ส่วนลดมาตรฐาน หรือเพิ่มส่วนลดใหม่ เพื่อให้พนักงานหน้าร้านกดเลือกใช้งานได้ทันที
              </p>
              
              {/* Presets Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(pct => {
                  const isChecked = allowedDiscounts.includes(pct)
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        const updated = isChecked
                          ? allowedDiscounts.filter(x => x !== pct)
                          : [...allowedDiscounts, pct]
                        handleSaveDiscounts(updated)
                      }}
                      style={{
                        padding: '12px 0',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 700,
                        border: '1px solid',
                        background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                        borderColor: isChecked ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-color)',
                        color: isChecked ? '#60a5fa' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                        cursor: 'pointer'
                      }}
                    >
                      ลด {pct}%
                    </button>
                  )
                })}
              </div>

              {/* Custom Discounts List */}
              <div className="border-t pt-4 mb-4" style={{ borderColor: 'var(--border-color)' }}>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  ส่วนลดแบบกำหนดเองที่มีอยู่:
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {allowedDiscounts.filter(pct => ![10,20,30,40,50,60,70,80,90].includes(pct)).map(pct => (
                    <span
                      key={pct}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border-color)' }}
                    >
                      ลด {pct}%
                      <button
                        onClick={() => {
                          const updated = allowedDiscounts.filter(x => x !== pct)
                          handleSaveDiscounts(updated)
                        }}
                        style={{ color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', padding: '0 2px', background: 'none', border: 'none' }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {allowedDiscounts.filter(pct => ![10,20,30,40,50,60,70,80,90].includes(pct)).length === 0 && (
                    <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>ไม่มี</span>
                  )}
                </div>

                {/* Add Custom Discount */}
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="ระบุเปอร์เซ็นต์ (เช่น 15, 25)"
                    className="wine-input text-xs pl-3"
                    style={{ flex: 1, height: 38 }}
                    value={customDiscountInput}
                    onChange={e => setCustomDiscountInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = parseInt(customDiscountInput)
                        if (val > 0 && val <= 100 && !allowedDiscounts.includes(val)) {
                          handleSaveDiscounts([...allowedDiscounts, val])
                          setCustomDiscountInput('')
                        }
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const val = parseInt(customDiscountInput)
                      if (val > 0 && val <= 100 && !allowedDiscounts.includes(val)) {
                        handleSaveDiscounts([...allowedDiscounts, val])
                        setCustomDiscountInput('')
                      } else {
                        alert('กรุณากรอกตัวเลขระหว่าง 1 ถึง 100 และไม่เป็นค่าซ้ำ')
                      }
                    }}
                    className="btn-wine text-xs px-4"
                    style={{ height: 38, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer' }}
                  >
                    เพิ่มปุ่ม
                  </button>
                </div>
              </div>

              {saveSuccess && (
                <p className="text-xs text-center text-green-400 font-semibold mb-2">✓ บันทึกสำเร็จ</p>
              )}

              {/* Close Button */}
              <button
                onClick={() => setShowDiscountModal(false)}
                className="w-full btn-wine py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, var(--wine-600), var(--wine-800))', cursor: 'pointer' }}
              >
                {savingDiscounts ? <Loader2 size={16} className="animate-spin" /> : 'ปิดการตั้งค่า'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
