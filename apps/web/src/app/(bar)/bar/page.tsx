'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sale } from '@/lib/types'
import {
  Clock, Wine, Play, CheckCircle, RefreshCw, LogOut,
  Loader2, ClipboardList, Camera, X, Image as ImageIcon,
  AlertTriangle, Bell
} from 'lucide-react'
import { useRouter } from 'next/navigation'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyCategory(catName?: string): 'kitchen' | 'bar' {
  if (!catName) return 'kitchen'
  const name = catName.toLowerCase()
  const barKeywords = ['wine', 'beer', 'drink', 'beverage', 'bar', 'ไวน์', 'เบียร์', 'เครื่องดื่ม', 'rosé', 'sparkling', 'champagne', 'dessert']
  return barKeywords.some(kw => name.includes(kw)) ? 'bar' : 'kitchen'
}

function parsePrepStatus(note?: string | null) {
  const res = { kitchen: 'pending', bar: 'pending', cleanNote: note || '', slipUrl: '', isServed: false }
  if (!note) return res
  if (note.includes(' | SERVED')) { res.isServed = true; res.cleanNote = note.replace(' | SERVED', '') }
  else if (note === 'SERVED') { res.isServed = true; res.cleanNote = '' }
  const parts = res.cleanNote.split(' | SLIP:')
  if (parts.length > 1) { res.cleanNote = parts[0].trim(); res.slipUrl = parts[1].trim() }
  else if (res.cleanNote.startsWith('SLIP:')) { res.slipUrl = res.cleanNote.replace('SLIP:', '').trim(); res.cleanNote = '' }
  const km = res.cleanNote.match(/\[KITCHEN:(\w+)\]/)
  const bm = res.cleanNote.match(/\[BAR:(\w+)\]/)
  if (km) { res.kitchen = km[1]; res.cleanNote = res.cleanNote.replace(/\[KITCHEN:\w+\]/g, '').trim() }
  if (bm) { res.bar = bm[1]; res.cleanNote = res.cleanNote.replace(/\[BAR:\w+\]/g, '').trim() }
  return res
}

function buildUpdatedNote(originalNote: string | null, kitchenStatus: string, barStatus: string, isServed: boolean) {
  let { cleanNote, slipUrl } = parsePrepStatus(originalNote)
  let newNote = `${cleanNote.trim()} [KITCHEN:${kitchenStatus}][BAR:${barStatus}]`.trim()
  if (slipUrl) newNote = `${newNote} | SLIP:${slipUrl}`
  if (isServed) newNote = `${newNote} | SERVED`
  return newNote
}

function getElapsed(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (mins < 1) return 'เมื่อครู่'
  return `${mins} นาที`
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending:    { label: '⏳ รอเตรียม',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    preparing:  { label: '🍸 กำลังชง',  color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
    ready:      { label: '✅ พร้อมเสิร์ฟ', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: s.color,
      background: s.bg, padding: '3px 9px', borderRadius: 999
    }}>{s.label}</span>
  )
}

