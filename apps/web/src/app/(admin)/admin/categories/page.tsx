'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category } from '@/lib/types'
import {
  Archive,
  Check,
  Edit3,
  FolderPlus,
  Loader2,
  Package,
  Plus,
  Save,
  Tag,
  X,
} from 'lucide-react'

const EMPTY_CATEGORY: Partial<Category> = {
  name: '',
  description: '',
  icon: '',
  color: '#16a39b',
  sort_order: 0,
  is_active: true,
}

const SWATCHES = ['#16a39b', '#38bdf8', '#a78bfa', '#f2c65c', '#fb7185', '#fb923c']

type CategorySummary = Category & { productCount: number }

export default function CategoriesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Partial<Category> | null>(null)
  const [error, setError] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const visibleCategories = useMemo(
    () => categories.filter(category => showInactive || category.is_active),
    [categories, showInactive],
  )

  const loadCategories = useCallback(async () => {
    setLoading(true)
    const [{ data: categoryData }, { data: productData }] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('products').select('category_id'),
    ])

    const counts = new Map<string, number>()
    for (const product of productData || []) {
      if (product.category_id) counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1)
    }

    setCategories(
      ((categoryData as Category[]) || []).map(category => ({
        ...category,
        productCount: counts.get(category.id) || 0,
      })),
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadCategories() }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadCategories])

  const openEditor = (category?: CategorySummary) => {
    setError('')
    setDraft(category ? { ...category } : { ...EMPTY_CATEGORY, sort_order: categories.length + 1 })
  }

  const closeEditor = () => {
    if (!saving) setDraft(null)
  }

  const saveCategory = async () => {
    if (!draft?.name?.trim()) {
      setError('กรุณาระบุชื่อหมวดหมู่')
      return
    }

    setSaving(true)
    setError('')
    const payload = {
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      icon: draft.icon?.trim() || null,
      color: draft.color || '#16a39b',
      sort_order: Number(draft.sort_order) || 0,
      is_active: draft.is_active ?? true,
    }

    const result = draft.id
      ? await supabase.from('categories').update(payload).eq('id', draft.id)
      : await supabase.from('categories').insert(payload)

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setDraft(null)
    loadCategories()
  }

  const archiveCategory = async (category: CategorySummary) => {
    const action = category.is_active ? 'ซ่อน' : 'เปิดใช้งาน'
    if (!window.confirm(`${action}หมวดหมู่ “${category.name}” ?`)) return

    await supabase.from('categories').update({ is_active: !category.is_active }).eq('id', category.id)
    loadCategories()
  }

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: 1500 }}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold tracking-[0.12em]" style={{ color: 'var(--wine-300)' }}>CATALOG</p>
          <h1 className="admin-page-heading">หมวดหมู่สินค้า</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {categories.filter(category => category.is_active).length} หมวดหมู่ที่เปิดใช้งาน
          </p>
        </div>
        <button type="button" onClick={() => openEditor()} className="btn-wine gap-2">
          <Plus size={16} />
          เพิ่มหมวดหมู่
        </button>
      </div>

      <div className="mb-5 flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Tag size={16} style={{ color: 'var(--wine-300)' }} />
          <span>จัดระเบียบสินค้าเพื่อให้ค้นหาและขายได้เร็วขึ้น</span>
        </div>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: 'var(--border-color)', background: '#111d2d', color: 'var(--text-secondary)' }}
          onClick={() => setShowInactive(value => !value)}
        >
          <Archive size={14} />
          {showInactive ? 'ซ่อนรายการที่ปิด' : 'แสดงรายการที่ปิด'}
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center">
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--wine-400)' }} />
        </div>
      ) : visibleCategories.length === 0 ? (
        <div className="glass-card flex min-h-72 flex-col items-center justify-center px-5 text-center">
          <FolderPlus size={38} style={{ color: 'var(--wine-400)' }} />
          <p className="mt-4 text-base font-semibold text-white">ยังไม่มีหมวดหมู่สินค้า</p>
          <button type="button" onClick={() => openEditor()} className="btn-wine mt-5 gap-2 text-sm">
            <Plus size={15} />
            สร้างหมวดหมู่แรก
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCategories.map(category => (
            <article key={category.id} className="glass-card card-hover flex min-h-48 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl"
                    style={{ background: `${category.color}20`, color: category.color }}
                  >
                    {category.icon || <Tag size={19} />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-white">{category.name}</h2>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>ลำดับ {category.sort_order}</p>
                  </div>
                </div>
                <span
                  className="badge shrink-0"
                  style={category.is_active
                    ? { borderColor: 'rgba(47,198,181,.25)', background: 'rgba(47,198,181,.12)', color: 'var(--wine-300)' }
                    : { borderColor: 'rgba(148,163,184,.25)', background: 'rgba(148,163,184,.1)', color: '#aebdd0' }}
                >
                  {category.is_active ? 'ใช้งาน' : 'ปิด'}
                </span>
              </div>

              <p className="mt-5 line-clamp-2 min-h-10 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>
                {category.description || 'ยังไม่ได้ระบุรายละเอียด'}
              </p>

              <div className="mt-auto flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--border-color)' }}>
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Package size={15} style={{ color: 'var(--wine-300)' }} />
                  {category.productCount} สินค้า
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="admin-icon-button"
                    title={`แก้ไข ${category.name}`}
                    aria-label={`แก้ไข ${category.name}`}
                    onClick={() => openEditor(category)}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button"
                    title={category.is_active ? `ซ่อน ${category.name}` : `เปิด ${category.name}`}
                    aria-label={category.is_active ? `ซ่อน ${category.name}` : `เปิด ${category.name}`}
                    onClick={() => archiveCategory(category)}
                  >
                    <Archive size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(3, 8, 16, .76)', backdropFilter: 'blur(6px)' }}>
          <div className="glass-card w-full" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-labelledby="category-editor-title">
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
              <div>
                <p className="text-xs font-bold tracking-[0.12em]" style={{ color: 'var(--wine-300)' }}>CATALOG</p>
                <h2 id="category-editor-title" className="mt-1 text-lg font-bold text-white">
                  {draft.id ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}
                </h2>
              </div>
              <button type="button" className="admin-icon-button" title="ปิด" aria-label="ปิด" onClick={closeEditor}>
                <X size={17} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {error && (
                <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(251,113,133,.35)', background: 'rgba(251,113,133,.1)', color: '#fda4af' }}>
                  {error}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-[1fr_96px]">
                <label className="block text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  ชื่อหมวดหมู่
                  <input
                    autoFocus
                    className="wine-input mt-2"
                    value={draft.name || ''}
                    onChange={event => setDraft(current => current ? { ...current, name: event.target.value } : current)}
                    placeholder="เช่น Red Wine"
                  />
                </label>
                <label className="block text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  ไอคอน
                  <input
                    className="wine-input mt-2 text-center"
                    value={draft.icon || ''}
                    onChange={event => setDraft(current => current ? { ...current, icon: event.target.value } : current)}
                    placeholder="🍷"
                    maxLength={4}
                  />
                </label>
              </div>

              <label className="block text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                รายละเอียด
                <textarea
                  className="wine-input mt-2 min-h-24 resize-y"
                  value={draft.description || ''}
                  onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : current)}
                  placeholder="อธิบายประเภทสินค้านี้"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-[1fr_144px]">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>สีประจำหมวดหมู่</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SWATCHES.map(color => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`เลือกสี ${color}`}
                        title={color}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border"
                        style={{ borderColor: draft.color === color ? '#ffffff' : 'transparent', background: color }}
                        onClick={() => setDraft(current => current ? { ...current, color } : current)}
                      >
                        {draft.color === color && <Check size={15} color="#07111e" strokeWidth={3} />}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  ลำดับแสดงผล
                  <input
                    type="number"
                    min="0"
                    className="wine-input mt-2"
                    value={draft.sort_order ?? 0}
                    onChange={event => setDraft(current => current ? { ...current, sort_order: Number(event.target.value) } : current)}
                  />
                </label>
              </div>

              <button
                type="button"
                className="flex items-center gap-3 text-sm font-semibold"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setDraft(current => current ? { ...current, is_active: !current.is_active } : current)}
              >
                <span
                  className="relative h-6 w-10 rounded-full border transition-colors"
                  style={{ borderColor: draft.is_active ? 'rgba(47,198,181,.35)' : 'var(--border-color)', background: draft.is_active ? 'var(--wine-600)' : '#0d1726' }}
                >
                  <span
                    className="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform"
                    style={{ left: 3, height: 16, width: 16, transform: draft.is_active ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </span>
                เปิดใช้งานหมวดหมู่นี้
              </button>
            </div>

            <div className="flex justify-end gap-3 border-t px-5 py-4" style={{ borderColor: 'var(--border-color)' }}>
              <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }} onClick={closeEditor}>
                ยกเลิก
              </button>
              <button type="button" className="btn-wine gap-2" disabled={saving} onClick={saveCategory}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                บันทึกหมวดหมู่
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
