import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { NavBar } from "@/components/nav-bar"
import { Toaster } from "@/components/ui/toaster"
import { WalletProvider } from "@/components/wallet-provider"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CUM Protocol | Cleverly Utilising Money",
  description:
    "Privacy-preserving shared liquidity protocol built on 1inch Aqua. Leverage your LP positions with n-x strategies without depositing to single AMMs.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased min-h-screen flex flex-col bg-background text-foreground`}>
        <WalletProvider>
          <NavBar />
          <main className="flex-1">{children}</main>
          <Toaster />
          <Analytics />
        </WalletProvider>
      </body>
    </html>
  )
}
