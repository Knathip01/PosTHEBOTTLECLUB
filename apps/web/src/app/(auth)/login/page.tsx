'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Wine, AlertCircle, Loader2 } from 'lucide-react'
import logoImg from '../../../../public/logo.jpg'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/pos'
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (authError) {
      if (authError.message === 'Invalid login credentials') {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      } else if (authError.message === 'Email not confirmed') {
        setError('บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาตั้งค่าปิดการยืนยันอีเมล (Confirm email) ใน Supabase Dashboard → Authentication → Providers → Email')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    let destination = searchParams.get('redirect') || ''

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single()
      
      if (profile) {
        if (profile.is_active === false) {
          await supabase.auth.signOut()
          setError('บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
          setLoading(false)
          return
        }

        if (!destination) {
          if (profile.role === 'super_admin') {
            destination = '/admin'
          } else if (profile.role === 'manager') {
            destination = '/manager'
          } else if (profile.role === 'stock_staff') {
            destination = '/stockstaff'
          } else if (profile.role === 'cashier') {
            destination = '/cashier'
          } else if (profile.role === 'kitchen') {
            destination = '/kitchen'
          } else if (profile.role === 'bar') {
            destination = '/bar'
          } else {
            destination = '/pos'
          }
        }
      } else {
        if (!destination) destination = '/pos'
      }
    } else if (!destination) {
      destination = '/pos'
    }

    router.push(destination)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(139,26,44,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(212,175,55,0.08) 0%, transparent 50%), var(--bg-primary)' }}>

      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, var(--wine-500), transparent)' }} />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, var(--gold-500), transparent)' }} />
        <div className="absolute top-1/2 left-1/4 text-9xl opacity-5 select-none">🍷</div>
        <div className="absolute bottom-1/4 right-1/3 text-7xl opacity-5 select-none rotate-12">🍾</div>
      </div>

      <div className="relative w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <img src={logoImg.src} alt="The Bottle Club Logo"
            style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', display: 'block', margin: '0 auto 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
          <h1 className="font-display text-3xl font-bold text-white mb-1">The Bottle Club</h1>
          <p style={{ color: 'var(--text-secondary)' }} className="text-sm">ระบบจัดการร้านขายเครื่องดื่ม</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          <h2 className="font-display text-xl font-semibold text-white mb-6">เข้าสู่ระบบ</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                อีเมล
              </label>
              <input
                type="email"
                className="wine-input"
                placeholder="admin@winecellar.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="wine-input pr-12"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{ background: 'rgba(139,26,44,0.15)', border: '1px solid rgba(139,26,44,0.3)', color: '#f5b8c8' }}>
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-wine flex items-center justify-center gap-2 py-3 text-base mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
