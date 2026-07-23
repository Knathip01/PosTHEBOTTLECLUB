'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import {
  ShoppingCart, History, LayoutDashboard,
  LogOut, Clock, ChevronDown, X, User,
  Menu, Package, ChefHat, Wine
} from 'lucide-react'
import Link from 'next/link'
import { getRoleLabel, getRoleColor } from '@/lib/utils'
import Heartbeat from '@/components/Heartbeat'

export default function POSLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [time, setTime] = useState<Date | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!data) { router.push('/login'); return }
      if (data.role === 'kitchen') { router.push('/kitchen'); return }
      if (data.role === 'bar') { router.push('/bar'); return }
      if (data.role === 'stock_staff') { router.push('/stockstaff'); return }
      setProfile(data)
    }
    loadProfile()
  }, [])

  useEffect(() => {
    setTime(new Date())
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const canAccessAdmin = profile?.role === 'super_admin' || profile?.role === 'manager'
  const adminHref = profile?.role === 'super_admin' ? '/admin' : '/manager'

  const navLinks = [
    { href: '/pos', icon: ShoppingCart, label: 'ขายสินค้า' },
    { href: '/pos/history', icon: History, label: 'ประวัติ' },
    ...(mounted && canAccessAdmin ? [{ href: adminHref, icon: LayoutDashboard, label: 'หลังบ้าน' }] : []),
  ]

  const isActive = (href: string) => {
    if (href === '/pos') return pathname === '/pos'
    return pathname.startsWith(href)
  }

  return (
    <div className="pos-shell">
      {/* ── Top Navbar ── */}
      <header className="glass-nav" style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
        zIndex: 50,
        position: 'relative'
      }}>
        {/* Logo */}
        <Link href="/pos" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginRight: 8 }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          <div className="hidden sm:block">
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>The Bottle Club</p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 }}>POS SYSTEM</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1" style={{ flex: 1 }}>
          {navLinks.map(link => {
            const Icon = link.icon
            const active = isActive(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'all 150ms ease',
                  background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                  color: active ? '#93c5fd' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'rgba(59,130,246,0.25)' : 'transparent'}`,
                }}
              >
                <Icon size={15} />
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ flex: 1 }} className="md:hidden" />
        <div style={{ flex: 'none' }} className="hidden md:block" />

        {/* Clock — Desktop only */}
        <div className="hidden lg:flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>
          <Clock size={14} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }} suppressHydrationWarning>
            {time ? time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
          </span>
        </div>

        {/* User avatar — Desktop */}
        <div className="hidden md:block relative" style={{ flexShrink: 0 }}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              cursor: 'pointer', transition: 'all 150ms ease'
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0
            }}>
              {profile?.full_name?.[0] || <User size={13} />}
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {profile?.full_name || '—'}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                {getRoleLabel(profile?.role || '')}
              </p>
            </div>
            <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>

          {showUserMenu && (
            <div
              className="animate-pop"
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                width: 200, borderRadius: 14, overflow: 'hidden', zIndex: 99,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-xl)'
              }}
            >
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {profile?.full_name}
                </p>
                <span className={`badge text-xs mt-1 ${getRoleColor(profile?.role || '')}`}>
                  {getRoleLabel(profile?.role || '')}
                </span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', fontSize: 13, background: 'none', border: 'none',
                  color: '#f87171', cursor: 'pointer', transition: 'background 150ms ease'
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                <LogOut size={14} />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex md:hidden items-center justify-center"
          onClick={() => setShowMobileMenu(true)}
          style={{
            width: 36, height: 36, borderRadius: 9, border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)', flexShrink: 0
          }}
        >
          <Menu size={16} />
        </button>
      </header>

      {/* ── Page Content ── */}
      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <Heartbeat />
        {children}
      </main>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 60, height: 60,
        background: 'rgba(10,12,16,0.96)',
        borderTop: '1px solid var(--border-color)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        alignItems: 'center',
        justifyContent: 'space-around',
      }} className="flex md:hidden">
        {[
          { href: '/pos', icon: ShoppingCart, label: 'ขาย' },
          { href: '/pos/history', icon: History, label: 'ประวัติ' },
          { href: '/cashier', icon: Package, label: 'เตรียมของ' },
          ...(mounted && canAccessAdmin ? [{ href: adminHref, icon: LayoutDashboard, label: 'หลังบ้าน' }] : []),
        ].map(tab => {
          const Icon = tab.icon
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href} href={tab.href}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, textDecoration: 'none',
                color: active ? '#60a5fa' : 'var(--text-muted)',
                fontSize: 10, fontWeight: 600, transition: 'color 150ms'
              }}
            >
              <div style={{
                width: 36, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                transition: 'background 150ms'
              }}>
                <Icon size={19} />
              </div>
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* ── Mobile Side Menu ── */}
      {showMobileMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowMobileMenu(false)}
          />
          <div
            className="animate-slide-up"
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'var(--bg-secondary)',
              borderRadius: '20px 20px 0 0',
              border: '1px solid var(--border-color)',
              padding: '8px 0 env(safe-area-inset-bottom)',
            }}
          >
            <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 999, margin: '8px auto 16px' }} />

            {/* User info */}
            <div style={{ padding: '12px 20px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0
              }}>
                {profile?.full_name?.[0] || '?'}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.full_name}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{getRoleLabel(profile?.role || '')}</p>
              </div>
            </div>

            {/* Clock */}
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-color)' }}>
              <Clock size={15} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }} suppressHydrationWarning>
                {time ? time.toLocaleTimeString('th-TH') : '--:--:--'}
              </span>
            </div>


            {/* Logout */}
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 20px', background: 'none', border: 'none',
                fontSize: 15, fontWeight: 600, color: '#f87171', cursor: 'pointer'
              }}
            >
              <LogOut size={18} />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {/* Close user menu on outside click */}
      {showUserMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
      )}
    </div>
  )
}
