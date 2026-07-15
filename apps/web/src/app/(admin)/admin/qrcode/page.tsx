'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, ExternalLink, Download, Printer, Smartphone, Wine, Copy, Check, Grid } from 'lucide-react'

export default function QRCodePage() {
  const [selectedTable, setSelectedTable] = useState(1)
  const [copiedTable, setCopiedTable] = useState<number | null>(null)

  const getMenuUrl = (tableNo: number) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/menu?table=${tableNo}`
    }
    return `http://localhost:3000/menu?table=${tableNo}`
  }

  const copyUrl = async (tableNo: number) => {
    const url = getMenuUrl(tableNo)
    await navigator.clipboard.writeText(url)
    setCopiedTable(tableNo)
    setTimeout(() => setCopiedTable(null), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="animate-in" style={{ padding: '28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="font-display" style={{ fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 6 }}>QR Code ประจำโต๊ะลูกค้า (โต๊ะ 1 - 10)</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>สร้างบาร์โค้ดเฉพาะสำหรับแต่ละโต๊ะ เพื่อให้ลูกค้าระบุโต๊ะและสั่งซื้อสินค้าได้อย่างถูกต้อง</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, maxWidth: 800, margin: '0 auto' }} className="qr-layout-grid">
        
        {/* LEFT COLUMN: Table List & Table Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Table Select Grid */}
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ color: 'white', fontWeight: 600, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Grid size={16} style={{ color: 'var(--wine-400)' }} />
              เลือกโต๊ะที่ต้องการจัดการ
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                <button
                  key={num}
                  onClick={() => setSelectedTable(num)}
                  style={{
                    padding: '16px 10px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    background: selectedTable === num ? 'linear-gradient(135deg, var(--wine-600), var(--wine-400))' : 'var(--bg-card)',
                    borderColor: selectedTable === num ? 'transparent' : 'var(--border-color)',
                    color: selectedTable === num ? 'white' : 'var(--text-secondary)',
                    boxShadow: selectedTable === num ? '0 4px 15px rgba(139,26,44,0.3)' : 'none'
                  }}
                >
                  โต๊ะ {num}
                </button>
              ))}
            </div>
          </div>

          {/* QR Card Preview for Selected Table */}
          <div className="glass-card" style={{ padding: 32, textAlign: 'center', border: '1px solid rgba(212,175,55,0.2)' }}>
            <span style={{ background: 'var(--gold-500)', color: '#000', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, display: 'inline-block', marginBottom: 16 }}>
              ACTIVE: โต๊ะ {selectedTable}
            </span>

            {/* QR Print Target Wrapper */}
            <div id="qr-print-area" style={{ display: 'inline-block', background: 'white', borderRadius: 20, padding: 24, marginBottom: 20, boxShadow: '0 20px 60px rgba(139,26,44,0.3)' }}>
              <QRCodeSVG
                value={getMenuUrl(selectedTable)}
                size={220}
                level="H"
              />
              <div style={{ marginTop: 12, color: 'black', fontFamily: 'sans-serif' }}>
                <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>โต๊ะ {selectedTable}</p>
                <p style={{ fontSize: 10, color: '#555', margin: '4px 0 0' }}>สแกนเพื่อสั่งสินค้า</p>
              </div>
            </div>

            {/* URL Display */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, border: '1px solid var(--border-color)', maxWidth: 440, margin: '0 auto 16px' }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {getMenuUrl(selectedTable)}
              </span>
              <button onClick={() => copyUrl(selectedTable)} style={{ color: copiedTable === selectedTable ? '#4ade80' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                {copiedTable === selectedTable ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>

            {/* Print and Open buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={handlePrint} className="btn-wine" style={{ padding: '10px 24px', fontSize: 14, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Printer size={16} />
                พิมพ์รหัส QR โต๊ะ {selectedTable}
              </button>
              <a href={getMenuUrl(selectedTable)} target="_blank" rel="noreferrer"
                style={{ padding: '10px 24px', fontSize: 14, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                <ExternalLink size={16} />
                ทดสอบสั่ง
              </a>
            </div>
          </div>
        </div>

      </div>

      {/* Print-only CSS style override */}
      <style>{`
        @media print {
          body { background: white !important; }
          .qr-layout-grid { display: block !important; }
          .glass-card, #qr-print-area { background: white !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
          .qr-layout-grid > div:last-child { display: none !important; }
          .glass-card > button, .glass-card > div:first-child, .glass-card > div:last-child, h1, p, span { display: none !important; }
          #qr-print-area { display: block !important; margin: 40px auto !important; text-align: center !important; }
        }
      `}</style>
    </div>
  )
}
