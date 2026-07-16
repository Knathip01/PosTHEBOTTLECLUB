'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sale } from '@/lib/types'
import {
  Clock, ChefHat, Play, CheckCircle, RefreshCw, LogOut, ArrowRight,
  AlertTriangle, Loader2, ClipboardList, Camera, Image as ImageIcon, X
} from 'lucide-react'
import { useRouter } from 'next/navigation'

// Helper to classify category name to Kitchen vs Bar
function classifyCategory(catName?: string): 'kitchen' | 'bar' {
  if (!catName) return 'kitchen' // default
  const name = catName.toLowerCase()
  const barKeywords = ['wine', 'beer', 'drink', 'beverage', 'bar', 'ไวน์', 'เบียร์', 'เครื่องดื่ม', 'rosé', 'sparkling', 'champagne', 'dessert']
  const isBar = barKeywords.some(kw => name.includes(kw))
  return isBar ? 'bar' : 'kitchen'
}

// Parse prep statuses from note
function parsePrepStatus(note?: string | null) {
  const res = { kitchen: 'pending', bar: 'pending', cleanNote: note || '', slipUrl: '', isServed: false }
  if (!note) return res

  // check if served
  if (note.includes(' | SERVED')) {
    res.isServed = true
    res.cleanNote = note.replace(' | SERVED', '')
  } else if (note === 'SERVED') {
    res.isServed = true
    res.cleanNote = ''
  }

  // parse slip
  const parts = res.cleanNote.split(' | SLIP:')
  if (parts.length > 1) {
    res.cleanNote = parts[0].trim()
    res.slipUrl = parts[1].trim()
  } else if (res.cleanNote.startsWith('SLIP:')) {
    res.slipUrl = res.cleanNote.replace('SLIP:', '').trim()
    res.cleanNote = ''
  }

  // parse KITCHEN and BAR statuses
  const kitchenMatch = res.cleanNote.match(/\[KITCHEN:(\w+)\]/)
  const barMatch = res.cleanNote.match(/\[BAR:(\w+)\]/)
  if (kitchenMatch) {
    res.kitchen = kitchenMatch[1]
    res.cleanNote = res.cleanNote.replace(/\[KITCHEN:\w+\]/g, '').trim()
  }
  if (barMatch) {
    res.bar = barMatch[1]
    res.cleanNote = res.cleanNote.replace(/\[BAR:\w+\]/g, '').trim()
  }

  return res
}

// Build updated note with new statuses
function buildUpdatedNote(originalNote: string | null, kitchenStatus: string, barStatus: string, isServed: boolean) {
  let { cleanNote, slipUrl } = parsePrepStatus(originalNote)
  
  let newNote = cleanNote.trim()
  newNote = `${newNote} [KITCHEN:${kitchenStatus}][BAR:${barStatus}]`.trim()
  
  if (slipUrl) {
    newNote = `${newNote} | SLIP:${slipUrl}`
  }
  if (isServed) {
    newNote = `${newNote} | SERVED`
  }
  
  return newNote
}

