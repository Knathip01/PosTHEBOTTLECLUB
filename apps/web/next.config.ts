import type { NextConfig } from "next";

const securityHeaders = [
  // ป้องกัน Clickjacking — ไม่ให้ฝัง site ใน iframe ของคนอื่น
  { key: 'X-Frame-Options', value: 'DENY' },
  // ป้องกัน MIME Sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // ป้องกัน XSS บน browser เก่า
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // บังคับ HTTPS บน Vercel (HSTS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // ควบคุม Referrer information
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // จำกัด Browser permissions
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // Content Security Policy — ป้องกัน XSS/injection
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Supabase API
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      // Scripts: self + inline (จำเป็นสำหรับ Next.js)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Styles: self + inline (จำเป็นสำหรับ CSS-in-JS)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images: self + data URIs (สำหรับ camera capture) + Supabase storage
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
      // Media: blob (สำหรับ camera preview)
      "media-src 'self' blob:",
      // ไม่อนุญาต iframe จากภายนอก
      "frame-ancestors 'none'",
      // ไม่อนุญาต form submit ไปยัง domain อื่น
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },

  // ป้องกัน Server info leaking
  poweredByHeader: false,
};

export default nextConfig;
