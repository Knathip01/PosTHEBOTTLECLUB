'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { getRoleLabel } from '@/lib/utils'
import {
  BarChart3, ChevronRight, CircleUserRound, LayoutDashboard,
  LogOut, Menu, Package, QrCode, Receipt, Settings,
  ShoppingCart, Tag, UserCog, Warehouse, X, Clock,
} from 'lucide-react'
import Heartbeat from '@/components/Heartbeat'

const navItems = [
  { href: '/admin',            icon: LayoutDashboard, label: 'ภาพรวม',       roles: ['super_admin', 'manager'] },
  { href: '/admin/billing',    icon: Receipt,         label: 'รับชำระบิล',    roles: ['super_admin', 'manager', 'cashier'] },
  { href: '/admin/products',   icon: Package,         label: 'สินค้า',        roles: ['super_admin', 'manager'] },
  { href: '/admin/categories', icon: Tag,             label: 'หมวดหมู่',      roles: ['super_admin', 'manager'] },
  { href: '/admin/inventory',  icon: Warehouse,       label: 'สต็อก',         roles: ['super_admin', 'manager', 'stock_staff'] },
  { href: '/admin/reports',    icon: BarChart3,       label: 'รายงาน',        roles: ['super_admin', 'manager'] },
  { href: '/admin/qrcode',     icon: QrCode,          label: 'QR เมนู',       roles: ['super_admin', 'manager'] },
  { href: '/admin/users',      icon: UserCog,         label: 'ผู้ใช้งาน',     roles: ['super_admin'] },
  { href: '/admin/settings',   icon: Settings,        label: 'ตั้งค่า',       roles: ['super_admin'] },
]

const pageNames = Object.fromEntries(navItems.map(({ href, label }) => [href, label]))

type SidebarProps = {
  allowedNav: typeof navItems
  onLogout: () => void
  onNavigate: () => void
  pathname: string
  profile: Profile | null
}

function SidebarContent({ allowedNav, onLogout, onNavigate, pathname, profile }: SidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <Link href="/admin" onClick={onNavigate} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              The Bottle Club
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', fontWeight: 600 }}>
              ADMIN CONSOLE
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {/* POS shortcut */}
        <Link
          href="/pos" onClick={onNavigate}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 10px', borderRadius: 9, marginBottom: 8,
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.15)',
            transition: 'all 150ms'
          }}
        >
          <ShoppingCart size={15} style={{ color: '#93c5fd' }} />
          <span style={{ flex: 1 }}>หน้าขาย (POS)</span>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        </Link>

        <p style={{ margin: '0 0 6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          WORKSPACE
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {allowedNav.map(item => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href} href={item.href} onClick={onNavigate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 9, textDecoration: 'none',
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                  color: isActive ? '#93c5fd' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? 'rgba(59,130,246,0.25)' : 'transparent'}`,
                  transition: 'all 150ms'
                }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '10px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
        {profile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 10px' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'white'
            }}>
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.full_name}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {getRoleLabel(profile.role)}
              </p>
            </div>
          </div>
        )}
        <button
          type="button" onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '9px 10px', borderRadius: 9,
            border: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 600, color: '#f87171',
            cursor: 'pointer', transition: 'background 150ms', textAlign: 'left'
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <LogOut size={15} />
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState('')

  useEffect(() => {
    setMounted(true)
    const tick = () => setTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const t = setInterval(tick, 10000)

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!data || data.role !== 'super_admin') {
        if (data?.role === 'manager') router.push('/manager')
        else if (data?.role === 'stock_staff') router.push('/stockstaff')
        else if (data?.role === 'cashier') router.push('/cashier')
        else if (data?.role === 'kitchen') router.push('/kitchen')
        else if (data?.role === 'bar') router.push('/bar')
        else router.push('/login')
        return
      }
      setProfile(data)
    }
    load()
    return () => clearInterval(t)
  }, [router, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const allowedNav = navItems.filter(item => !profile?.role || item.roles.includes(profile.role))
  const pageTitle = pageNames[pathname] || 'Admin'

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg-primary)' }}>

      {/* ── Desktop Sidebar ── */}
      <aside style={{
        width: 240, flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
        background: '#0c0e14',
        borderRight: '1px solid var(--border-color)',
        display: 'none'
      }} className="lg:!flex lg:flex-col">
        <SidebarContent allowedNav={allowedNav} onLogout={handleLogout} onNavigate={() => setSidebarOpen(false)} pathname={pathname} profile={profile} />
      </aside>

      {/* ── Mobile Sidebar Drawer ── */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} className="lg:hidden">
          {/* Backdrop */}
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside
            className="animate-slide-up"
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: '#0c0e14',
              borderRadius: '20px 20px 0 0',
              borderTop: '1px solid var(--border-color)',
              maxHeight: '88dvh',
              display: 'flex', flexDirection: 'column',
              paddingBottom: 'env(safe-area-inset-bottom)'
            }}
          >
            {/* Handle */}
            <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 999, margin: '10px auto 0', flexShrink: 0 }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SidebarContent allowedNav={allowedNav} onLogout={handleLogout} onNavigate={() => setSidebarOpen(false)} pathname={pathname} profile={profile} />
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Area ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }} className="lg:ml-[240px]">

        {/* Top bar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          height: 56, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
          padding: '0 16px',
          background: 'rgba(10,12,16,0.94)',
          borderBottom: '1px solid var(--border-color)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          flexShrink: 0
        }}>
          {/* Left: hamburger + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
              style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <Menu size={17} />
            </button>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pageTitle}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }} className="hidden sm:block">
                The Bottle Club · Admin
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Clock — hidden on small */}
            <div className="hidden md:flex items-center gap-1.5" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              <Clock size={13} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</span>
            </div>

            <Link
              href="/pos"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 9, textDecoration: 'none',
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.25)',
                color: '#93c5fd', fontSize: 12, fontWeight: 700,
                transition: 'all 150ms', whiteSpace: 'nowrap'
              }}
            >
              <ShoppingCart size={13} />
              <span className="hidden sm:inline">เปิด POS</span>
            </Link>

            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'white'
            }}>
              {profile ? profile.full_name.charAt(0).toUpperCase() : <CircleUserRound size={16} />}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, minWidth: 0 }}>
          <Heartbeat />
          {children}
        </main>
      </div>
    </div>
  )
}
