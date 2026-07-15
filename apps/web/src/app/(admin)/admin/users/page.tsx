'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createBrowserClient } from '@supabase/ssr'
import {
  UserCog, Plus, Search, Edit2, Trash2, Loader2,
  X, Save, Shield, ShieldCheck, ShieldOff, Eye, EyeOff,
  CheckCircle2, AlertCircle, Key, User, Mail, Phone,
  Crown, Coffee, Package, BarChart3, Lock
} from 'lucide-react'

interface Profile {
  id: string
  full_name: string
  role: RoleKey
  phone?: string
  is_active: boolean
  created_at: string
  updated_at: string
  email?: string
}

type RoleKey = 'super_admin' | 'manager' | 'cashier' | 'stock_staff'

const ROLE_CONFIG: Record<RoleKey, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode; desc: string
}> = {
  super_admin: {
    label: 'Super Admin',
    color: '#fcd34d',
    bg: 'rgba(245,158,11,0.15)',
    border: 'rgba(245,158,11,0.35)',
    icon: <Crown size={13} />,
    desc: 'เข้าถึงได้ทุกส่วน'
  },
  manager: {
    label: 'Manager',
    color: '#a78bfa',
    bg: 'rgba(139,92,246,0.15)',
    border: 'rgba(139,92,246,0.35)',
    icon: <ShieldCheck size={13} />,
    desc: 'จัดการสินค้า รายงาน และทีม'
  },
  cashier: {
    label: 'Cashier',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.15)',
    border: 'rgba(52,211,153,0.35)',
    icon: <Coffee size={13} />,
    desc: 'ขายสินค้าและรับชำระเงิน'
  },
  stock_staff: {
    label: 'Stock Staff',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.15)',
    border: 'rgba(96,165,250,0.35)',
    icon: <Package size={13} />,
    desc: 'จัดการสต๊อกสินค้า'
  }
}

