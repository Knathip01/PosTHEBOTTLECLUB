import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateStr))
}

export function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateStr))
}

export function generateReceiptNo(prefix: string = 'WC'): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.getTime().toString().slice(-6)
  return `${prefix}${date}${time}`
}

export function generateHoldNo(): string {
  return `HOLD${Date.now().toString().slice(-8)}`
}

export function generateStockReceiptNo(): string {
  return `SR${Date.now().toString().slice(-10)}`
}

export function getMemberLevelColor(level: string): string {
  switch (level) {
    case 'platinum': return 'text-cyan-300'
    case 'gold': return 'text-yellow-400'
    case 'silver': return 'text-gray-300'
    default: return 'text-amber-700'
  }
}

export function getMemberLevelLabel(level: string): string {
  switch (level) {
    case 'platinum': return 'Platinum'
    case 'gold': return 'Gold'
    case 'silver': return 'Silver'
    default: return 'Bronze'
  }
}

export function getRoleLabel(role: string): string {
  switch (role) {
    case 'super_admin': return 'Super Admin'
    case 'manager': return 'Manager'
    case 'cashier': return 'Cashier'
    case 'stock_staff': return 'Stock Staff'
    default: return role
  }
}

export function getRoleColor(role: string): string {
  switch (role) {
    case 'super_admin': return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    case 'manager': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    case 'cashier': return 'bg-green-500/20 text-green-300 border-green-500/30'
    case 'stock_staff': return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
    default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30'
  }
}
