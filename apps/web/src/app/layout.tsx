import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { TRPCProvider } from '@/trpc/client'
import './globals.css'

/**
 * No third-party telemetry is mounted here, deliberately — see README,
 * decision 7. Route paths in this app carry patient identifiers
 * (`/patients/[id]`), so page-view reporting is a PHI disclosure, not a
 * metrics choice.
 *
 * `next/font` is not an exception: it downloads Inter at build time and serves
 * it from this origin, so no request reaches Google from a patient's browser.
 */

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Fastehr — Clinic EHR',
  description:
    'Fastehr clinical EHR: patient queues, scheduling, charting, refills, SMS, and reporting for weight-management clinics.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#1a6b6b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`light ${inter.variable} bg-background`}>
      <body className="font-sans antialiased">
        {/*
          The provider is a Client Component, but `children` are passed through
          it as an already-rendered server tree — so wrapping the whole app
          costs no page its static rendering.
        */}
        <TRPCProvider>{children}</TRPCProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
