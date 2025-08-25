import type { Metadata } from 'next'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/components/providers/query-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter'
})

const notoSansJP = Noto_Sans_JP({ 
  subsets: ['latin'],
  variable: '--font-noto'
})

export const metadata: Metadata = {
  title: 'LINE UID取得システム',
  description: 'LINEログインでユーザーIDを取得し、Googleフォームに送信するWebアプリケーション',
  keywords: ['LINE', 'LIFF', 'Google Forms', 'ユーザーID'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}>
      <body className="font-noto antialiased bg-background text-foreground">
        <QueryProvider>
          <TooltipProvider>
            <main>{children}</main>
            <Toaster />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}