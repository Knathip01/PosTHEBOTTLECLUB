import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'เมนูสั่งสินค้า | The Bottle Club',
  description: 'สั่งไวน์และเครื่องดื่มพรีเมียมจากเมนูดิจิทัล — The Bottle Club',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#08090d',
}

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
