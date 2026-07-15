'use client'

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Clock, User, ShoppingCart, BarChart3, Receipt, Menu, X, ChevronRight, Package } from 'lucide-react'
import Link from 'next/link'
import Heartbeat from '@/components/Heartbeat'

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('M')
  const [time, setTime] = useState('')
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const timer = setInterval(tick, 1000)

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!profile || (profile.role !== 'manager' && profile.role !== 'super_admin')) {
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
  }, [])

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
        background: 'rgba(10,12,16,0.94)',
        borderBottom: '1px solid var(--border-color)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0
      }}>
        {/* Logo */}
        <Link href="/manager" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          <div className="hidden sm:block">
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>The Bottle Club</p>
            <p style={{ margin: 0, fontSize: 9, color: '#c084fc', letterSpacing: '0.1em', fontWeight: 700 }}>MANAGER</p>
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
                  padding: '6px 12px', borderRadius: 8,
                  textDecoration: 'none', fontSize: 13, fontWeight: 600,
                  color: active ? '#c084fc' : 'var(--text-secondary)',
                  background: active ? 'rgba(192,132,252,0.1)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(192,132,252,0.2)' : 'transparent'}`,
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

        {/* Clock */}
        <div className="hidden lg:flex items-center gap-1.5" style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>
          <Clock size={13} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</span>
        </div>

        {/* User + Logout — Desktop */}
        <div className="hidden md:flex items-center gap-8" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'white'
            }}>{userInitial}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: '#f87171',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '6px 10px', borderRadius: 8, transition: 'background 150ms'
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
          >
            <LogOut size={14} />
            ออกระบบ
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex md:hidden items-center justify-center"
          onClick={() => setShowMenu(true)}
          style={{
            width: 36, height: 36, borderRadius: 9,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)',
            flexShrink: 0
          }}
        >
          <Menu size={16} />
        </button>
      </header>

      {/* ── Mobile Bottom Sheet ── */}
      {showMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowMenu(false)}
          />
          <div
            className="animate-slide-up"
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'var(--bg-secondary)',
              borderRadius: '20px 20px 0 0',
              border: '1px solid var(--border-color)',
              paddingBottom: 'env(safe-area-inset-bottom)'
            }}
          >
            <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 999, margin: '10px auto 0' }} />

            {/* User info */}
            <div style={{ padding: '14px 20px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0
              }}>{userInitial}</div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{userName}</p>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'rgba(192,132,252,0.12)', color: '#c084fc',
                  border: '1px solid rgba(192,132,252,0.25)',
                  borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, marginTop: 3
                }}>
                  Manager
                </span>
              </div>
            </div>

            {/* Clock */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{time}</span>
            </div>

            {/* Nav links */}
            {navLinks.map(link => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href} href={link.href}
                  onClick={() => setShowMenu(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 20px', textDecoration: 'none',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-primary)', fontSize: 15, fontWeight: 600,
                    transition: 'background 150ms'
                  }}
                >
                  <Icon size={18} style={{ color: '#c084fc' }} />
                  {link.label}
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
                </Link>
              )
            })}

            {/* Logout */}
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 20px', background: 'none', border: 'none',
                fontSize: 15, fontWeight: 700, color: '#f87171', cursor: 'pointer'
              }}
            >
              <LogOut size={18} />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 0 }} className="md:pb-0 pb-[60px]">
        <Heartbeat />
        {children}
      </main>
    </div>
  )
}
