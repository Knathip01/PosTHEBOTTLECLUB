'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createBrowserClient } from '@supabase/ssr'
import {
  Settings, Save, Loader2, CheckCircle, ToggleLeft, User, Plus,
  AlertCircle, Store, Phone, MapPin, Receipt, Percent, RotateCcw, Bell, QrCode
} from 'lucide-react'

interface Setting {
  key: string
  value: string
}

const SETTING_DEFINITIONS: {
  key: string
  label: string
  description: string
  type: 'text' | 'toggle' | 'number'
  icon: React.ReactNode
  section: string
}[] = [
  { key: 'shop_name',         label: 'ชื่อร้าน',            description: 'ชื่อร้านที่แสดงบนใบเสร็จ',                type: 'text',   icon: <Store size={15} />,   section: 'ข้อมูลร้าน' },
  { key: 'shop_address',      label: 'ที่อยู่',              description: 'ที่อยู่ร้านค้า',                          type: 'text',   icon: <MapPin size={15} />,  section: 'ข้อมูลร้าน' },
  { key: 'shop_phone',        label: 'โทรศัพท์',             description: 'เบอร์โทรศัพท์ร้าน',                       type: 'text',   icon: <Phone size={15} />,   section: 'ข้อมูลร้าน' },
  { key: 'receipt_prefix',    label: 'คำนำหน้าเลขบิล',       description: 'ตัวอักษรนำหน้าเลขใบเสร็จ เช่น WC',        type: 'text',   icon: <Receipt size={15} />, section: 'ใบเสร็จ' },
  { key: 'vat_enabled',       label: 'เปิดใช้งานภาษี VAT',  description: 'เปิด/ปิด การคำนวณภาษีมูลค่าเพิ่ม',          type: 'toggle', icon: <Percent size={15} />, section: 'ภาษี' },
  { key: 'vat_rate',          label: 'อัตรา VAT (%)',         description: 'อัตราภาษีมูลค่าเพิ่ม (เช่น 7)',            type: 'number', icon: <Percent size={15} />, section: 'ภาษี' },
  { key: 'vat_included',      label: 'VAT รวมในราคา',         description: 'ถ้าเปิด ราคาสินค้าถือว่า VAT รวมอยู่แล้ว', type: 'toggle', icon: <Percent size={15} />, section: 'ภาษี' },
  { key: 'return_policy_days', label: 'จำนวนวันคืนสินค้า',   description: 'จำนวนวันที่อนุญาตให้คืนสินค้า',            type: 'number', icon: <RotateCcw size={15} />, section: 'นโยบาย' },
  { key: 'low_stock_alert',   label: 'จำนวนขั้นต่ำแจ้งเตือน', description: 'จำนวนสต๊อกที่ต่ำกว่านี้จะแจ้งเตือน',    type: 'number', icon: <Bell size={15} />,    section: 'สต๊อก' },
  { key: 'promptpay_id',      label: 'หมายเลข PromptPay',     description: 'เบอร์โทรศัพท์ / เลขบัตรประชาชน / Tax ID (10-13 หลัก) สำหรับรับชำระผ่าน QR', type: 'text', icon: <QrCode size={15} />,  section: 'PromptPay' },
  { key: 'bank_account_name', label: 'ชื่อบัญชี',              description: 'ชื่อที่แสดงบน QR Payment เช่น ชื่อร้านหรือชื่อเจ้าของ',                       type: 'text', icon: <Store size={15} />,   section: 'PromptPay' },
]

