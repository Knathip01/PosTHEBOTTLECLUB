'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import {
  ShoppingCart, History, LayoutDashboard,
  LogOut, Clock, ChevronDown, X, User,
  Menu, Package, ChefHat, Wine, Zap
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
      if (data.role === 'super_admin') { router.push('/login'); return }
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

  const canAccessAdmin = profile?.role === 'manager'
  const adminHref = '/manager'

  const navLinks = [
    { href: '/pos', icon: ShoppingCart, label: 'ขายสินค้า', color: '#60a5fa' },
    { href: '/pos/history', icon: History, label: 'ประวัติ', color: '#a78bfa' },
    ...(mounted && canAccessAdmin ? [{ href: adminHref, icon: LayoutDashboard, label: 'หลังบ้าน', color: '#34d399' }] : []),
  ]

  const isActive = (href: string) => {
    if (href === '/pos') return pathname === '/pos'
    return pathname.startsWith(href)
  }

  return (
    <div className="pos-shell">
      <style>{`
        .nav-link-item {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 14px; border-radius: 10px;
          font-size: 13px; font-weight: 600;
          text-decoration: none;
          transition: all 200ms cubic-bezier(0.4,0,0.2,1);
          position: relative; white-space: nowrap;
        }
        .nav-link-item:hover { background: rgba(255,255,255,0.06); }
        .nav-link-item.active-nav {
          background: rgba(59,130,246,0.14);
          color: #93c5fd;
          box-shadow: 0 0 0 1px rgba(59,130,246,0.25);
        }
        .user-btn {
          display: flex; align-items: center; gap: 9px;
          padding: 6px 12px 6px 6px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          cursor: pointer; transition: all 200ms;
        }
        .user-btn:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.14);
        }
        .avatar-ring {
          width: 30px; height: 30px; border-radius: 50%;
          background: linear-gradient(135deg,#1e40af,#3b82f6);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: white; flex-shrink: 0;
          box-shadow: 0 0 0 2px rgba(59,130,246,0.3);
        }
        .dropdown-menu {
          position: absolute; right: 0; top: calc(100% + 10px);
          width: 220px; border-radius: 16px; overflow: hidden; z-index: 99;
          background: rgba(18,20,28,0.98);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03);
          backdrop-filter: blur(20px);
          animation: pop 220ms cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .dropdown-item {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; font-size: 13px; font-weight: 600;
          background: none; border: none; width: 100%;
          cursor: pointer; transition: background 150ms; text-align: left;
        }
        .dropdown-item:hover { background: rgba(255,255,255,0.05); }
        .mobile-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 4px; text-decoration: none;
          padding: 6px 4px; position: relative;
          transition: all 200ms;
        }
        .mobile-tab-pill {
          width: 40px; height: 28px; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          transition: all 200ms cubic-bezier(0.4,0,0.2,1);
        }
        .mobile-tab-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
          transition: color 200ms;
        }
        .clock-badge {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 99px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          font-size: 13px; font-weight: 600;
          color: var(--text-secondary); font-variant-numeric: tabular-nums;
        }
        .hamburger-btn {
          width: 38px; height: 38px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: var(--text-secondary); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 200ms;
        }
        .hamburger-btn:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.14);
          color: var(--text-primary);
        }
        .brand-logo-wrap {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; padding: 4px 6px; border-radius: 10px;
          transition: background 200ms; margin-right: 4px;
        }
        .brand-logo-wrap:hover { background: rgba(255,255,255,0.04); }
        .nav-divider {
          width: 1px; height: 20px;
          background: rgba(255,255,255,0.08); flex-shrink: 0;
        }
        .bottom-bar-glow {
          position: absolute; bottom: 100%; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(59,130,246,0.3), rgba(168,85,247,0.3), transparent);
        }
        @keyframes slide-drawer {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .drawer-panel {
          animation: slide-drawer 320ms cubic-bezier(0.32,0.72,0,1) both;
        }
        @keyframes pop {
          0%   { transform: scale(0.9) translateY(-4px); opacity: 0; }
          60%  { transform: scale(1.02) translateY(0); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>

      {/* ── Top Navbar ── */}
      <header style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px 0 16px',
        gap: 8,
        flexShrink: 0,
        zIndex: 50,
        position: 'relative',
        background: 'rgba(8,10,14,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}>
        {/* Logo */}
        <Link href="/pos" className="brand-logo-wrap">
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.1)'
          }}>
            <img src="/logo.jpg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ display: 'none' }} className="sm-brand">
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              The Bottle Club
            </p>
            <p style={{ margin: 0, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase' }}>
              POS System
            </p>
          </div>
        </Link>

        <style>{`.sm-brand { display: none; } @media (min-width: 480px) { .sm-brand { display: block !important; } } .hidden-md { display: block; } @media (min-width: 768px) { .hidden-md { display: none !important; } } .show-md { display: none; } @media (min-width: 768px) { .show-md { display: flex !important; } } .show-lg { display: none; } @media (min-width: 1024px) { .show-lg { display: flex !important; } }`}</style>

        <div className="nav-divider show-md" />

        {/* Desktop Nav */}
        <nav className="show-md" style={{ flex: 1, gap: 2 }}>
          {navLinks.map(link => {
            const Icon = link.icon
            const active = isActive(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link-item ${active ? 'active-nav' : ''}`}
                style={{ color: active ? link.color : 'var(--text-secondary)' }}
              >
                <Icon size={15} />
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ flex: 1 }} className="hidden-md" />

        {/* Clock */}
        <div className="clock-badge show-lg">
          <Clock size={13} style={{ opacity: 0.6 }} />
          <span suppressHydrationWarning>
            {time ? time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
          </span>
        </div>

        {/* User avatar — Desktop */}
        <div className="show-md" style={{ position: 'relative', flexShrink: 0 }}>
          <button className="user-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
            <div className="avatar-ring">
              {profile?.full_name?.[0]?.toUpperCase() || <User size={13} />}
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {profile?.full_name || '—'}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>
                {getRoleLabel(profile?.role || '')}
              </p>
            </div>
            <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 2 }} />
          </button>

          {showUserMenu && (
            <div className="dropdown-menu">
              <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="avatar-ring" style={{ width: 40, height: 40, fontSize: 16, marginBottom: 8 }}>
                  {profile?.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {profile?.full_name}
                </p>
                <span className={`badge text-xs ${getRoleColor(profile?.role || '')}`}>
                  {getRoleLabel(profile?.role || '')}
                </span>
              </div>
              <button
                className="dropdown-item"
                onClick={handleLogout}
                style={{ color: '#f87171' }}
              >
                <LogOut size={15} />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="hamburger-btn hidden-md" onClick={() => setShowMobileMenu(true)}>
          <Menu size={17} />
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
        zIndex: 60,
        background: 'rgba(8,10,14,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }} className="hidden-md">
        <div className="bottom-bar-glow" />
        <div style={{ display: 'flex', height: 60 }}>
          {[
            { href: '/pos', icon: ShoppingCart, label: 'ขาย', color: '#60a5fa' },
            { href: '/pos/history', icon: History, label: 'ประวัติ', color: '#a78bfa' },
            { href: '/cashier', icon: Package, label: 'เตรียมของ', color: '#34d399' },
            ...(mounted && canAccessAdmin ? [{ href: adminHref, icon: LayoutDashboard, label: 'หลังบ้าน', color: '#f59e0b' }] : []),
          ].map(tab => {
            const Icon = tab.icon
            const active = isActive(tab.href)
            return (
              <Link key={tab.href} href={tab.href} className="mobile-tab" style={{ color: active ? tab.color : 'var(--text-muted)' }}>
                <div className="mobile-tab-pill" style={{ background: active ? `${tab.color}22` : 'transparent' }}>
                  <Icon size={20} />
                </div>
                <span className="mobile-tab-label">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Mobile Side Drawer ── */}
      {showMobileMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowMobileMenu(false)}
          />
          <div
            className="drawer-panel"
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(180deg,rgba(16,18,26,0.99) 0%, rgba(10,12,16,0.99) 100%)',
              borderRadius: '24px 24px 0 0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderBottom: 'none',
              paddingBottom: 'env(safe-area-inset-bottom)',
              boxShadow: '0 -24px 80px rgba(0,0,0,0.8)',
            }}
          >
            {/* Handle */}
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 999, margin: '12px auto 0' }} />

            {/* User info */}
            <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: 'white', flexShrink: 0,
                boxShadow: '0 0 0 3px rgba(59,130,246,0.25), 0 8px 24px rgba(59,130,246,0.3)'
              }}>
                {profile?.full_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {profile?.full_name}
                </p>
                <span className={`badge ${getRoleColor(profile?.role || '')}`} style={{ fontSize: 11 }}>
                  {getRoleLabel(profile?.role || '')}
                </span>
              </div>
              <button
                onClick={() => setShowMobileMenu(false)}
                style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Clock */}
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }} suppressHydrationWarning>
                {time ? time.toLocaleTimeString('th-TH') : '--:--:--'}
              </span>
            </div>

            {/* Nav links */}
            <div style={{ padding: '8px 12px' }}>
              {navLinks.map(link => {
                const Icon = link.icon
                const active = isActive(link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setShowMobileMenu(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 12px', borderRadius: 14,
                      textDecoration: 'none',
                      color: active ? link.color : 'var(--text-secondary)',
                      background: active ? `${link.color}14` : 'transparent',
                      fontWeight: 700, fontSize: 15,
                      marginBottom: 2, transition: 'all 150ms'
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 11,
                      background: active ? `${link.color}22` : 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Icon size={18} />
                    </div>
                    {link.label}
                  </Link>
                )
              })}
            </div>

            {/* Logout */}
            <div style={{ padding: '8px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8 }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 12px', borderRadius: 14,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: 15, fontWeight: 700, color: '#f87171', cursor: 'pointer'
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: 'rgba(239,68,68,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <LogOut size={18} />
                </div>
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close user menu on outside click */}
      {showUserMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowUserMenu(false)} />
      )}
    </div>
  )
}
