'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail } from '@/lib/sanitize'
import { Eye, EyeOff, AlertCircle, Loader2, ShieldAlert, Clock, Mail, Lock, LogIn } from 'lucide-react'
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
        if (profile.role === 'super_admin') {
          await supabase.auth.signOut()
          setError('บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบนี้')
          setLoading(false)
          return
        }
        if (!destination) {
          const roleRoutes: Record<string, string> = {
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
    <div
      className="min-h-screen w-full relative flex items-center justify-center overflow-x-hidden p-4 sm:p-8"
      style={{
        backgroundImage: `url('/login_bg.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#EDE3C8',
      }}
    >
      {/* Subtle overlay for optimal contrast and readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.35) 0%, rgba(237,227,200,0.1) 100%)',
        }}
      />

      {/* Brand Badge (Top-left on tablet/desktop) */}
      <div
        className="absolute top-6 left-6 z-10 hidden sm:flex items-center gap-2.5"
        style={{
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1.5px solid rgba(35, 64, 168, 0.2)',
          borderRadius: 999,
          padding: '8px 18px',
          boxShadow: '0 4px 16px rgba(35, 64, 168, 0.08)',
        }}
      >
        <span style={{ fontSize: 16 }}>🍷</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: '#1E3A8A', letterSpacing: '0.04em' }}>
          THE BOTTLE CLUB POS
        </span>
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto my-auto">
        {/* Solid White Login Card */}
        <div
          className="rounded-3xl p-7 sm:p-9"
          style={{
            background: '#FFFFFF',
            border: '2px solid rgba(35, 64, 168, 0.15)',
            boxShadow: '0 24px 70px rgba(27, 43, 107, 0.2), 0 4px 20px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Card Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 22,
                overflow: 'hidden',
                background: '#FFFFFF',
                border: '2px solid rgba(35, 64, 168, 0.2)',
                boxShadow: '0 8px 24px rgba(35, 64, 168, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <img
                src={logoImg.src}
                alt="The Bottle Club"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(35, 64, 168, 0.08)',
                border: '1px solid rgba(35, 64, 168, 0.18)',
                padding: '3px 12px',
                borderRadius: 999,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 900, color: '#1E3A8A', letterSpacing: '0.06em' }}>
                THE BOTTLE CLUB
              </span>
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 900,
                color: '#0F172A',
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              เข้าสู่ระบบพนักงาน
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#475569' }}>
              ระบบจัดการร้านขายเครื่องดื่ม & POS
            </p>
          </div>

          {/* Lockout Banner */}
          {isLocked && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 14,
                background: '#FFF1F2',
                border: '1.5px solid #FDA4AF',
                marginBottom: 18,
              }}
            >
              <ShieldAlert size={22} style={{ color: '#E11D48', flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#9F1239' }}>
                  บัญชีถูกล็อคชั่วคราว
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#BE123C',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Clock size={12} />
                  กรุณาลองใหม่อีกครั้งใน {lockoutRemaining} วินาที
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#1E293B',
                  marginBottom: 6,
                }}
              >
                อีเมลพนักงาน
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={18}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748B',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="email"
                  placeholder="staff@thebottleclub.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  disabled={isLocked || loading}
                  autoComplete="email"
                  maxLength={254}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    borderRadius: 12,
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(35, 64, 168, 0.25)',
                    color: '#0F172A',
                    fontSize: 14,
                    fontWeight: 600,
                    outline: 'none',
                    transition: 'all 160ms ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2340A8'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(35,64,168,0.15)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(35,64,168,0.25)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#1E293B',
                  marginBottom: 6,
                }}
              >
                รหัสผ่าน
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748B',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLocked || loading}
                  autoComplete="current-password"
                  maxLength={128}
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 42px',
                    borderRadius: 12,
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(35, 64, 168, 0.25)',
                    color: '#0F172A',
                    fontSize: 14,
                    fontWeight: 600,
                    outline: 'none',
                    transition: 'all 160ms ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#2340A8'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(35,64,168,0.15)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(35,64,168,0.25)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 6,
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Attempts warning */}
            {attempts > 0 && !isLocked && attemptsLeft <= 3 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  color: '#B45309',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                <span>เหลือโอกาสอีก {attemptsLeft} ครั้ง ก่อนระบบล็อค {LOCKOUT_SECONDS} วินาที</span>
              </div>
            )}

            {/* Error Message */}
            {error && !isLocked && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: '#FEF2F2',
                  border: '1.5px solid #FCA5A5',
                  color: '#991B1B',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0, color: '#DC2626' }} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || isLocked}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 14,
                border: 'none',
                background: isLocked
                  ? '#94A3B8'
                  : 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: loading || isLocked ? 'not-allowed' : 'pointer',
                boxShadow: isLocked ? 'none' : '0 6px 20px rgba(35, 64, 168, 0.35)',
                transition: 'all 160ms ease',
                marginTop: 6,
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> กำลังเข้าสู่ระบบ...
                </>
              ) : isLocked ? (
                <>
                  <Clock size={18} /> รอสักครู่ ({lockoutRemaining}s)...
                </>
              ) : (
                <>
                  <LogIn size={18} /> เข้าสู่ระบบ
                </>
              )}
            </button>
          </form>

          {/* Footer inside card */}
          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: '1px solid rgba(35, 64, 168, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: '#64748B',
            }}
          >
            <span>🔒</span>
            <span>ระบบรักษาความปลอดภัย The Bottle Club POS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
