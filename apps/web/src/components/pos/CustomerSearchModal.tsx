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
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(12px)' }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 24, border: '1.5px solid rgba(35,64,168,0.2)',
        boxShadow: '0 20px 60px rgba(15,23,42,0.25)', width: '100%', maxWidth: 440,
        maxHeight: '84vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', background: '#2340A8', borderBottom: '1px solid rgba(255,255,255,0.15)'
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#FFFFFF' }}>ค้นหาลูกค้า</h2>
          <button onClick={onClose} style={{
            width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(255,255,255,0.18)', color: '#FFFFFF', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#1E3A8A' }} />
            <input
              autoFocus
              type="text"
              style={{
                width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12,
                background: '#F8FAFC', border: '1.5px solid rgba(35,64,168,0.25)',
                color: '#0F172A', fontSize: 14, fontWeight: 700, outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="ชื่อ, เบอร์โทร, รหัสสมาชิก..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Results */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Loader2 className="animate-spin" size={24} style={{ color: '#1E3A8A' }} />
            </div>
          ) : customers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customers.map(c => (
                <button key={c.id} onClick={() => onSelect(c)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    background: '#FFFFFF', border: '1.5px solid rgba(35,64,168,0.18)',
                    boxShadow: '0 1px 4px rgba(35,64,168,0.04)', transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#2340A8';
                    (e.currentTarget as HTMLElement).style.background = '#F8FAFC';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(35,64,168,0.18)';
                    (e.currentTarget as HTMLElement).style.background = '#FFFFFF';
                  }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 900, fontSize: 15, flexShrink: 0,
                    background: '#EEF2FF', color: '#1E3A8A', border: '1px solid #C7D2FE'
                  }}>
                    {c.full_name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 900, color: '#0F172A', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {c.phone && <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={11} />{c.phone}</span>}
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#047857', background: '#DCFCE7', padding: '1px 6px', borderRadius: 4 }}>
                        ⭐ {getMemberLevelLabel(c.member_level)}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#92400E' }}>{c.points} แต้ม</p>
                    {c.member_code && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B', fontWeight: 700, fontFamily: 'monospace' }}>{c.member_code}</p>}
                  </div>
                </button>
              ))}
            </div>
          ) : query.length >= 1 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748B' }}>
              <User size={36} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>ไม่พบข้อมูลลูกค้า</p>
            </div>
          ) : null}

          {/* Add New Customer */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 12, marginTop: 14, fontSize: 13, fontWeight: 900,
                border: '2px dashed rgba(35,64,168,0.3)', background: '#F8FAFC', color: '#1E3A8A',
                cursor: 'pointer', transition: 'all 0.15s ease'
              }}>
              <Plus size={16} />
              เพิ่มลูกค้าใหม่
            </button>
          ) : (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: '#F8FAFC', border: '1.5px solid rgba(35,64,168,0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#0F172A' }}>ข้อมูลลูกค้าใหม่</p>
              <input
                type="text"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, background: '#FFFFFF',
                  border: '1.5px solid rgba(35,64,168,0.25)', color: '#0F172A', fontSize: 13, fontWeight: 700, outline: 'none', boxSizing: 'border-box'
                }}
                placeholder="ชื่อ-นามสกุล *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <input
                type="tel"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, background: '#FFFFFF',
                  border: '1.5px solid rgba(35,64,168,0.25)', color: '#0F172A', fontSize: 13, fontWeight: 700, outline: 'none', boxSizing: 'border-box'
                }}
                placeholder="เบอร์โทร"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowAdd(false)} style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #CBD5E1',
                  background: '#FFFFFF', color: '#334155', fontSize: 13, fontWeight: 800, cursor: 'pointer'
                }}>
                  ยกเลิก
                </button>
                <button onClick={handleAddCustomer} disabled={!newName.trim() || saving} style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #1E3A8A, #2340A8)', color: '#FFFFFF',
                  fontSize: 13, fontWeight: 900, cursor: newName.trim() && !saving ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 2px 8px rgba(35,64,168,0.3)'
                }}>
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
