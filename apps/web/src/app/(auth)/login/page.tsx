'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail } from '@/lib/sanitize'
import { Eye, EyeOff, AlertCircle, Loader2, ShieldAlert, Clock } from 'lucide-react'
import logoImg from '../../../../public/logo.jpg'

// ─── Rate Limiting Config ─────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5      // จำนวนครั้งสูงสุดที่ล็อกอินผิดได้
const LOCKOUT_SECONDS = 60  // ล็อคกี่วินาที

const STORAGE_KEY = 'tbc_login_attempts'

interface AttemptData {
  count: number
  lockedUntil: number | null
}

function getAttempts(): AttemptData {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { count: 0, lockedUntil: null }
    return JSON.parse(raw)
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

function saveAttempts(data: AttemptData) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

function resetAttempts() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Rate limiting state
  const [attempts, setAttempts] = useState(0)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // โหลด state จาก sessionStorage ตอน mount
  useEffect(() => {
    const data = getAttempts()
    setAttempts(data.count)
    if (data.lockedUntil) {
      const remaining = Math.ceil((data.lockedUntil - Date.now()) / 1000)
      if (remaining > 0) {
        setLockoutRemaining(remaining)
        startCountdown(remaining)
      } else {
        resetAttempts()
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const startCountdown = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setLockoutRemaining(seconds)
    timerRef.current = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          resetAttempts()
          setAttempts(0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const recordFailedAttempt = () => {
    const data = getAttempts()
    const newCount = data.count + 1
    if (newCount >= MAX_ATTEMPTS) {
      const lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000
      saveAttempts({ count: newCount, lockedUntil })
      setAttempts(newCount)
      startCountdown(LOCKOUT_SECONDS)
    } else {
      saveAttempts({ count: newCount, lockedUntil: null })
      setAttempts(newCount)
    }
  }

  const isLocked = lockoutRemaining > 0

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    // Rate limit check
    if (isLocked) return

    // Basic input validation
    if (!email.trim() || !password) {
      setError('กรุณากรอกอีเมลและรหัสผ่าน')
      return
    }
    if (!isValidEmail(email.trim())) {
      setError('รูปแบบอีเมลไม่ถูกต้อง')
      return
    }
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }

    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      recordFailedAttempt()
      const remaining = MAX_ATTEMPTS - (getAttempts().count)
      if (authError.message === 'Invalid login credentials') {
        setError(
          remaining > 0
            ? `อีเมลหรือรหัสผ่านไม่ถูกต้อง (เหลืออีก ${remaining} ครั้ง)`
            : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
        )
      } else if (authError.message === 'Email not confirmed') {
        setError('บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ')
      } else {
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
      }
      setLoading(false)
      return
    }

    // Login success → reset attempts
    resetAttempts()

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
          const roleRoutes: Record<string, string> = {
            super_admin: '/admin',
            manager: '/manager',
            stock_staff: '/stockstaff',
            cashier: '/cashier',
            kitchen: '/kitchen',
            bar: '/bar',
          }
          destination = roleRoutes[profile.role] || '/pos'
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

  const attemptsLeft = MAX_ATTEMPTS - attempts

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(139,26,44,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(212,175,55,0.08) 0%, transparent 50%), var(--bg-primary)' }}>

      {/* Background decorative */}
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

          {/* Lockout Banner */}
          {isLocked && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              marginBottom: 20
            }}>
              <ShieldAlert size={20} style={{ color: '#f87171', flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f87171' }}>
                  บัญชีถูกล็อคชั่วคราว
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={11} />
                  ลองใหม่ได้ใน {lockoutRemaining} วินาที
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                อีเมล
              </label>
              <input
                type="email"
                className="wine-input"
                placeholder="admin@thebottleclub.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={isLocked || loading}
                autoComplete="email"
                maxLength={254}
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
                  disabled={isLocked || loading}
                  autoComplete="current-password"
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Attempts warning */}
            {attempts > 0 && !isLocked && attemptsLeft <= 3 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fbbf24' }}>
                <ShieldAlert size={13} />
                เหลืออีก {attemptsLeft} ครั้ง ก่อนถูกล็อค {LOCKOUT_SECONDS} วินาที
              </div>
            )}

            {/* Error */}
            {error && !isLocked && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{ background: 'rgba(139,26,44,0.15)', border: '1px solid rgba(139,26,44,0.3)', color: '#f5b8c8' }}>
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full btn-wine flex items-center justify-center gap-2 py-3 text-base mt-2"
              style={{ opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> กำลังเข้าสู่ระบบ...</>
              ) : isLocked ? (
                <><Clock size={18} /> รอ {lockoutRemaining} วินาที...</>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>

          {/* Security note */}
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            🔒 การเชื่อมต่อนี้ได้รับการเข้ารหัสด้วย HTTPS
          </p>
        </div>
      </div>
    </div>
  )
}
