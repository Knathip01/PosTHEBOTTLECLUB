/**
 * Input Sanitization Utilities
 * ป้องกัน XSS และ Injection attacks บน user-generated content
 */

/**
 * ลบ HTML tags และอักขระอันตรายออกจาก string
 * ใช้กับ: report titles, notes, customer names, any user input ที่จะถูก render
 */
export function sanitizeText(input: string, maxLength = 500): string {
  if (!input || typeof input !== 'string') return ''

  return input
    // ลบ HTML/Script tags
    .replace(/<[^>]*>/g, '')
    // ลบ javascript: protocol
    .replace(/javascript:/gi, '')
    // ลบ on* event handlers
    .replace(/on\w+\s*=/gi, '')
    // ลบ null bytes
    .replace(/\0/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // จำกัดความยาว
    .slice(0, maxLength)
}

/**
 * Sanitize สำหรับ Receipt / Bill numbers (ตัวเลข + ตัวอักษร + dash เท่านั้น)
 */
export function sanitizeReceiptNo(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 50)
}

/**
 * ตรวจสอบว่า email format ถูกต้อง
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

/**
 * ป้องกัน SQL-like injection ใน search queries
 * (Supabase ป้องกัน SQL injection อยู่แล้ว แต่ sanitize ไว้เพิ่มความปลอดภัย)
 */
export function sanitizeSearchQuery(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/[;<>'"\\]/g, '')
    .trim()
    .slice(0, 100)
}