const sections = ['ข้อมูลร้าน', 'ใบเสร็จ', 'ภาษี', 'PromptPay', 'นโยบาย', 'สต๊อก']

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  // New user form
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState('cashier')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserPasswordConfirm, setNewUserPasswordConfirm] = useState('')
  const [showUserPass, setShowUserPass] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [userSuccess, setUserSuccess] = useState(false)
  const [userError, setUserError] = useState('')

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    setLoading(true)
    const { data } = await supabase.from('settings').select('*')
    const map: Record<string, string> = {}
    for (const row of (data as Setting[]) || []) {
      map[row.key] = row.value
    }
    // Set defaults for any missing keys
    for (const def of SETTING_DEFINITIONS) {
      if (!(def.key in map)) {
        if (def.type === 'toggle') map[def.key] = 'false'
        else if (def.type === 'number') map[def.key] = '0'
        else map[def.key] = ''
      }
    }
    setSettings(map)
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from('settings')
          .upsert({ key, value }, { onConflict: 'key' })
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: unknown) {
      setSaveError((err as Error).message || 'เกิดข้อผิดพลาด')
    }
    setSaving(false)
  }

  const handleToggle = (key: string) => {
    setSettings(prev => ({ ...prev, [key]: prev[key] === 'true' ? 'false' : 'true' }))
  }

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserName.trim() || !newUserPassword) {
      setUserError('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (newUserPassword.length < 6) {
      setUserError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }
    if (newUserPassword !== newUserPasswordConfirm) {
      setUserError('รหัสผ่านไม่ตรงกัน')
      return
    }

    setCreatingUser(true)
    setUserError('')
    try {
      // Create a temporary client that doesn't persist auth session
      const tempSupabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      )

      // Register the auth user
      const { data: authData, error: signUpErr } = await tempSupabase.auth.signUp({
        email: newUserEmail.trim(),
        password: newUserPassword,
        options: {
          data: { full_name: newUserName.trim() }
        }
      })

      if (signUpErr) throw new Error(signUpErr.message)
      if (!authData.user) throw new Error('ไม่สามารถสร้างผู้ใช้ระบบได้')

      // Insert profile record linked to auth user ID
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        full_name: newUserName.trim(),
        role: newUserRole,
        is_active: true,
      })
      if (profileErr) throw profileErr

      setUserSuccess(true)
      setNewUserEmail('')
      setNewUserName('')
      setNewUserPassword('')
      setNewUserPasswordConfirm('')
      setNewUserRole('cashier')
      setTimeout(() => setUserSuccess(false), 5000)
    } catch (err: unknown) {
      setUserError((err as Error).message || 'เกิดข้อผิดพลาด')
    }
    setCreatingUser(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--wine-500)' }} />
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: '980px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-1">ตั้งค่าระบบ</h1>
          <p style={{ color: 'var(--text-muted)' }} className="text-sm">จัดการการตั้งค่าร้านค้าและระบบ</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-wine flex items-center gap-2 px-6">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          บันทึก
        </button>
      </div>

      {/* Success/Error messages */}
      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
          <CheckCircle size={16} />
          <span className="text-sm font-medium">บันทึกการตั้งค่าเรียบร้อยแล้ว!</span>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          <AlertCircle size={16} />
          <span className="text-sm">{saveError}</span>
        </div>
      )}

      {/* Settings Sections */}
      <div className="space-y-6">
        {sections.map(section => {
          const defs = SETTING_DEFINITIONS.filter(d => d.section === section)
          if (defs.length === 0) return null
          return (
            <div key={section} className="glass-card overflow-hidden">
              {/* Section Header */}
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="text-sm font-semibold text-white">{section}</h3>
              </div>

              {/* Settings */}
              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {defs.map(def => (
                  <div key={def.key} className="flex items-center gap-4 p-5">
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(139,0,0,0.1)', color: 'var(--wine-300)' }}>
                      {def.icon}
                    </div>

                    {/* Label */}
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <p className="text-sm font-medium text-white">{def.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{def.description}</p>
                    </div>

                    {/* Control */}
                    <div className="shrink-0">
                      {def.type === 'toggle' ? (
                        <button
                          onClick={() => handleToggle(def.key)}
                          style={{
                            width: 48,
                            height: 26,
                            borderRadius: 13,
                            background: settings[def.key] === 'true' ? 'var(--wine-500)' : 'var(--bg-secondary)',
                            border: `1px solid ${settings[def.key] === 'true' ? 'var(--wine-300)' : 'var(--border-color)'}`,
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px',
                          }}>
                          <div style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: 'white',
                            transform: settings[def.key] === 'true' ? 'translateX(22px)' : 'translateX(0)',
                            transition: 'transform 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                          }} />
                        </button>
                      ) : (
                        <input
                          type={def.type === 'number' ? 'number' : 'text'}
                          value={settings[def.key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, [def.key]: e.target.value }))}
                          className="wine-input"
                          style={{ width: def.type === 'number' ? 100 : 220, textAlign: def.type === 'number' ? 'right' : 'left' }}
                          min={0}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create User Section */}
      <div className="glass-card mt-6">
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-2">
            <User size={14} style={{ color: 'var(--wine-300)' }} />
            <h3 className="text-sm font-semibold text-white">สร้างบัญชีผู้ใช้</h3>
          </div>
        </div>

        <div className="p-5">
          {/* Info notice */}
          <div className="flex items-start gap-2 p-3 rounded-xl mb-5"
            style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <AlertCircle size={15} style={{ color: '#c084fc', flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs" style={{ color: '#d8b4fe' }}>
              ระบุอีเมล ชื่อ-นามสกุล และรหัสผ่านที่ต้องการเพื่อสมัครบัญชีผู้ใช้ระบบและเชื่อมโปรไฟล์โดยตรงจากหน้านี้ได้ทันที
            </p>
          </div>

          {userSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
              <CheckCircle size={15} />
              <span className="text-sm">สร้างบัญชีผู้ใช้และโปรไฟล์สำเร็จแล้ว! สามารถล็อกอินเข้าใช้งานได้ทันที</span>
            </div>
          )}
          {userError && (
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
              <AlertCircle size={15} />
              <span className="text-sm">{userError}</span>
            </div>
          )}

          <div className="grid gap-4 animate-in text-secondary" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>อีเมล *</label>
              <input type="email" placeholder="user@example.com" value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)} className="wine-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ชื่อ-นามสกุล *</label>
              <input type="text" placeholder="ชื่อผู้ใช้" value={newUserName}
                onChange={e => setNewUserName(e.target.value)} className="wine-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>รหัสผ่าน *</label>
              <input type={showUserPass ? 'text' : 'password'} placeholder="อย่างน้อย 6 ตัวอักษร" value={newUserPassword}
                onChange={e => setNewUserPassword(e.target.value)} className="wine-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>ยืนยันรหัสผ่าน *</label>
              <input type={showUserPass ? 'text' : 'password'} placeholder="ยืนยันรหัสผ่าน" value={newUserPasswordConfirm}
                onChange={e => setNewUserPasswordConfirm(e.target.value)} className="wine-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>บทบาท</label>
              <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)}
                className="wine-input w-full">
                <option value="cashier">Cashier (แคชเชียร์)</option>
                <option value="stock_staff">Stock Staff (พนักงานสต๊อก)</option>
                <option value="manager">Manager (ผู้จัดการ)</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setShowUserPass(!showUserPass)}
                className="px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                {showUserPass ? 'ซ่อน' : 'แสดง'}
              </button>
              <button
                onClick={handleCreateUser}
                disabled={creatingUser}
                className="btn-wine flex items-center gap-2 w-full justify-center py-2.5">
                {creatingUser ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                สร้างบัญชีผู้ใช้
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <p className="text-xs font-medium text-white mb-1">ขั้นตอนการสร้างผู้ใช้งานและเริ่มต้น:</p>
            <ol className="text-xs space-y-1" style={{ color: 'var(--text-muted)', paddingLeft: 16 }}>
              <li>1. กรอกอีเมล ชื่อ รหัสผ่าน และเลือกบทบาทที่ต้องการสร้างด้านบน</li>
              <li>2. คลิกปุ่ม "สร้างบัญชีผู้ใช้" เพื่อให้ระบบสร้างบัญชีใน Auth และผูก Profile ทันที</li>
              <li>3. บัญชีที่ถูกสร้างจะได้รับสิทธิ์ตามบทบาทที่เลือก และสามารถล็อกอินเข้าระบบได้ทันที</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