export default function UsersPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | RoleKey>('all')

  // Modal state
  const [modal, setModal] = useState<'add' | 'edit' | 'password' | null>(null)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState<RoleKey>('cashier')
  const [formPassword, setFormPassword] = useState('')
  const [formPasswordConfirm, setFormPasswordConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadUsers()
    const interval = setInterval(loadUsers, 10000)
    return () => clearInterval(interval)
  }, [loadUsers])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    const matchQ = !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    return matchRole && matchQ
  })

  const openAdd = () => {
    setFormName(''); setFormEmail(''); setFormPhone('')
    setFormRole('cashier'); setFormPassword(''); setFormPasswordConfirm('')
    setError(''); setSuccess('')
    setModal('add')
  }

  const openEdit = (user: Profile) => {
    setSelectedUser(user)
    setFormName(user.full_name || '')
    setFormPhone(user.phone || '')
    setFormRole(user.role)
    setError(''); setSuccess('')
    setModal('edit')
  }

  const openPassword = (user: Profile) => {
    setSelectedUser(user)
    setFormPassword(''); setFormPasswordConfirm('')
    setError(''); setSuccess('')
    setModal('password')
  }

  const closeModal = () => {
    setModal(null); setSelectedUser(null); setError(''); setSuccess('')
  }

  // ── Create new user via Supabase Auth Admin ──
  const handleCreate = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword) {
      setError('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (formPassword.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (formPassword !== formPasswordConfirm) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }
    setSaving(true)
    setError('')

    try {
      // Create a temporary client that doesn't persist auth to prevent logging out the admin
      const tempSupabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      )

      // Sign up user without logging them into this browser session
      const { data: authData, error: signUpErr } = await tempSupabase.auth.signUp({
        email: formEmail.trim(),
        password: formPassword,
        options: {
          data: { full_name: formName.trim() }
        }
      })

      if (signUpErr) throw new Error(signUpErr.message)
      if (!authData.user) throw new Error('ไม่สามารถสร้างผู้ใช้ได้')

      // Insert profile
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        full_name: formName.trim(),
        role: formRole,
        phone: formPhone.trim() || null,
        is_active: true
      })

      if (profileErr) throw new Error(profileErr.message)

      setSuccess(`สร้างผู้ใช้ ${formName} สำเร็จแล้ว!`)
      await loadUsers()
      setTimeout(closeModal, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  // ── Update profile ──
  const handleUpdate = async () => {
    if (!selectedUser || !formName.trim()) { setError('กรุณากรอกชื่อ'); return }
    setSaving(true); setError('')

    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: formName.trim(), role: formRole, phone: formPhone.trim() || null })
      .eq('id', selectedUser.id)

    if (err) { setError(err.message); setSaving(false); return }
    setSuccess('อัพเดตข้อมูลสำเร็จ!')
    await loadUsers()
    setTimeout(closeModal, 1200)
    setSaving(false)
  }

  // ── Toggle active status ──
  const toggleActive = async (user: Profile) => {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    loadUsers()
  }

  // ── Delete (deactivate) ──
  const handleDelete = async (user: Profile) => {
    if (!confirm(`ยืนยันการปิดการใช้งาน ${user.full_name}?`)) return
    await supabase.from('profiles').update({ is_active: false }).eq('id', user.id)
    loadUsers()
  }

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: '1500px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-1">จัดการผู้ใช้งาน</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{users.filter(u => u.is_active).length} คนที่ใช้งานอยู่</p>
        </div>
        <button onClick={openAdd} className="btn-wine flex items-center gap-2 px-4 py-2.5 text-sm font-bold">
          <Plus size={16} /> เพิ่มผู้ใช้ใหม่
        </button>
      </div>

      {/* Role Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {(Object.entries(ROLE_CONFIG) as [RoleKey, typeof ROLE_CONFIG[RoleKey]][]).map(([key, cfg]) => (
          <button key={key} onClick={() => setRoleFilter(roleFilter === key ? 'all' : key)}
            className="glass-card text-left transition-all"
            style={{ padding: '14px 16px', cursor: 'pointer', border: `1px solid ${roleFilter === key ? cfg.border : 'var(--border-color)'}`, background: roleFilter === key ? cfg.bg : 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: cfg.color }}>{cfg.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'white', lineHeight: 1 }}>{roleCounts[key] || 0}</p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{cfg.desc}</p>
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="wine-input pl-9 text-sm" placeholder="ค้นหาชื่อ / อีเมล..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {roleFilter !== 'all' && (
          <button onClick={() => setRoleFilter('all')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
            <X size={12} /> ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Users Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--wine-400)' }} />
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {['ผู้ใช้งาน', 'Role', 'เบอร์โทร', 'สถานะ', 'สร้างเมื่อ', 'จัดการ'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => {
                  const role = ROLE_CONFIG[user.role] || ROLE_CONFIG.cashier
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>

                      {/* User info */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${role.color}33, ${role.color}11)`, border: `1.5px solid ${role.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, fontWeight: 700, color: role.color }}>
                            {user.full_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>{user.full_name || '—'}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>{user.email || 'ไม่มีอีเมล'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, background: role.bg, color: role.color, border: `1px solid ${role.border}` }}>
                          {role.icon} {role.label}
                        </span>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{user.phone || '—'}</span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                          <button onClick={() => toggleActive(user)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all 0.2s',
                              background: user.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color: user.is_active ? '#4ade80' : '#f87171',
                              borderColor: user.is_active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'
                            }}>
                            {user.is_active ? <><Shield size={11} /> ใช้งาน</> : <><ShieldOff size={11} /> ระงับการใช้งาน</>}
                          </button>
                          
                          {/* Online/Offline Status */}
                          {user.is_active && (
                            (() => {
                              const isOnline = new Date().getTime() - new Date(user.updated_at).getTime() < 45000
                              return (
                                <span className={isOnline ? "animate-pulse" : ""} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
                                  color: isOnline ? '#4ade80' : 'var(--text-muted)',
                                  paddingLeft: 4
                                }}>
                                  <span style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: isOnline ? '#4ade80' : '#9ca3af',
                                    display: 'inline-block',
                                    boxShadow: isOnline ? '0 0 6px #4ade80' : 'none'
                                  }} />
                                  {isOnline ? 'ออนไลน์ (กำลังใช้งาน)' : 'ออฟไลน์'}
                                </span>
                              )
                            })()
                          )}
                        </div>
                      </td>

                      {/* Created date */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(user.created_at).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ActionBtn icon={<Edit2 size={13} />} tooltip="แก้ไขข้อมูล" color="#a78bfa" onClick={() => openEdit(user)} />
                          <ActionBtn icon={<Key size={13} />} tooltip="เปลี่ยนรหัสผ่าน" color="#60a5fa" onClick={() => openPassword(user)} />
                          <ActionBtn icon={<Trash2 size={13} />} tooltip="ปิดการใช้งาน" color="#f87171" onClick={() => handleDelete(user)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                <UserCog size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
                <p>ไม่พบผู้ใช้งาน</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ADD USER MODAL ─── */}
      {modal === 'add' && (
        <Modal title="เพิ่มผู้ใช้ใหม่" onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">ชื่อ-นามสกุล *</label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="wine-input pl-9 text-sm" placeholder="ชื่อ นามสกุล" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">อีเมล *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="email" className="wine-input pl-9 text-sm" placeholder="email@example.com" value={formEmail} onChange={e => setFormEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">เบอร์โทร</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="tel" className="wine-input pl-9 text-sm" placeholder="0812345678" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">Role *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(Object.entries(ROLE_CONFIG) as [RoleKey, typeof ROLE_CONFIG[RoleKey]][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => setFormRole(key)}
                    style={{ padding: '10px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', textAlign: 'left', transition: 'all 0.15s',
                      background: formRole === key ? cfg.bg : 'var(--bg-card)',
                      borderColor: formRole === key ? cfg.border : 'var(--border-color)',
                      color: formRole === key ? cfg.color : 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ color: formRole === key ? cfg.color : 'var(--text-muted)' }}>{cfg.icon}</span>
                      {cfg.label}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{cfg.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">รหัสผ่าน *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type={showPass ? 'text' : 'password'} className="wine-input pl-9 pr-10 text-sm" placeholder="อย่างน้อย 6 ตัว" value={formPassword} onChange={e => setFormPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">ยืนยันรหัสผ่าน *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type={showPass ? 'text' : 'password'} className="wine-input pl-9 text-sm" placeholder="กรอกรหัสผ่านอีกครั้ง" value={formPasswordConfirm} onChange={e => setFormPasswordConfirm(e.target.value)} />
              </div>
              {formPassword && formPasswordConfirm && formPassword !== formPasswordConfirm && (
                <p style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>⚠ รหัสผ่านไม่ตรงกัน</p>
              )}
            </div>
            <FeedbackMsg error={error} success={success} />
            <ModalActions onCancel={closeModal} onConfirm={handleCreate} saving={saving} confirmLabel="สร้างผู้ใช้" />
          </div>
        </Modal>
      )}

      {/* ─── EDIT USER MODAL ─── */}
      {modal === 'edit' && selectedUser && (
        <Modal title={`แก้ไข: ${selectedUser.full_name}`} onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">ชื่อ-นามสกุล *</label>
              <input className="wine-input text-sm" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">เบอร์โทร</label>
              <input type="tel" className="wine-input text-sm" placeholder="0812345678" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Role *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(Object.entries(ROLE_CONFIG) as [RoleKey, typeof ROLE_CONFIG[RoleKey]][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => setFormRole(key)}
                    style={{ padding: '10px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', textAlign: 'left', transition: 'all 0.15s',
                      background: formRole === key ? cfg.bg : 'var(--bg-card)',
                      borderColor: formRole === key ? cfg.border : 'var(--border-color)',
                      color: formRole === key ? cfg.color : 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ color: formRole === key ? cfg.color : 'var(--text-muted)' }}>{cfg.icon}</span>
                      {cfg.label}
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{cfg.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <FeedbackMsg error={error} success={success} />
            <ModalActions onCancel={closeModal} onConfirm={handleUpdate} saving={saving} confirmLabel="บันทึกการเปลี่ยนแปลง" />
          </div>
        </Modal>
      )}

      {/* ─── CHANGE PASSWORD MODAL ─── */}
      {modal === 'password' && selectedUser && (
        <Modal title={`เปลี่ยนรหัสผ่าน: ${selectedUser.full_name}`} onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p style={{ color: '#fcd34d', fontSize: 12, lineHeight: 1.6 }}>
                ⚠️ การเปลี่ยนรหัสผ่านจะมีผลทันที ผู้ใช้ต้องใช้รหัสผ่านใหม่ในการ Login ครั้งถัดไป
              </p>
            </div>
            <div>
              <label className="form-label">รหัสผ่านใหม่ *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type={showPass ? 'text' : 'password'} className="wine-input pl-9 pr-10 text-sm" placeholder="อย่างน้อย 6 ตัว" value={formPassword} onChange={e => setFormPassword(e.target.value)} autoFocus />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">ยืนยันรหัสผ่านใหม่ *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type={showPass ? 'text' : 'password'} className="wine-input pl-9 text-sm" placeholder="กรอกอีกครั้ง" value={formPasswordConfirm} onChange={e => setFormPasswordConfirm(e.target.value)} />
              </div>
              {formPassword && formPasswordConfirm && formPassword !== formPasswordConfirm && (
                <p style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>⚠ รหัสผ่านไม่ตรงกัน</p>
              )}
            </div>
            <FeedbackMsg error={error} success={success} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>ยกเลิก</button>
              <button
                disabled={saving || !formPassword || formPassword !== formPasswordConfirm}
                onClick={async () => {
                  if (formPassword.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัว'); return }
                  setSaving(true); setError('')
                  // Note: Admin password reset requires service role key in production
                  // Here we update via Supabase Auth admin API if available
                  setSuccess('⚠️ กรุณาใช้ Supabase Dashboard → Authentication → Users → Reset Password หรือส่ง Reset Link ไปที่อีเมลผู้ใช้')
                  setSaving(false)
                }}
                className="btn-wine"
                style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving || !formPassword || formPassword !== formPasswordConfirm ? 0.5 : 1, cursor: saving || !formPassword || formPassword !== formPasswordConfirm ? 'not-allowed' : 'pointer' }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Key size={15} />}
                เปลี่ยนรหัสผ่าน
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Styles */}
      <style>{`
        .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .pl-9 { padding-left: 36px !important; }
        .pr-10 { padding-right: 38px !important; }
      `}</style>
    </div>
  )
}

// ── Reusable components ──

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div className="glass-card w-full" style={{ maxWidth: 520, maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="font-display font-bold text-white" style={{ fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

function FeedbackMsg({ error, success }: { error: string; success: string }) {
  if (error) return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
      <AlertCircle size={14} style={{ color: '#fca5a5', flexShrink: 0 }} />
      <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>
    </div>
  )
  if (success) return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
      <CheckCircle2 size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
      <p style={{ color: '#4ade80', fontSize: 13 }}>{success}</p>
    </div>
  )
  return null
}

function ModalActions({ onCancel, onConfirm, saving, confirmLabel }: { onCancel: () => void; onConfirm: () => void; saving: boolean; confirmLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button onClick={onCancel} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>ยกเลิก</button>
      <button onClick={onConfirm} disabled={saving} className="btn-wine"
        style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {saving ? 'กำลังบันทึก...' : confirmLabel}
      </button>
    </div>
  )
}

function ActionBtn({ icon, tooltip, color, onClick }: { icon: React.ReactNode; tooltip: string; color: string; onClick: () => void }) {
  return (
    <button title={tooltip} onClick={onClick}
      style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text-muted)', transition: 'all 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = color; (e.currentTarget as HTMLElement).style.background = `${color}18` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
      {icon}
    </button>
  )
}
