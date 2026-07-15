'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer } from '@/lib/types'
import { Search, X, User, Plus, Loader2, Phone, Star } from 'lucide-react'
import { getMemberLevelColor, getMemberLevelLabel } from '@/lib/utils'

interface CustomerSearchModalProps {
  onClose: () => void
  onSelect: (customer: Customer) => void
}

export default function CustomerSearchModal({ onClose, onSelect }: CustomerSearchModalProps) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (query.length >= 1) searchCustomers()
    else setCustomers([])
  }, [query])

  const searchCustomers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('customers')
      .select('*')
      .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%,member_code.ilike.%${query}%`)
      .eq('is_active', true)
      .limit(10)
    setCustomers(data || [])
    setLoading(false)
  }

  const handleAddCustomer = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const memberCode = `M${Date.now().toString().slice(-8)}`
    const { data, error } = await supabase
      .from('customers')
      .insert({ full_name: newName.trim(), phone: newPhone.trim() || null, member_code: memberCode })
      .select()
      .single()
    setSaving(false)
    if (!error && data) onSelect(data)
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-card w-full max-w-md" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="font-display text-lg font-bold text-white">ค้นหาลูกค้า</h2>
          <button onClick={onClose}><X size={20} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        <div className="p-5 flex-1 overflow-auto">
          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              autoFocus
              type="text"
              className="wine-input pl-10"
              placeholder="ชื่อ, เบอร์โทร, รหัสสมาชิก..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" style={{ color: 'var(--wine-400)' }} />
            </div>
          ) : customers.length > 0 ? (
            <div className="space-y-2">
              {customers.map(c => (
                <button key={c.id} onClick={() => onSelect(c)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--wine-500)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ background: 'rgba(139,26,44,0.2)', color: 'var(--wine-300)' }}>
                    {c.full_name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white text-sm">{c.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.phone && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Phone size={10} />{c.phone}</span>}
                      <span className={`text-xs font-medium ${getMemberLevelColor(c.member_level)}`}>
                        ⭐ {getMemberLevelLabel(c.member_level)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold" style={{ color: 'var(--gold-400)' }}>{c.points} แต้ม</p>
                    {c.member_code && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.member_code}</p>}
                  </div>
                </button>
              ))}
            </div>
          ) : query.length >= 1 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <User size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">ไม่พบลูกค้า</p>
            </div>
          ) : null}

          {/* Add New Customer */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl mt-4 text-sm font-medium transition-all"
              style={{ border: '1px dashed var(--border-color)', color: 'var(--text-secondary)' }}>
              <Plus size={16} />
              เพิ่มลูกค้าใหม่
            </button>
          ) : (
            <div className="mt-4 p-4 rounded-xl space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <p className="text-sm font-medium text-white">ลูกค้าใหม่</p>
              <input
                type="text"
                className="wine-input text-sm"
                placeholder="ชื่อ-นามสกุล *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <input
                type="tel"
                className="wine-input text-sm"
                placeholder="เบอร์โทร"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  ยกเลิก
                </button>
                <button onClick={handleAddCustomer} disabled={!newName.trim() || saving}
                  className="flex-1 btn-wine py-2 rounded-lg text-sm flex items-center justify-center gap-1">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  บันทึก
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