export default function KitchenDisplayPage() {
  const supabase = createClient()
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null)

  // Shop Report Modal
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportImages, setReportImages] = useState<string[]>([]) // Array of Base64 strings
  const [reportLoading, setReportLoading] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)

  // Camera Live Viewfinder
  const [isCameraActive, setIsCameraActive] = useState(false)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const startCamera = async () => {
    try {
      setIsCameraActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.error("Error playing video:", e))
        }
      }
    } catch (err: any) {
      console.error("Camera access error:", err)
      alert("ไม่สามารถเปิดกล้องได้: " + err.message + "\nกรุณาใช้การอัปโหลดรูปภาพแทน")
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setReportImages(prev => [...prev, dataUrl].slice(0, 5))
        stopCamera()
      }
    }
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    stopCamera()
    const files = Array.from(e.target.files || [])
    const remaining = 5 - reportImages.length
    files.slice(0, remaining).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const result = ev.target?.result as string
        if (result) setReportImages(prev => [...prev, result])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeReportImage = (idx: number) => {
    setReportImages(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmitReport = async () => {
    if (!reportTitle.trim()) return
    setReportLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('shop_reports').insert({
        title: reportTitle.trim(),
        note: reportNote.trim() || null,
        images: reportImages.length > 0 ? reportImages : null,
        reported_by: user?.id || null,
        status: 'pending',
      })
      if (error) throw error
      setReportSuccess(true)
      setTimeout(() => {
        setReportTitle('')
        setReportNote('')
        setReportImages([])
        setReportSuccess(false)
        setShowReportModal(false)
      }, 1500)
    } catch (err) {
      console.error('Error submitting report:', err)
      alert('เกิดข้อผิดพลาดในการส่งรายงาน กรุณาลองใหม่')
    } finally {
      setReportLoading(false)
    }
  }

  const handleLogout = async () => {
    if (confirm('ยืนยันออกจากระบบ?')) {
      await supabase.auth.signOut()
      router.push('/login')
    }
  }

  const loadOrders = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    else setRefreshing(true)
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          sale_items (
            *,
            products (
              category_id,
              categories (
                name
              )
            )
          )
        `)
        .in('status', ['paid', 'pending'])
        .order('created_at', { ascending: true })

      if (error) throw error

      // Filter: must have kitchen items AND not served yet
      const activeSales = (data || []).filter((sale: any) => {
        const { isServed } = parsePrepStatus(sale.note)
        if (isServed) return false

        // Check if there's any kitchen item
        const hasKitchenItems = sale.sale_items?.some((item: any) => {
          const catName = item.products?.categories?.name
          return classifyCategory(catName) === 'kitchen'
        })
        return hasKitchenItems
      })

      setSales(activeSales as Sale[])
    } catch (err) {
      console.error('Error loading kitchen orders:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
      if (!prof || (prof.role !== 'kitchen' && prof.role !== 'super_admin' && prof.role !== 'manager' && prof.role !== 'cashier')) {
        if (prof?.role === 'bar') router.push('/bar')
        else if (prof?.role === 'stock_staff') router.push('/stockstaff')
        else router.push('/login')
        return
      }
      setProfile({ full_name: prof.full_name || user.email?.split('@')[0] || 'Kitchen', role: prof.role })
    }
    checkAuth()
  }, [supabase, router])

  useEffect(() => {
    loadOrders(true)
    const interval = setInterval(() => {
      loadOrders(false)
    }, 5000) // Poll every 5s for realtime updates
    return () => clearInterval(interval)
  }, [loadOrders])

  const handleUpdateStatus = async (saleId: string, nextStatus: 'preparing' | 'ready') => {
    setUpdatingId(saleId)
    try {
      const { data: sale } = await supabase.from('sales').select('*').eq('id', saleId).single()
      if (!sale) return
      
      const { bar, isServed } = parsePrepStatus(sale.note)
      const updatedNote = buildUpdatedNote(sale.note, nextStatus, bar, isServed)

      const { error } = await supabase
        .from('sales')
        .update({ note: updatedNote })
        .eq('id', saleId)

      if (error) throw error
      await loadOrders(false)
    } catch (err) {
      console.error('Error updating kitchen status:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const getElapsedTime = (createdAt: string) => {
    const elapsedMs = Date.now() - new Date(createdAt).getTime()
    const mins = Math.floor(elapsedMs / 60000)
    if (mins < 1) return 'เมื่อครู่'
    return `${mins} นาที`
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#08090d', color: 'white', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <header style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: 'rgba(10,12,16,0.96)', borderBottom: '1px solid #1f2330',
        position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(20px)'
      }}>
        {/* Left: Logo + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171'
          }}>
            <ChefHat size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Kitchen Display</h1>
            <p style={{ margin: 0, fontSize: 10, color: '#9aa3b2' }}>The Bottle Club</p>
          </div>
        </div>

        {/* Right: User + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {refreshing && <RefreshCw size={14} className="animate-spin" style={{ color: '#9aa3b2' }} />}
          {/* Report button */}
          <button
            onClick={() => setShowReportModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 20, padding: '6px 14px',
              color: '#34d399', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'all 150ms ease'
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.18)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.08)' }}
          >
            <ClipboardList size={14} />
            รายงานความเรียบร้อย 📷
          </button>
          {/* User pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
            borderRadius: 24, padding: '5px 12px 5px 6px'
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg, #ef4444, #f87171)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0
            }}>
              {(profile?.full_name || 'K')[0].toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {profile?.full_name || 'Kitchen'}
            </span>
          </div>
          {/* Logout button */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 20, padding: '6px 14px',
              color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'all 150ms ease'
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.18)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)' }}
          >
            <ArrowRight size={14} />
            ออกระบบ
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main style={{ flex: 1, padding: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', flex: 1, height: '60dvh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <Loader2 size={36} className="animate-spin" style={{ color: '#ef4444' }} />
            <p style={{ fontSize: 13, color: '#9aa3b2' }}>กำลังโหลดออเดอร์ห้องครัว...</p>
          </div>
        ) : sales.length === 0 ? (
          <div style={{ display: 'flex', height: '60dvh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
            <ChefHat size={60} style={{ color: '#ef4444', opacity: 0.2 }} />
            <p style={{ color: '#5c6475', fontSize: 15 }}>ไม่มีออเดอร์อาหารที่ต้องทำในขณะนี้</p>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16
          }}>
            {sales.map(sale => {
              const { kitchen: kStatus, cleanNote } = parsePrepStatus(sale.note)
              const kitchenItems = sale.sale_items?.filter((item: any) => {
                const catName = item.products?.categories?.name
                return classifyCategory(catName) === 'kitchen'
              }) || []

              // Determine card colors based on status and time elapsed
              const isPreparing = kStatus === 'preparing'
              const isReady = kStatus === 'ready'
              const elapsedMin = Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 60000)
              const isUrgent = elapsedMin >= 15 && !isReady

              return (
                <div
                  key={sale.id}
                  style={{
                    background: '#161920',
                    border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.5)' : isPreparing ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: isUrgent ? '0 0 20px rgba(239,68,68,0.15)' : 'none',
                    transition: 'all 200ms'
                  }}
                >
                  {/* Card Header */}
                  <div style={{
                    padding: '12px 14px',
                    background: isUrgent ? 'rgba(239,68,68,0.1)' : isPreparing ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <span style={{ fontSize: 18, fontWeight: 900, color: isUrgent ? '#ef4444' : '#f1f3f7' }}>
                        {sale.table_no ? `โต๊ะ ${sale.table_no}` : 'ออเดอร์กลับบ้าน'}
                      </span>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9aa3b2' }}>#{sale.receipt_no.slice(-6)}</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: isUrgent ? '#ef4444' : '#9aa3b2' }}>
                        <Clock size={11} />
                        <span>{getElapsedTime(sale.created_at)}</span>
                      </div>
                      {sale.status === 'pending' && (
                        <span style={{ fontSize: 9, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                          ยังไม่ได้ชำระเงิน
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items List */}
                  <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {kitchenItems.map((item: any) => (
                      <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: '#f2c65c', flexShrink: 0
                        }}>
                          {item.quantity}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white', wordBreak: 'break-word' }}>
                            {item.product_name}
                          </p>
                          {item.sku && (
                            <p style={{ margin: '1px 0 0', fontSize: 10, color: '#5c6475' }}>SKU: {item.sku}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    {cleanNote && (
                      <div style={{
                        marginTop: 6, padding: '8px 10px', background: 'rgba(245,158,11,0.06)',
                        border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, fontSize: 11, color: '#f59e0b'
                      }}>
                        <strong>หมายเหตุ:</strong> {cleanNote}
                      </div>
                    )}
                  </div>

                  {/* Actions (NO PRICES OR TOTALS) */}
                  <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
                    {isReady ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px', borderRadius: 10, background: 'rgba(34,197,94,0.1)',
                        border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80', fontSize: 13, fontWeight: 700
                      }}>
                        <CheckCircle size={15} />
                        พร้อมเสิร์ฟแล้ว
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(sale.id, isPreparing ? 'ready' : 'preparing')}
                        disabled={updatingId === sale.id}
                        style={{
                          width: '100%', padding: '11px', borderRadius: 12, border: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          fontSize: 13, fontWeight: 800, cursor: 'pointer',
                          background: isPreparing ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
                          color: 'white', boxShadow: 'none'
                        }}
                      >
                        {updatingId === sale.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : isPreparing ? (
                          <>
                            <CheckCircle size={15} />
                            ทำเสร็จแล้ว (เสร็จสิ้น)
                          </>
                        ) : (
                          <>
                            <Play size={15} />
                            เริ่มเตรียมอาหาร
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Shop Report Modal Popup */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#161920', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px', width: '100%', maxWidth: '500px',
            padding: '24px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            maxHeight: '90dvh', overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardList size={18} style={{ color: '#10b981' }} />
                ส่งรายงานความเรียบร้อยหน้าร้าน (ห้องครัว)
              </h3>
              <button
                onClick={() => { stopCamera(); setShowReportModal(false) }}
                style={{ background: 'none', border: 'none', color: '#9aa3b2', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {reportSuccess ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#10b981' }}>
                  <CheckCircle size={32} />
                </div>
                <h4 style={{ margin: '0 0 8px', color: 'white', fontWeight: 800, fontSize: 16 }}>ส่งรายงานความเรียบร้อยสำเร็จ!</h4>
                <p style={{ margin: 0, color: '#9aa3b2', fontSize: 12 }}>ข้อมูลรายงานถูกส่งไปยังผู้จัดการร้านเรียบร้อยแล้ว</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Title Input */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9aa3b2', marginBottom: 6 }}>หัวข้อรายงาน</label>
                  <input
                    type="text"
                    placeholder="เช่น ความเรียบร้อยในครัวก่อนเปิดร้าน, ตรวจสอบเตาแก๊ส"
                    value={reportTitle}
                    onChange={e => setReportTitle(e.target.value)}
                    required
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'white', fontSize: 13, outline: 'none'
                    }}
                  />
                </div>

                {/* Notes Input */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9aa3b2', marginBottom: 6 }}>รายละเอียดเพิ่มเติม (Memo / Notes)</label>
                  <textarea
                    placeholder="ระบุรายละเอียดเพิ่มเติม เช่น ตรวจสอบวัตถุดิบและความสะอาดเรียบร้อยแล้ว หรือรายงานปัญหาความไม่เรียบร้อย"
                    value={reportNote}
                    onChange={e => setReportNote(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'white', fontSize: 13, outline: 'none', resize: 'none'
                    }}
                  />
                </div>

                {/* Camera / Image Upload Section */}
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9aa3b2', marginBottom: 10 }}>
                    📸 แนบภาพหลักฐานความเรียบร้อย (สูงสุด 5 รูป)
                  </label>

                  {isCameraActive ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        position: 'relative', width: '100%', aspectRatio: '4/3',
                        background: '#000', borderRadius: '12px', overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        <video
                          ref={videoRef}
                          playsInline
                          muted
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div style={{
                          position: 'absolute', inset: '16px',
                          border: '1px dashed rgba(255,255,255,0.15)',
                          pointerEvents: 'none', borderRadius: '8px'
                        }} />
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          onClick={capturePhoto}
                          style={{
                            padding: '10px 20px', borderRadius: '12px', border: 'none',
                            background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
                            fontSize: 12, fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          กดถ่ายภาพ 📸
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          style={{
                            padding: '10px 20px', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#9aa3b2', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {/* Display captured images */}
                        {reportImages.map((img, idx) => (
                          <div key={idx} style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img src={img} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              type="button"
                              onClick={() => removeReportImage(idx)}
                              style={{
                                position: 'absolute', top: 2, right: 2,
                                background: '#ef4444', border: 'none', color: 'white',
                                borderRadius: '50%', width: 18, height: 18,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', padding: 0
                              }}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}

                        {/* Open camera button */}
                        {reportImages.length < 5 && (
                          <button
                            type="button"
                            onClick={startCamera}
                            style={{
                              width: '70px', height: '70px', borderRadius: '10px',
                              border: '1px dashed rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.03)',
                              color: '#10b981', display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer'
                            }}
                          >
                            <Camera size={18} />
                            <span style={{ fontSize: 9, fontWeight: 700 }}>เปิดกล้อง</span>
                          </button>
                        )}

                        {/* Upload file button */}
                        {reportImages.length < 5 && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              width: '70px', height: '70px', borderRadius: '10px',
                              border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.01)',
                              color: '#9aa3b2', display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer'
                            }}
                          >
                            <ImageIcon size={18} />
                            <span style={{ fontSize: 9, fontWeight: 700 }}>เลือกรูป</span>
                          </button>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageFileChange}
                        style={{ display: 'none' }}
                      />
                    </div>
                  )}
                </div>

                {/* Submit action */}
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!reportTitle.trim() || reportLoading}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '16px', border: 'none',
                      background: reportTitle.trim() && !reportLoading ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.03)',
                      color: reportTitle.trim() && !reportLoading ? 'white' : '#5c6475',
                      fontSize: 14, fontWeight: 800,
                      cursor: reportTitle.trim() && !reportLoading ? 'pointer' : 'not-allowed',
                      boxShadow: reportTitle.trim() && !reportLoading ? '0 8px 24px rgba(16,185,129,0.3)' : 'none',
                      transition: 'all 200ms ease'
                    }}
                  >
                    {reportLoading ? 'กำลังส่งข้อมูล...' : 'ส่งรายงานความเรียบร้อย'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
