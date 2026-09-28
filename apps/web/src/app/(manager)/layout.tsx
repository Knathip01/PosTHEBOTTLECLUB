'use client'

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Clock, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import Heartbeat from '@/components/Heartbeat'

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('M')
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const timer = setInterval(tick, 1000)

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!profile || profile.role !== 'manager') {
        if (profile?.role === 'kitchen') router.push('/kitchen')
        else if (profile?.role === 'bar') router.push('/bar')
        else if (profile?.role === 'stock_staff') router.push('/stockstaff')
        else if (profile?.role === 'cashier') router.push('/cashier')
        else router.push('/login')
        return
      }
      const name = profile.full_name || user.email?.split('@')[0] || 'Manager'
      setUserName(name)
      setUserInitial(name[0]?.toUpperCase() || 'M')
    })

    return () => clearInterval(timer)
  }, [supabase, router])

  const handleLogout = async () => {
    if (confirm('ยืนยันออกจากระบบ?')) {
      await supabase.auth.signOut()
      router.push('/login')
    }
  }

  const navLinks = [
    { href: '/manager', icon: BarChart3, label: 'ภาพรวม' },
  ]

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
        <Link href="/manager" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            overflow: 'hidden',
            border: '1.5px solid rgba(255,255,255,0.3)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <img src="/logo.jpg" alt="The Bottle Club Manager" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>Manager Display</h1>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, whiteSpace: 'nowrap' }}>The Bottle Club</p>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1" style={{ flex: 1 }}>
          {navLinks.map(link => {
            const Icon = link.icon
            const active = pathname === link.href || pathname?.startsWith(link.href + '/')
            return (
              <Link
                key={link.href} href={link.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  textDecoration: 'none', fontSize: 13, fontWeight: 800,
                  color: active ? '#1E3A8A' : 'rgba(255,255,255,0.9)',
                  background: active ? '#FFFFFF' : 'transparent',
                  boxShadow: active ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 150ms'
                }}
              >
                <Icon size={14} />
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ flex: 1 }} className="md:hidden" />

        {/* Right Actions: Clock (desktop) + [ (M) userName ] + [ ➔ ] */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Clock (desktop) */}
          <div className="hidden lg:flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginRight: 4, fontWeight: 600 }}>
            <Clock size={13} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</span>
          </div>

          {/* 1. User profile pill [ (M) userName ] */}
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
              {userName || 'manager'}
            </span>
          </div>

          {/* 2. Logout button [ ➔ ] */}
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

      {/* ── Content ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 0 }} className="md:pb-0 pb-[60px]">
        <Heartbeat />
        {children}
      </main>
    </div>
  )
}
