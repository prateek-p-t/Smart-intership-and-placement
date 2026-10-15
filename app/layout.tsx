import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pathway | Smart Internship & Placement Portal',
  description: 'A secure workspace connecting students, universities, and employers through transparent internship and placement workflows.',
  applicationName: 'Pathway',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f8f8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
