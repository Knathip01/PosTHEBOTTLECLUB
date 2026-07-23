'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sale } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Clock, CheckCircle2, Loader2, RefreshCw, Wine, ChevronDown,
  Check, Undo, Search, Banknote, CreditCard, QrCode,
  X, Camera, Send, ClipboardList, Image as ImageIcon, AlertCircle
} from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────────────────────────
function classifyCategory(catName?: string): 'kitchen' | 'bar' {
  if (!catName) return 'kitchen'
  const n = catName.toLowerCase()
  return ['wine','beer','drink','beverage','bar','ไวน์','เบียร์','เครื่องดื่ม','rosé','sparkling','champagne','dessert'].some(k => n.includes(k)) ? 'bar' : 'kitchen'
}

const parseNote = (s?: string | null) => {
  const r = { cleanNote: s || '', slipUrl: '', isServed: false, kitchen: 'pending', bar: 'pending' }
  if (!s) return r
  let n = s
  if (n.includes(' | SERVED')) { r.isServed = true; n = n.replace(' | SERVED','') }
  else if (n === 'SERVED') { r.isServed = true; n = '' }
  const parts = n.split(' | SLIP:')
  if (parts.length > 1) { n = parts[0].trim(); r.slipUrl = parts[1].trim() }
  else if (n.startsWith('SLIP:')) { r.slipUrl = n.replace('SLIP:','').trim(); n = '' }
  const km = n.match(/\[KITCHEN:(\w+)\]/); const bm = n.match(/\[BAR:(\w+)\]/)
  if (km) { r.kitchen = km[1]; n = n.replace(/\[KITCHEN:\w+\]/g,'').trim() }
  if (bm) { r.bar = bm[1]; n = n.replace(/\[BAR:\w+\]/g,'').trim() }
  r.cleanNote = n; return r
}

