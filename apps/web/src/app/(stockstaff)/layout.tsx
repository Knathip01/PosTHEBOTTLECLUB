'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LogOut, Clock, ClipboardList, X, Camera, Send, Loader2,
  Image as ImageIcon, CheckCircle
} from 'lucide-react'
import Link from 'next/link'
import Heartbeat from '@/components/Heartbeat'

export default function StockStaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('S')
  const [time, setTime] = useState('')
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const timer = setInterval(tick, 1000)

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!profile || profile.role !== 'stock_staff') {
        if (profile?.role === 'kitchen') router.push('/kitchen')
        else if (profile?.role === 'bar') router.push('/bar')
        else if (profile?.role === 'manager') router.push('/manager')
        else if (profile?.role === 'cashier') router.push('/cashier')
        else router.push('/login')
        return
      }
      const name = profile.full_name || user.email?.split('@')[0] || 'Stock Staff'
      setUserName(name)
      setUserInitial(name[0]?.toUpperCase() || 'S')
    })

    return () => clearInterval(timer)
  }, [])

  const handleLogout = async () => {
    if (confirm('ยืนยันออกจากระบบ?')) {
      await supabase.auth.signOut()
      router.push('/login')
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top Navbar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        height: 56, display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12,
        background: '#2340A8',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0
      }}>
        {/* Logo */}
        <Link href="/stockstaff" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#151414', overflow: 'hidden',
            border: '1.5px solid rgba(255,255,255,0.3)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <img src="/stock_logo.png" alt="The Bottle Club Stock" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>Stockstaff Display</h1>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, whiteSpace: 'nowrap' }}>The Bottle Club</p>
          </div>
        </Link>

        <div style={{ flex: 1 }} />

        {/* Right side controls matching reference image */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Clock desktop */}
          <div className="hidden lg:flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginRight: 4, fontWeight: 600 }}>
            <Clock size={13} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</span>
          </div>

          {/* 1. Report button [ 📋 ] */}
          <button
            onClick={() => setShowReport(true)}
            title="ส่งรายงานความเรียบร้อยสต็อก"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#FFFFFF', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 150ms'
            }}
          >
            <ClipboardList size={15} />
          </button>

          {/* 2. User profile pill [ (S) userName ] */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 24, padding: '4px 10px 4px 5px',
            flexShrink: 0
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, color: '#1E3A8A', flexShrink: 0
            }}>
              {userInitial}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 800, color: '#FFFFFF',
              maxWidth: 75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {userName || 'stockstaff'}
            </span>
          </div>

          {/* 3. Logout button [ ➔ ] */}
          <button
            onClick={handleLogout}
            title="ออกจากระบบ"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#FFFFFF', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 150ms'
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* ── Report Modal ── */}
      {showReport && <StockReportModal onClose={() => setShowReport(false)} />}

      {/* ── Content ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Heartbeat />
        {children}
      </main>
    </div>
  )
}

// ─── Stock Report Modal ────────────────────────────────────────────────────────
function StockReportModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const [title, setTitle] = useState('รายงานความเรียบร้อยคลังสินค้า (Stock)')
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '24px 24px 0 0',
        border: '1.5px solid rgba(35,64,168,0.2)',
        width: '100%', maxWidth: 600, maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        <div style={{ width: 40, height: 4, background: '#CBD5E1', borderRadius: 999, margin: '12px auto 0', flexShrink: 0 }} />
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(35,64,168,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={18} style={{ color: '#1E3A8A' }} />
            <span style={{ fontSize: 16, fontWeight: 900, color: '#0F172A' }}>ส่งรายงานสต็อก</span>
          </div>
          <button onClick={() => { stopCamera(); onClose() }} style={{ width: 32, height: 32, borderRadius: '50%', background: '#F1F5F9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} style={{ color: '#475569' }} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {success ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803D' }}>
                <CheckCircle size={32} />
              </div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#15803D' }}>ส่งรายงานเรียบร้อยแล้ว!</p>
            </div>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>หัวข้อรายงาน</label>
                <input
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid rgba(35,64,168,0.2)', fontSize: 14, outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>รายละเอียด / หมายเหตุ</label>
                <textarea
                  rows={3} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="ระบุข้อความหรือปัญหาที่พบในสต็อก..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid rgba(35,64,168,0.2)', fontSize: 14, outline: 'none', resize: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>รูปภาพประกอบ (สูงสุด 5 รูป)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', position: 'relative', border: '1px solid #CBD5E1' }}>
                      <img src={img} alt="attached" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => setImages(p => p.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {images.length < 5 && (
                    <>
                      <button onClick={startCamera} style={{ width: 64, height: 64, borderRadius: 10, border: '1.5px dashed rgba(35,64,168,0.3)', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: '#1E3A8A' }}>
                        <Camera size={18} />
                        <span style={{ fontSize: 10, fontWeight: 800 }}>ถ่ายรูป</span>
                      </button>
                      <button onClick={() => fileRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 10, border: '1.5px dashed rgba(35,64,168,0.3)', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: '#1E3A8A' }}>
                        <ImageIcon size={18} />
                        <span style={{ fontSize: 10, fontWeight: 800 }}>อัลบั้ม</span>
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFile} style={{ display: 'none' }} />
                    </>
                  )}
                </div>
              </div>
              {cameraActive && (
                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                  <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10 }}>
                    <button onClick={capture} style={{ padding: '8px 20px', borderRadius: 20, background: '#FFFFFF', border: 'none', color: '#0F172A', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>ถ่าย</button>
                    <button onClick={stopCamera} style={{ padding: '8px 20px', borderRadius: 20, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#FFFFFF', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>ยกเลิก</button>
                  </div>
                </div>
              )}
              <button
                onClick={submit} disabled={loading}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #1E3A8A, #2340A8)',
                  color: '#FFFFFF', fontSize: 15, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10
                }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                ส่งรายงาน
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
