'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sale } from '@/lib/types'
import { Clock, Wine, Play, CheckCircle, RefreshCw, LogOut, ArrowRight, Loader2 } from 'lucide-react'
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

export default function BarDisplayPage() {
  const supabase = createClient()
  const router = useRouter()
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null)

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

      // Filter: must have bar items AND not served yet
      const activeSales = (data || []).filter((sale: any) => {
        const { isServed } = parsePrepStatus(sale.note)
        if (isServed) return false

        // Check if there's any bar item
        const hasBarItems = sale.sale_items?.some((item: any) => {
          const catName = item.products?.categories?.name
          return classifyCategory(catName) === 'bar'
        })
        return hasBarItems
      })

      setSales(activeSales as Sale[])
    } catch (err) {
      console.error('Error loading bar orders:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
      if (!prof || (prof.role !== 'bar' && prof.role !== 'super_admin' && prof.role !== 'manager' && prof.role !== 'cashier')) {
        if (prof?.role === 'kitchen') router.push('/kitchen')
        else if (prof?.role === 'stock_staff') router.push('/stockstaff')
        else router.push('/login')
        return
      }
      setProfile({ full_name: prof.full_name || user.email?.split('@')[0] || 'Bar', role: prof.role })
    }
    checkAccess()
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
      
      const { kitchen, isServed } = parsePrepStatus(sale.note)
      const updatedNote = buildUpdatedNote(sale.note, kitchen, nextStatus, isServed)

      const { error } = await supabase
        .from('sales')
        .update({ note: updatedNote })
        .eq('id', saleId)

      if (error) throw error
      await loadOrders(false)
    } catch (err) {
      console.error('Error updating bar status:', err)
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
            width: 36, height: 36, borderRadius: 10, background: 'rgba(216,169,60,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f2c65c'
          }}>
            <Wine size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Bar Display</h1>
            <p style={{ margin: 0, fontSize: 10, color: '#9aa3b2' }}>The Bottle Club</p>
          </div>
        </div>

        {/* Right: User + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {refreshing && <RefreshCw size={14} className="animate-spin" style={{ color: '#9aa3b2' }} />}
          {/* User pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(216,169,60,0.08)', border: '1px solid rgba(216,169,60,0.2)',
            borderRadius: 24, padding: '5px 12px 5px 6px'
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg, #d8a93c, #f2c65c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#0a0a0f', flexShrink: 0
            }}>
              {(profile?.full_name || 'B')[0].toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {profile?.full_name || 'Bar'}
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
          <div style={{ display: 'flex', height: '60dvh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <Loader2 size={36} className="animate-spin" style={{ color: '#f2c65c' }} />
            <p style={{ fontSize: 13, color: '#9aa3b2' }}>กำลังโหลดออเดอร์คิวบาร์...</p>
          </div>
        ) : sales.length === 0 ? (
          <div style={{ display: 'flex', height: '60dvh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
            <Wine size={60} style={{ color: '#f2c65c', opacity: 0.2 }} />
            <p style={{ color: '#5c6475', fontSize: 15 }}>ไม่มีคิวออเดอร์เครื่องดื่มในขณะนี้</p>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16
          }}>
            {sales.map(sale => {
              const { bar: bStatus, cleanNote } = parsePrepStatus(sale.note)
              const barItems = sale.sale_items?.filter((item: any) => {
                const catName = item.products?.categories?.name
                return classifyCategory(catName) === 'bar'
              }) || []

              const isPreparing = bStatus === 'preparing'
              const isReady = bStatus === 'ready'
              const elapsedMin = Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 60000)
              const isUrgent = elapsedMin >= 10 && !isReady // drinks prepare should be faster, urgent after 10 mins

              return (
                <div
                  key={sale.id}
                  style={{
                    background: '#161920',
                    border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.5)' : isPreparing ? 'rgba(216,169,60,0.3)' : 'rgba(255,255,255,0.06)'}`,
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
                    background: isUrgent ? 'rgba(239,68,68,0.1)' : isPreparing ? 'rgba(216,169,60,0.08)' : 'rgba(255,255,255,0.02)',
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
                    {barItems.map((item: any) => (
                      <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: '#93c5fd', flexShrink: 0
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
                        พร้อมส่งบาร์แล้ว
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(sale.id, isPreparing ? 'ready' : 'preparing')}
                        disabled={updatingId === sale.id}
                        style={{
                          width: '100%', padding: '11px', borderRadius: 12, border: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          fontSize: 13, fontWeight: 800, cursor: 'pointer',
                          background: isPreparing ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'linear-gradient(135deg, #d8a93c, #f2c65c)',
                          color: isPreparing ? 'white' : '#1a1200', boxShadow: 'none'
                        }}
                      >
                        {updatingId === sale.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : isPreparing ? (
                          <>
                            <CheckCircle size={15} />
                            เตรียมเสร็จแล้ว (พร้อมเสิร์ฟ)
                          </>
                        ) : (
                          <>
                            <Play size={15} />
                            เริ่มชง/เตรียมเครื่องดื่ม
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
    </div>
  )
}