const payLabel = (m: string) => ({cash:'เงินสด',transfer:'โอนเงิน',qr:'QR Code',card:'บัตร'}[m] || m)
const PayIcon = ({ m }: { m: string }) => {
  const icons: Record<string,React.ReactNode> = { cash:<Banknote size={14}/>, transfer:<CreditCard size={14}/>, qr:<QrCode size={14}/>, card:<CreditCard size={14}/> }
  return <span style={{color:'#9ca3af'}}>{icons[m]||icons.cash}</span>
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CashierQueuePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'queue'|'history'|'report'>('queue')
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string|null>(null)
  const [errorMsg, setErrorMsg] = useState<string|null>(null)
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [totalQueueCount, setTotalQueueCount] = useState(0)

  // History filters
  const [search, setSearch] = useState(''); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState('')

  // Report state
  const [rTitle, setRTitle] = useState(''); const [rNote, setRNote] = useState('')
  const [rImages, setRImages] = useState<string[]>([]); const [rLoading, setRLoading] = useState(false); const [rSuccess, setRSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null); const videoRef = useRef<HTMLVideoElement|null>(null); const streamRef = useRef<MediaStream|null>(null)
  const [camActive, setCamActive] = useState(false)

  const stopCam = useCallback(() => { streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null; setCamActive(false) }, [])
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t=>t.stop()) }, [])

  const startCam = async () => {
    try {
      setCamActive(true)
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' }, audio:false })
      streamRef.current = s
      if (videoRef.current) { videoRef.current.srcObject=s; videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(()=>{}) }
    } catch(e:any) { alert('ไม่สามารถเปิดกล้อง: '+e.message); setCamActive(false) }
  }

  const capturePhoto = () => {
    const v = videoRef.current; if (!v) return
    const c = document.createElement('canvas'); c.width=v.videoWidth||640; c.height=v.videoHeight||480
    c.getContext('2d')?.drawImage(v,0,0); setRImages(p=>[...p,c.toDataURL('image/jpeg',0.85)].slice(0,5)); stopCam()
  }

  const loadData = useCallback(async (t: 'queue'|'history', initial=false) => {
    if (initial) setLoading(true); else setRefreshing(true)
    setErrorMsg(null)
    try {
      let q = supabase.from('sales').select('*, sale_items(*, products(category_id, categories(name)))')
      if (t === 'queue') {
        q = q.in('status',['paid','pending']).order('created_at',{ascending:true})
      } else {
        q = (q as any).eq('status','paid').order('created_at',{ascending:false})
        if (search) q = (q as any).ilike('receipt_no',`%${search}%`)
        if (dateFrom) q = (q as any).gte('created_at',`${dateFrom}T00:00:00`)
        if (dateTo) q = (q as any).lte('created_at',`${dateTo}T23:59:59`)
        q = (q as any).limit(60)
      }
      const { data:raw, error } = await q
      if (error) throw error
      let data = (raw||[]).filter((s:any) => t==='queue' ? !parseNote(s.note).isServed : parseNote(s.note).isServed)
      const cids = [...new Set(data.map((s:any)=>s.customer_id).filter(Boolean))]
      if (cids.length>0) {
        const {data:cd} = await supabase.from('customers').select('id,full_name,phone').in('id',cids)
        if (cd) data = data.map((s:any)=>({...s, customers:cd.find((c:any)=>c.id===s.customer_id)||null}))
      }
      setSales(data as Sale[])
      if (t==='queue') setTotalQueueCount(data.length)
    } catch(e:any) { setErrorMsg(e?.message||'โหลดข้อมูลล้มเหลว') }
    finally { setLoading(false); setRefreshing(false) }
  }, [supabase, search, dateFrom, dateTo])

  // Always keep queue count updated for badge
  const refreshQueueCount = useCallback(async () => {
    try {
      const {data} = await supabase.from('sales').select('id,note').in('status',['paid','pending'])
      const count = (data||[]).filter((s:any)=>!parseNote(s.note).isServed).length
      setTotalQueueCount(count)
    } catch{}
  },[supabase])

  useEffect(() => {
    if (tab !== 'report') loadData(tab, true)
    let t1: NodeJS.Timeout|null = null
    let t2: NodeJS.Timeout|null = null
    if (tab === 'queue') t1 = setInterval(()=>loadData('queue',false), 10000)
    // Always poll queue count for badge even on other tabs
    if (tab !== 'queue') t2 = setInterval(refreshQueueCount, 15000)
    return () => { if(t1) clearInterval(t1); if(t2) clearInterval(t2) }
  }, [loadData, refreshQueueCount, tab])

  const switchTab = (t: 'queue'|'history'|'report') => {
    stopCam(); setTab(t); setExpandedId(null); setSearch(''); setDateFrom(''); setDateTo('')
    if (t!=='report') setTimeout(()=>loadData(t,true), 20)
  }

  const markServed = async (id: string) => {
    if (!confirm('ยืนยันส่งโต๊ะลูกค้าเสร็จสิ้น?')) return
    setUpdatingId(id)
    try {
      const {data:cur} = await supabase.from('sales').select('note').eq('id',id).single()
      const note = cur?.note||''
      await supabase.from('sales').update({note: note ? `${note} | SERVED` : 'SERVED'}).eq('id',id)
      await loadData('queue',false)
    } catch(e){console.error(e)} finally{setUpdatingId(null)}
  }

  const undoServed = async (id: string) => {
    if (!confirm('ดึงรายการกลับคิว?')) return
    setUpdatingId(id)
    try {
      const {data:cur} = await supabase.from('sales').select('note').eq('id',id).single()
      const nn = (cur?.note||'').replace(' | SERVED','').replace('SERVED','').trim()
      await supabase.from('sales').update({note:nn||null}).eq('id',id)
      await loadData('history',false)
    } catch(e){console.error(e)} finally{setUpdatingId(null)}
  }

  const submitReport = async () => {
    if (!rTitle.trim()) return
    setRLoading(true)
    try {
      const {data:{user}} = await supabase.auth.getUser()
      const {error} = await supabase.from('shop_reports').insert({title:rTitle.trim(),note:rNote.trim()||null,images:rImages.length>0?rImages:null,reported_by:user?.id||null,status:'pending'})
      if (error) throw error
      setRSuccess(true)
      setTimeout(()=>{ setRTitle(''); setRNote(''); setRImages([]); stopCam(); setRSuccess(false); switchTab('queue') }, 1800)
    } catch(e:any){ alert('ส่งรายงานล้มเหลว: '+e.message) }
    finally{setRLoading(false)}
  }

  const timeSince = (d:string) => {
    const m = Math.floor((Date.now()-new Date(d).getTime())/60000)
    return m<1 ? 'เพิ่งจ่าย' : m<60 ? `${m} นาที` : `${Math.floor(m/60)} ชม.`
  }

  const NAV_ITEMS = [
    { id: 'queue' as const,   emoji: '📋', label: 'คิว',    badge: totalQueueCount },
    { id: 'history' as const, emoji: '✅', label: 'ประวัติ', badge: 0 },
    { id: 'report' as const,  emoji: '📝', label: 'รายงาน', badge: 0 },
  ]

  return (
    <>
      {/* ── Global Styles ── */}
      <style>{`
        html, body { height: 100%; }
        .cq-shell { display:flex; flex-direction:column; height:100dvh; background:var(--bg-primary); overflow:hidden; }
        .cq-main  { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 12px calc(12px + env(safe-area-inset-bottom)); }
        @media(min-width:768px){ .cq-main { padding:20px; } }
        .cq-bnav  { display:flex; flex-shrink:0; }
        @media(min-width:768px){ .cq-bnav { display:none !important; } }
        .cq-dtabs { display:none; }
        @media(min-width:768px){ .cq-dtabs { display:flex; } }
        /* Tap target minimum 48px */
        .cq-nav-btn { min-height:56px; }
        /* Card hover on desktop */
        @media(min-width:768px){ .cq-card:hover { transform:translateY(-2px); } }
        .cq-card { transition: transform 200ms, box-shadow 200ms; }
        @keyframes cq-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .cq-anim { animation: cq-in 0.28s ease both; }
        /* pill status dots */
        .dot-g { background:#22c55e; box-shadow:0 0 6px #22c55e; }
        .dot-y { background:#fbbf24; box-shadow:0 0 6px #fbbf24; }
        .dot-r { background:#ef4444; box-shadow:0 0 6px #ef4444; }
        .dot-d { background:#374151; }
        /* History accordion */
        .hist-detail { animation: cq-in 0.2s ease; }
      `}</style>

      <div className="cq-shell">

        {/* ── TOP HEADER ── */}
        <header style={{
          flexShrink:0, zIndex:40,
          background:'rgba(10,12,18,0.97)', borderBottom:'1px solid rgba(255,255,255,0.07)',
          backdropFilter:'blur(20px)', padding:'0 14px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          height:54, gap:10,
        }}>
          {/* Left: title */}
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <div style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#0c4a6e,#0ea5e9)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <CheckCircle2 size={16} color="white"/>
            </div>
            <div style={{minWidth:0}}>
              <p style={{margin:0,fontSize:14,fontWeight:800,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {tab==='queue'?'คิวเตรียมของ 💳':tab==='history'?'ประวัติออเดอร์ 📖':'รายงานร้าน 📝'}
              </p>
              <p style={{margin:0,fontSize:10,color:'#6b7280'}}>
                {tab==='queue' ? `${sales.length} รายการรอ` : tab==='history' ? `ล่าสุด ${sales.length} บิล` : 'ส่งรายงานประจำวัน'}
              </p>
            </div>
          </div>

          {/* Right: desktop tabs + refresh */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            {refreshing && <RefreshCw size={13} className="animate-spin" style={{color:'#4b5563'}}/>}
            <div className="cq-dtabs" style={{gap:3,background:'rgba(255,255,255,0.04)',borderRadius:10,padding:3}}>
              {NAV_ITEMS.map(n=>(
                <button key={n.id} onClick={()=>switchTab(n.id)} style={{
                  padding:'5px 14px',borderRadius:7,border:'none',fontSize:12,fontWeight:700,cursor:'pointer',
                  background:tab===n.id?'rgba(255,255,255,0.1)':'transparent',
                  color:tab===n.id?'#fff':'#6b7280', transition:'all 150ms', position:'relative',whiteSpace:'nowrap',
                }}>
                  {n.emoji} {n.label}
                  {n.badge>0 && <span style={{position:'absolute',top:2,right:2,width:14,height:14,background:'#ef4444',borderRadius:'50%',fontSize:8,fontWeight:900,color:'white',display:'flex',alignItems:'center',justifyContent:'center'}}>{n.badge>9?'9+':n.badge}</span>}
                </button>
              ))}
            </div>
            {tab!=='report' && (
              <button onClick={()=>loadData(tab as any,false)} style={{width:32,height:32,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.03)',color:'#6b7280',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <RefreshCw size={13}/>
              </button>
            )}
          </div>
        </header>

        {/* ── MAIN SCROLL AREA ── */}
        <main className="cq-main">

          {/* Error banner */}
          {errorMsg && (
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:12,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',marginBottom:12}}>
              <AlertCircle size={16} style={{color:'#f87171',flexShrink:0}}/>
              <span style={{fontSize:13,color:'#f87171'}}>{errorMsg}</span>
            </div>
          )}

          {/* ─── QUEUE TAB ─── */}
          {tab === 'queue' && (
            loading ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'55dvh',gap:14}}>
                <Loader2 size={32} className="animate-spin" style={{color:'#0ea5e9'}}/>
                <p style={{color:'#4b5563',fontSize:13,margin:0}}>กำลังโหลดออเดอร์...</p>
              </div>
            ) : sales.length===0 ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'55dvh',gap:16}}>
                <div style={{width:80,height:80,borderRadius:'50%',background:'rgba(14,165,233,0.06)',border:'1px solid rgba(14,165,233,0.12)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <CheckCircle2 size={36} style={{color:'#0ea5e9',opacity:0.4}}/>
                </div>
                <div style={{textAlign:'center'}}>
                  <p style={{margin:'0 0 6px',fontSize:17,fontWeight:800,color:'#374151'}}>ไม่มีออเดอร์รอเตรียม 🎉</p>
                  <p style={{margin:0,fontSize:13,color:'#374151'}}>ออเดอร์ที่ชำระแล้วจะปรากฏที่นี่โดยอัตโนมัติ</p>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {sales.map((sale,idx) => {
                  const {kitchen:kSt,bar:bSt,cleanNote} = parseNote(sale.note)
                  const hasK = sale.sale_items?.some((i:any)=>classifyCategory(i.products?.categories?.name)==='kitchen')
                  const hasB = sale.sale_items?.some((i:any)=>classifyCategory(i.products?.categories?.name)==='bar')
                  const ready = (!hasK||kSt==='ready') && (!hasB||bSt==='ready')
                  const mins = Math.floor((Date.now()-new Date(sale.created_at).getTime())/60000)
                  const urgent = mins>=20 && !ready
                  const isUpdating = updatingId===sale.id

                  return (
                    <div key={sale.id} className="cq-card cq-anim" style={{
                      animationDelay:`${idx*40}ms`,
                      background:'rgba(16,20,30,0.95)',
                      borderRadius:16,overflow:'hidden',
                      border:`1.5px solid ${ready?'rgba(34,197,94,0.4)':urgent?'rgba(239,68,68,0.4)':'rgba(255,255,255,0.06)'}`,
                      boxShadow:ready?'0 0 20px rgba(34,197,94,0.1)':urgent?'0 0 20px rgba(239,68,68,0.08)':'none',
                    }}>
                      {/* Status stripe */}
                      <div style={{height:3,background:ready?'linear-gradient(90deg,#16a34a,#4ade80)':urgent?'linear-gradient(90deg,#dc2626,#f97316)':'rgba(255,255,255,0.04)'}}/>

                      {/* Card Header */}
                      <div style={{padding:'14px 14px 10px',background:ready?'rgba(34,197,94,0.03)':urgent?'rgba(239,68,68,0.03)':'transparent'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                          {/* Left */}
                          <div style={{minWidth:0,flex:1}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:4}}>
                              <span style={{fontSize:16,fontWeight:900,color:urgent&&!ready?'#ef4444':'#f1f5f9'}}>
                                {sale.table_no?`🍽️ โต๊ะ ${sale.table_no}`:'🛍️ หน้าร้าน'}
                              </span>
                              {ready && <span style={{fontSize:10,fontWeight:800,color:'#4ade80',background:'rgba(74,222,128,0.12)',border:'1px solid rgba(74,222,128,0.2)',padding:'2px 7px',borderRadius:999}}>🌟 พร้อมเสิร์ฟ</span>}
                              {urgent&&!ready && <span style={{fontSize:10,fontWeight:800,color:'#f87171',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',padding:'2px 7px',borderRadius:999}}>⚡ รีบด่วน</span>}
                              {sale.status==='pending' && <span style={{fontSize:10,fontWeight:700,color:'#fbbf24',background:'rgba(245,158,11,0.1)',padding:'2px 6px',borderRadius:6}}>รอชำระ</span>}
                            </div>
                            <p style={{margin:0,fontSize:11,color:'#6b7280',fontFamily:'monospace'}}>#{sale.receipt_no}</p>
                            {(sale.customers as any)?.full_name && <p style={{margin:'2px 0 0',fontSize:11,color:'#9ca3af'}}>👤 {(sale.customers as any).full_name}</p>}
                          </div>
                          {/* Right: time */}
                          <div style={{flexShrink:0,textAlign:'right',paddingLeft:8}}>
                            <div style={{display:'flex',alignItems:'center',gap:3,fontSize:11,fontWeight:700,color:urgent&&!ready?'#ef4444':'#6b7280',justifyContent:'flex-end'}}>
                              <Clock size={11}/><span>{timeSince(sale.created_at)}</span>
                            </div>
                            <p style={{margin:'3px 0 0',fontSize:10,color:'#374151'}}>ที่แล้ว</p>
                          </div>
                        </div>

                        {/* Station pills */}
                        {(hasK||hasB) && (
                          <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
                            {hasK && (
                              <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:999,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                                <span className={kSt==='ready'?'dot-g':kSt==='preparing'?'dot-y':'dot-d'} style={{width:6,height:6,borderRadius:'50%',display:'inline-block',flexShrink:0}}/>
                                <span style={{fontSize:11,fontWeight:700,color:kSt==='ready'?'#4ade80':kSt==='preparing'?'#fbbf24':'#6b7280'}}>
                                  🍳 ครัว — {kSt==='ready'?'พร้อม':kSt==='preparing'?'กำลังทำ':'รอ'}
                                </span>
                              </div>
                            )}
                            {hasB && (
                              <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:999,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                                <span className={bSt==='ready'?'dot-g':bSt==='preparing'?'dot-y':'dot-d'} style={{width:6,height:6,borderRadius:'50%',display:'inline-block',flexShrink:0}}/>
                                <span style={{fontSize:11,fontWeight:700,color:bSt==='ready'?'#4ade80':bSt==='preparing'?'#fbbf24':'#6b7280'}}>
                                  🍷 บาร์ — {bSt==='ready'?'พร้อม':bSt==='preparing'?'กำลังชง':'รอ'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Items list */}
                      <div style={{padding:'0 14px 10px',display:'flex',flexDirection:'column',gap:4}}>
                        {(sale.sale_items||[]).map((item:any)=>(
                          <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',borderRadius:10,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)'}}>
                            <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
                              <div style={{width:28,height:28,borderRadius:8,background:'rgba(190,24,93,0.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                <Wine size={13} style={{color:'#be185d'}}/>
                              </div>
                              <span style={{fontSize:13,color:'#e2e8f0',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.product_name}</span>
                            </div>
                            <span style={{fontSize:15,fontWeight:900,color:'#fcd34d',flexShrink:0,marginLeft:10}}>×{item.quantity}</span>
                          </div>
                        ))}
                        {cleanNote && (
                          <div style={{padding:'8px 12px',borderRadius:10,background:'rgba(245,158,11,0.05)',border:'1px solid rgba(245,158,11,0.15)',fontSize:12,color:'#fbbf24',marginTop:2}}>
                            📝 {cleanNote}
                          </div>
                        )}
                      </div>

                      {/* Action Button — 52px tall minimum */}
                      <div style={{padding:'10px 12px 14px'}}>
                        <button
                          onClick={()=>markServed(sale.id)}
                          disabled={isUpdating}
                          style={{
                            width:'100%', minHeight:52, borderRadius:14, border:'none',
                            background:isUpdating?'rgba(255,255,255,0.06)':'linear-gradient(135deg,#059669,#10b981)',
                            color:isUpdating?'#6b7280':'white',
                            fontSize:15, fontWeight:800, cursor:isUpdating?'not-allowed':'pointer',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                            boxShadow:isUpdating?'none':'0 4px 20px rgba(16,185,129,0.35)',
                            transition:'all 150ms', letterSpacing:'0.01em',
                          }}
                          onTouchStart={e => { if (!isUpdating) (e.currentTarget as HTMLElement).style.transform='scale(0.97)' }}
                          onTouchEnd={e => { (e.currentTarget as HTMLElement).style.transform='' }}
                        >
                          {isUpdating
                            ? <><Loader2 size={18} className="animate-spin"/> กำลังบันทึก...</>
                            : <><Check size={18}/> ส่งของถึงโต๊ะแล้ว</>
                          }
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ─── HISTORY TAB ─── */}
          {tab === 'history' && (
            <>
              {/* Filter row */}
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'10px 12px'}}>
                  <Search size={14} style={{color:'#6b7280',flexShrink:0}}/>
                  <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadData('history',true)} placeholder="ค้นหาเลขบิล..." style={{flex:1,background:'none',border:'none',color:'white',fontSize:14,outline:'none',minWidth:0}}/>
                  {search && <button onClick={()=>{setSearch('');loadData('history',true)}} style={{background:'none',border:'none',color:'#6b7280',cursor:'pointer',padding:0,display:'flex',alignItems:'center'}}><X size={14}/></button>}
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{flex:1,padding:'9px 10px',borderRadius:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'white',fontSize:13,outline:'none',minWidth:0}}/>
                  <span style={{color:'#4b5563',fontSize:12,flexShrink:0}}>ถึง</span>
                  <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{flex:1,padding:'9px 10px',borderRadius:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'white',fontSize:13,outline:'none',minWidth:0}}/>
                  <button onClick={()=>loadData('history',true)} style={{padding:'9px 14px',borderRadius:10,border:'none',background:'rgba(14,165,233,0.15)',color:'#38bdf8',fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>ค้นหา</button>
                </div>
              </div>

              {loading ? (
                <div style={{display:'flex',justifyContent:'center',paddingTop:60}}><Loader2 size={28} className="animate-spin" style={{color:'#0ea5e9'}}/></div>
              ) : sales.length===0 ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'40dvh',gap:12}}>
                  <CheckCircle2 size={40} style={{color:'#22c55e',opacity:0.25}}/>
                  <p style={{color:'#374151',fontSize:14,margin:0}}>ไม่พบประวัติออเดอร์</p>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {sales.map(sale=>{
                    const isExp = expandedId===sale.id
                    const items = sale.sale_items||[]
                    return (
                      <div key={sale.id} style={{background:'rgba(16,20,30,0.95)',borderRadius:14,border:'1px solid rgba(255,255,255,0.06)',overflow:'hidden'}}>
                        {/* Row header — tap to expand */}
                        <div onClick={()=>setExpandedId(isExp?null:sale.id)} style={{padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',minHeight:60}}>
                          <div style={{minWidth:0,flex:1}}>
                            <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                              <span style={{fontSize:12,fontWeight:800,color:'#e11d48',fontFamily:'monospace'}}>#{sale.receipt_no}</span>
                              <span style={{fontSize:10,color:'#6b7280'}}>{formatDate(sale.created_at)}</span>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,flexWrap:'wrap'}}>
                              <div style={{display:'flex',alignItems:'center',gap:4}}><PayIcon m={sale.payment_method}/><span style={{fontSize:11,color:'#9ca3af'}}>{payLabel(sale.payment_method)}</span></div>
                              <span style={{fontSize:10,color:'#374151'}}>• {items.length} รายการ</span>
                              {(sale.customers as any)?.full_name && <span style={{fontSize:10,color:'#4b5563'}}>• {(sale.customers as any).full_name}</span>}
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0,paddingLeft:8}}>
                            <span style={{fontSize:15,fontWeight:900,color:'#fcd34d'}}>{formatCurrency(sale.total_amount)}</span>
                            <div style={{width:26,height:26,borderRadius:8,background:'rgba(255,255,255,0.04)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <ChevronDown size={13} style={{color:'#6b7280',transform:isExp?'rotate(180deg)':'none',transition:'transform 200ms'}}/>
                            </div>
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExp && (
                          <div className="hist-detail" style={{borderTop:'1px solid rgba(255,255,255,0.05)',padding:'12px 14px',display:'flex',flexDirection:'column',gap:6}}>
                            {items.map((item:any)=>(
                              <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',borderRadius:9,background:'rgba(255,255,255,0.02)'}}>
                                <div style={{minWidth:0}}>
                                  <p style={{margin:0,fontSize:12,color:'#e2e8f0',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.product_name}</p>
                                  <p style={{margin:'2px 0 0',fontSize:10,color:'#6b7280'}}>{formatCurrency(item.unit_price)} × {item.quantity}</p>
                                </div>
                                <span style={{fontSize:12,fontWeight:700,color:'#fcd34d',flexShrink:0,marginLeft:8}}>{formatCurrency(item.line_total)}</span>
                              </div>
                            ))}
                            {/* Total row */}
                            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 10px',borderTop:'1px solid rgba(255,255,255,0.06)',marginTop:2}}>
                              <span style={{fontSize:12,color:'#6b7280'}}>ยอดสุทธิ</span>
                              <span style={{fontSize:14,fontWeight:900,color:'#fcd34d'}}>{formatCurrency(sale.total_amount)}</span>
                            </div>
                            {/* Undo button */}
                            <button onClick={()=>undoServed(sale.id)} disabled={updatingId===sale.id} style={{width:'100%',minHeight:44,marginTop:4,borderRadius:10,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.03)',color:'#9ca3af',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                              {updatingId===sale.id?<Loader2 size={14} className="animate-spin"/>:<Undo size={14}/>} ดึงกลับคิว
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ─── REPORT TAB ─── */}
          {tab === 'report' && (
            <div style={{maxWidth:520,margin:'0 auto'}}>
              <div style={{background:'rgba(16,20,30,0.95)',borderRadius:18,border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden'}}>
                <div style={{height:4,background:'linear-gradient(90deg,#0c4a6e,#0ea5e9,#38bdf8)'}}/>
                {/* Header */}
                <div style={{padding:'16px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:38,height:38,borderRadius:10,background:'rgba(14,165,233,0.1)',border:'1px solid rgba(14,165,233,0.15)',display:'flex',alignItems:'center',justifyContent:'center',color:'#0ea5e9',flexShrink:0}}>
                    <ClipboardList size={18}/>
                  </div>
                  <div>
                    <h2 style={{margin:0,fontSize:15,fontWeight:800,color:'white'}}>รายงานความเรียบร้อย</h2>
                    <p style={{margin:0,fontSize:11,color:'#6b7280'}}>ส่งรายงานไปยังผู้จัดการ</p>
                  </div>
                </div>

                <div style={{padding:'18px'}}>
                  {rSuccess ? (
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'40px 0',gap:14}}>
                      <div style={{width:72,height:72,borderRadius:'50%',background:'rgba(14,165,233,0.1)',border:'1px solid rgba(14,165,233,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <CheckCircle2 size={34} style={{color:'#0ea5e9'}}/>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <p style={{margin:'0 0 6px',fontSize:17,fontWeight:800,color:'white'}}>ส่งรายงานสำเร็จ! ✅</p>
                        <p style={{margin:0,fontSize:13,color:'#6b7280'}}>กำลังกลับไปหน้าคิว...</p>
                      </div>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:14}}>
                      {/* Title */}
                      <div>
                        <label style={{display:'block',fontSize:11,fontWeight:700,color:'#9ca3af',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.06em'}}>หัวข้อรายงาน *</label>
                        <input value={rTitle} onChange={e=>setRTitle(e.target.value)} placeholder="เช่น เปิดร้านเรียบร้อย, ทำความสะอาดแล้ว..." style={{width:'100%',padding:'13px 14px',borderRadius:12,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'white',fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
                          onFocus={e=>e.currentTarget.style.borderColor='rgba(14,165,233,0.5)'}
                          onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}
                        />
                      </div>
                      {/* Note */}
                      <div>
                        <label style={{display:'block',fontSize:11,fontWeight:700,color:'#9ca3af',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.06em'}}>รายละเอียดเพิ่มเติม</label>
                        <textarea value={rNote} onChange={e=>setRNote(e.target.value)} rows={3} placeholder="รายละเอียด, ปัญหา, หมายเหตุ..." style={{width:'100%',padding:'13px 14px',borderRadius:12,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'white',fontSize:13,outline:'none',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit',lineHeight:1.6}}
                          onFocus={e=>e.currentTarget.style.borderColor='rgba(14,165,233,0.5)'}
                          onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}
                        />
                      </div>
                      {/* Images */}
                      <div>
                        <label style={{display:'block',fontSize:11,fontWeight:700,color:'#9ca3af',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>📸 รูปภาพ ({rImages.length}/5)</label>
                        {camActive ? (
                          <div style={{display:'flex',flexDirection:'column',gap:10}}>
                            <div style={{position:'relative',width:'100%',aspectRatio:'4/3',background:'#000',borderRadius:14,overflow:'hidden',border:'1px solid rgba(255,255,255,0.1)'}}>
                              <video ref={videoRef} playsInline muted style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                              <div style={{position:'absolute',inset:12,border:'1px dashed rgba(255,255,255,0.15)',borderRadius:8,pointerEvents:'none'}}/>
                            </div>
                            <div style={{display:'flex',gap:8}}>
                              <button onClick={capturePhoto} style={{flex:2,padding:'13px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#0ea5e9,#0284c7)',color:'white',fontSize:14,fontWeight:800,cursor:'pointer'}}>📸 ถ่ายรูป</button>
                              <button onClick={stopCam} style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.03)',color:'#9ca3af',fontSize:14,fontWeight:700,cursor:'pointer'}}>ยกเลิก</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:8}}>
                            {rImages.map((img,i)=>(
                              <div key={i} style={{position:'relative',borderRadius:10,overflow:'hidden',aspectRatio:'1',border:'1px solid rgba(255,255,255,0.08)'}}>
                                <img src={img} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                                <button onClick={()=>setRImages(p=>p.filter((_,idx)=>idx!==i))} style={{position:'absolute',top:3,right:3,width:22,height:22,background:'rgba(239,68,68,0.9)',border:'none',borderRadius:'50%',color:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                                  <X size={12}/>
                                </button>
                              </div>
                            ))}
                            {rImages.length<5 && (
                              <>
                                <button onClick={startCam} style={{aspectRatio:'1',borderRadius:10,border:'2px dashed rgba(14,165,233,0.4)',background:'rgba(14,165,233,0.04)',color:'#0ea5e9',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,cursor:'pointer'}}>
                                  <Camera size={22}/><span style={{fontSize:9,fontWeight:700}}>กล้อง</span>
                                </button>
                                <button onClick={()=>fileRef.current?.click()} style={{aspectRatio:'1',borderRadius:10,border:'2px dashed rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.02)',color:'#6b7280',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,cursor:'pointer'}}>
                                  <ImageIcon size={22}/><span style={{fontSize:9,fontWeight:700}}>อัปโหลด</span>
                                </button>
                              </>
                            )}
                            <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{
                              Array.from(e.target.files||[]).slice(0,5-rImages.length).forEach(f=>{const r=new FileReader();r.onload=ev=>{if(ev.target?.result)setRImages(p=>[...p,ev.target!.result as string])};r.readAsDataURL(f)})
                              if(fileRef.current)fileRef.current.value=''
                            }}/>
                          </div>
                        )}
                      </div>
                      {/* Submit */}
                      <button onClick={submitReport} disabled={!rTitle.trim()||rLoading} style={{
                        width:'100%', minHeight:52, borderRadius:14, border:'none',
                        background:rTitle.trim()&&!rLoading?'linear-gradient(135deg,#0c4a6e,#0ea5e9)':'rgba(255,255,255,0.04)',
                        color:rTitle.trim()&&!rLoading?'white':'#6b7280',
                        fontSize:15, fontWeight:800, cursor:rTitle.trim()&&!rLoading?'pointer':'not-allowed',
                        boxShadow:rTitle.trim()&&!rLoading?'0 6px 24px rgba(14,165,233,0.3)':'none',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 200ms'
                      }}>
                        {rLoading?<><Loader2 size={16} className="animate-spin"/>กำลังส่ง...</>:<><Send size={15}/>ส่งรายงาน</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── MOBILE BOTTOM NAV (fixed, safe area aware) ── */}
        <nav className="cq-bnav" style={{
          background:'rgba(8,10,15,0.98)', borderTop:'1px solid rgba(255,255,255,0.07)',
          backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
          paddingBottom:'env(safe-area-inset-bottom)', flexShrink:0, zIndex:50,
        }}>
          {NAV_ITEMS.map(n=>(
            <button key={n.id} onClick={()=>switchTab(n.id)} className="cq-nav-btn" style={{
              flex:1, border:'none', cursor:'pointer',
              background:tab===n.id?'rgba(14,165,233,0.06)':'transparent',
              color:tab===n.id?'#0ea5e9':'#6b7280',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:2, fontSize:10, fontWeight:700,
              borderTop:`2.5px solid ${tab===n.id?'#0ea5e9':'transparent'}`,
              transition:'all 150ms', position:'relative', paddingTop:10, paddingBottom:8,
            }}>
              <span style={{fontSize:22,lineHeight:1}}>{n.emoji}</span>
              <span>{n.label}</span>
              {n.badge>0 && (
                <span style={{
                  position:'absolute', top:7, right:'calc(50% - 18px)',
                  minWidth:17, height:17, borderRadius:999,
                  background:'#ef4444', color:'white',
                  fontSize:9, fontWeight:900,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px',
                  border:'2px solid rgba(8,10,15,0.98)',
                }}>
                  {n.badge>99?'99+':n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

      </div>
    </>
  )
}
