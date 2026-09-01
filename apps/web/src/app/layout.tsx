import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Wine Cellar POS',
  description: 'ระบบ POS สำหรับร้านไวน์',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