// ─── Order Card ────────────────────────────────────────────────────────────────
interface OrderCardProps {
  sale: Sale
  onAction: (id: string, next: 'preparing' | 'ready') => void
  updating: boolean
}
function OrderCard({ sale, onAction, updating }: OrderCardProps) {
  const { bar: bStatus, cleanNote } = parsePrepStatus(sale.note)
  const barItems = (sale.sale_items as any[])?.filter((item: any) =>
    classifyCategory(item.products?.categories?.name) === 'bar'
  ) || []

  const isPreparing = bStatus === 'preparing'
  const isReady = bStatus === 'ready'
  const elapsedMin = Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 60000)
  const isUrgent = elapsedMin >= 10 && !isReady

  const borderColor = isUrgent ? 'rgba(239,68,68,0.5)' : isPreparing ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.07)'
  const headerBg   = isUrgent ? 'rgba(239,68,68,0.08)' : isPreparing ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.02)'

  return (
    <div style={{
      background: '#12151c', border: `1px solid ${borderColor}`, borderRadius: 18,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: isUrgent ? '0 0 24px rgba(239,68,68,0.12)' : isPreparing ? '0 0 20px rgba(56,189,248,0.08)' : 'none',
      transition: 'all 250ms'
    }}>
      {/* Card header */}
      <div style={{ padding: '12px 14px', background: headerBg, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: isUrgent ? '#ef4444' : '#f1f3f7' }}>
              {sale.table_no ? `🍽️ โต๊ะ ${sale.table_no}` : '🛍️ กลับบ้าน'}
            </span>
            {sale.status === 'pending' && (
              <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 7px', borderRadius: 4, fontWeight: 700 }}>
                ยังไม่ชำระ
              </span>
            )}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>#{sale.receipt_no.slice(-6)}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <StatusBadge status={bStatus} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: isUrgent ? '#ef4444' : '#6b7280' }}>
            <Clock size={10} />
            <span>{getElapsed(sale.created_at)}</span>
            {isUrgent && <AlertTriangle size={10} />}
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {barItems.map((item: any) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(216,169,60,0.1)', border: '1px solid rgba(216,169,60,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 900, color: '#f2c65c', flexShrink: 0
            }}>
              {item.quantity}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.product_name}
              </p>
              {item.sku && <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>SKU: {item.sku}</p>}
            </div>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🍸</span>
          </div>
        ))}
        {cleanNote && (
          <div style={{ padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, fontSize: 12, color: '#f59e0b' }}>
            📝 {cleanNote}
          </div>
        )}
      </div>

      {/* Action button */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.1)' }}>
        {isReady ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px', borderRadius: 12, background: 'rgba(74,222,128,0.08)',
            border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 14, fontWeight: 700
          }}>
            <CheckCircle size={16} /> พร้อมเสิร์ฟแล้ว 🎉
          </div>
        ) : (
          <button
            onClick={() => onAction(sale.id, isPreparing ? 'ready' : 'preparing')}
            disabled={updating}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 14, fontWeight: 800, cursor: updating ? 'not-allowed' : 'pointer',
              background: isPreparing
                ? 'linear-gradient(135deg,#16a34a,#22c55e)'
                : 'linear-gradient(135deg,#d8a93c,#f2c65c)',
              color: isPreparing ? 'white' : '#1a0f00',
              opacity: updating ? 0.7 : 1,
              transition: 'all 150ms',
              boxShadow: isPreparing ? '0 4px 16px rgba(34,197,94,0.3)' : '0 4px 16px rgba(242,198,92,0.25)'
            }}
          >
            {updating ? <Loader2 size={16} className="animate-spin" /> :
              isPreparing ? <><CheckCircle size={16} /> เตรียมเสร็จแล้ว (พร้อมเสิร์ฟ)</> :
              <><Play size={16} /> เริ่มชง / เตรียมเครื่องดื่ม</>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Report Modal ──────────────────────────────────────────────────────────────
function ReportModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const [title, setTitle] = useState('รายงานความเรียบร้อยบาร์เครื่องดื่ม')
  const [note, setNote] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }, [])

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  const startCamera = async () => {
    try {
      setCameraActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(console.error)
      }
    } catch (err: any) {
      alert('ไม่สามารถเปิดกล้องได้: ' + err.message)
      setCameraActive(false)
    }
  }

  const capture = () => {
    if (!videoRef.current) return
    const v = videoRef.current
    const c = document.createElement('canvas')
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
    setImages(p => [...p, c.toDataURL('image/jpeg', 0.85)].slice(0, 5))
    stopCamera()
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopCamera()
    Array.from(e.target.files || []).slice(0, 5 - images.length).forEach(f => {
      const r = new FileReader()
      r.onload = ev => { if (ev.target?.result) setImages(p => [...p, ev.target!.result as string]) }
      r.readAsDataURL(f)
    })
  }

  const submit = async () => {
    if (!title.trim()) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('shop_reports').insert({
        title: title.trim(), note: note.trim() || null,
        images: images.length > 0 ? images : null,
        reported_by: user?.id || null, status: 'pending'
      })
      if (error) throw error
      setSuccess(true)
      setTimeout(() => { setSuccess(false); onClose() }, 1800)
    } catch (err: any) {
      alert('ส่งรายงานไม่สำเร็จ: ' + err.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{
        background: '#12151c', borderRadius: '24px 24px 0 0',
        border: '1px solid rgba(255,255,255,0.08)',
        width: '100%', maxWidth: 600, maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 999, margin: '12px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
              <ClipboardList size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'white' }}>ส่งรายงานบาร์</h3>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>รายงานความเรียบร้อยหน้าร้าน</p>
            </div>
          </div>
          <button onClick={() => { stopCamera(); onClose() }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {success ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80' }}>
                <CheckCircle size={36} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 6px', color: 'white', fontSize: 18, fontWeight: 800 }}>ส่งรายงานสำเร็จ! ✅</h4>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>ข้อมูลถูกส่งไปยังผู้จัดการแล้ว</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', display: 'block', marginBottom: 6 }}>หัวข้อรายงาน *</label>
                <input
                  value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="เช่น ความเรียบร้อยบาร์, ขวดแตก..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {/* Note */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', display: 'block', marginBottom: 6 }}>รายละเอียดเพิ่มเติม</label>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)}
                  rows={3} placeholder="อธิบายรายละเอียดเพิ่มเติม..."
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {/* Images */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', display: 'block', marginBottom: 10 }}>📸 แนบภาพ (สูงสุด 5 รูป)</label>
                {cameraActive ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000', borderRadius: 14, overflow: 'hidden' }}>
                      <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', inset: 16, border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 8, pointerEvents: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={capture} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        📸 ถ่ายภาพ
                      </button>
                      <button onClick={stopCamera} style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {images.map((img, i) => (
                      <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <img src={img} alt="img" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => setImages(p => p.filter((_, idx) => idx !== i))}
                          style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, background: '#ef4444', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                    {images.length < 5 && (<>
                      <button onClick={startCamera} style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.04)', color: '#38bdf8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                        <Camera size={20} />
                        <span style={{ fontSize: 9, fontWeight: 700 }}>กล้อง</span>
                      </button>
                      <button onClick={() => fileRef.current?.click()} style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                        <ImageIcon size={20} />
                        <span style={{ fontSize: 9, fontWeight: 700 }}>อัปโหลด</span>
                      </button>
                    </>)}
                    <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFile} style={{ display: 'none' }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <button
              onClick={submit}
              disabled={!title.trim() || loading}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: title.trim() && !loading ? 'linear-gradient(135deg,#0ea5e9,#0284c7)' : 'rgba(255,255,255,0.04)',
                color: title.trim() && !loading ? 'white' : '#6b7280',
                fontSize: 15, fontWeight: 800,
                cursor: title.trim() && !loading ? 'pointer' : 'not-allowed',
                boxShadow: title.trim() && !loading ? '0 6px 20px rgba(14,165,233,0.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : '📤 ส่งรายงาน'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function BarDisplayPage() {
  const supabase = createClient()
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all')

  const loadOrders = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true); else setRefreshing(true)
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`*, sale_items(*, products(category_id, categories(name)))`)
        .in('status', ['paid', 'pending'])
        .order('created_at', { ascending: true })
      if (error) throw error
      const activeSales = (data || []).filter((sale: any) => {
        const { isServed } = parsePrepStatus(sale.note)
        if (isServed) return false
        return sale.sale_items?.some((item: any) => classifyCategory(item.products?.categories?.name) === 'bar')
      })
      setSales(activeSales as Sale[])
    } catch (err) { console.error('Error:', err) }
    finally { setLoading(false); setRefreshing(false) }
  }, [supabase])

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
      if (!prof || !['bar', 'super_admin', 'manager', 'cashier'].includes(prof.role)) {
        router.push(prof?.role === 'kitchen' ? '/kitchen' : prof?.role === 'stock_staff' ? '/stockstaff' : '/login')
        return
      }
      setProfile({ full_name: prof.full_name || 'Bar', role: prof.role })
    }
    checkAccess()
  }, [supabase, router])

  useEffect(() => {
    loadOrders(true)
    const t = setInterval(() => loadOrders(false), 5000)
    return () => clearInterval(t)
  }, [loadOrders])

  const handleUpdateStatus = async (saleId: string, nextStatus: 'preparing' | 'ready') => {
    setUpdatingId(saleId)
    try {
      const { data: sale } = await supabase.from('sales').select('*').eq('id', saleId).single()
      if (!sale) return
      const { kitchen, isServed } = parsePrepStatus(sale.note)
      await supabase.from('sales').update({ note: buildUpdatedNote(sale.note, kitchen, nextStatus, isServed) }).eq('id', saleId)
      await loadOrders(false)
    } catch (err) { console.error(err) }
    finally { setUpdatingId(null) }
  }

  const handleLogout = async () => {
    if (confirm('ยืนยันออกจากระบบ?')) { await supabase.auth.signOut(); router.push('/login') }
  }

  // Counts
  const counts = { all: sales.length, pending: 0, preparing: 0, ready: 0 }
  sales.forEach(s => { const { bar } = parsePrepStatus(s.note); if (bar === 'pending') counts.pending++; else if (bar === 'preparing') counts.preparing++; else if (bar === 'ready') counts.ready++ })

  const filteredSales = filter === 'all' ? sales : sales.filter(s => parsePrepStatus(s.note).bar === filter)

  const tabs: { key: typeof filter; label: string; count: number; color: string }[] = [
    { key: 'all',       label: 'ทั้งหมด',    count: counts.all,       color: '#9ca3af' },
    { key: 'pending',   label: '⏳ รอเตรียม', count: counts.pending,   color: '#fbbf24' },
    { key: 'preparing', label: '🍸 กำลังชง',  count: counts.preparing, color: '#38bdf8' },
    { key: 'ready',     label: '✅ พร้อมส่ง', count: counts.ready,     color: '#4ade80' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: '#08090d', color: 'white', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: 'rgba(10,12,16,0.97)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(20px)',
        gap: 10, flexShrink: 0
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(216,169,60,0.12)', border: '1px solid rgba(216,169,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f2c65c', flexShrink: 0 }}>
            <Wine size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Bar Display 🍸</h1>
            <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>The Bottle Club</p>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {refreshing && <RefreshCw size={13} className="animate-spin" style={{ color: '#6b7280' }} />}

          <button onClick={() => setShowReport(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)',
            borderRadius: 20, color: '#38bdf8', fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>
            <ClipboardList size={13} />
            <span className="hidden sm:inline" style={{ display: 'none' }}>ส่งรายงาน</span>
            <style>{`.sm-show { display: inline; }  @media (min-width: 480px) { .sm-show { display: inline !important; } }`}</style>
          </button>

          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(216,169,60,0.08)', border: '1px solid rgba(216,169,60,0.2)', borderRadius: 24, padding: '4px 10px 4px 5px' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#d8a93c,#f2c65c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#1a0f00', flexShrink: 0 }}>
                {(profile.full_name || 'B')[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.full_name}
              </span>
            </div>
          )}

          <button onClick={handleLogout} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      <div style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999, flexShrink: 0,
            border: `1px solid ${filter === tab.key ? tab.color + '60' : 'rgba(255,255,255,0.07)'}`,
            background: filter === tab.key ? tab.color + '15' : 'transparent',
            color: filter === tab.key ? tab.color : '#6b7280',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 150ms'
          }}>
            {tab.label}
            <span style={{
              minWidth: 18, height: 18, borderRadius: 999, background: filter === tab.key ? tab.color + '25' : 'rgba(255,255,255,0.06)',
              color: filter === tab.key ? tab.color : '#9ca3af', fontSize: 10, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
            }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: 14, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(216,169,60,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wine size={28} style={{ color: '#f2c65c' }} className="animate-pulse" />
            </div>
            <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>กำลังโหลดคิวบาร์...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(216,169,60,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wine size={36} style={{ color: '#f2c65c', opacity: 0.3 }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#4b5563', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
                {filter === 'all' ? 'ไม่มีคิวออเดอร์ในขณะนี้' : `ไม่มีออเดอร์ที่ "${tabs.find(t => t.key === filter)?.label}"`}
              </p>
              <p style={{ color: '#374151', fontSize: 13, margin: 0 }}>รอรับออเดอร์ใหม่จากแคชเชียร์...</p>
            </div>
            <button onClick={() => loadOrders(false)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: '#9ca3af',
              fontSize: 13, fontWeight: 700, cursor: 'pointer'
            }}>
              <RefreshCw size={14} /> รีเฟรช
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
            {filteredSales.map(sale => (
              <OrderCard
                key={sale.id} sale={sale}
                onAction={handleUpdateStatus}
                updating={updatingId === sale.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Bottom Nav (Mobile only) ── */}
      <style>{`
        .bar-bottom-nav { display: flex !important; }
        @media (min-width: 768px) { .bar-bottom-nav { display: none !important; } }
      `}</style>
      <div className="bar-bottom-nav" style={{
        position: 'sticky', bottom: 0, zIndex: 30,
        background: 'rgba(10,12,16,0.97)', borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)', gap: 4,
        padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        flexShrink: 0
      }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none',
            background: filter === tab.key ? tab.color + '18' : 'transparent',
            color: filter === tab.key ? tab.color : '#6b7280',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            transition: 'all 150ms'
          }}>
            <span style={{ fontSize: 16 }}>
              {tab.key === 'all' ? '🍸' : tab.key === 'pending' ? '⏳' : tab.key === 'preparing' ? '🔥' : '✅'}
            </span>
            <span style={{ fontSize: 9 }}>{tab.count > 0 ? `(${tab.count})` : ''}</span>
          </button>
        ))}
        <button onClick={() => setShowReport(true)} style={{
          flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none',
          background: 'transparent', color: '#38bdf8',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3
        }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontSize: 9 }}>รายงาน</span>
        </button>
      </div>

      {/* ── Report Modal ── */}
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
    </div>
  )
}
