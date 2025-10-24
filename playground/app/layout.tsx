"use client";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PrivyProvider } from "@privy-io/react-auth";
import { WalletProvider } from "@/components/providers/WalletProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "clxxx"}
          config={{
            appearance: {
              theme: "dark",
              accentColor: "#9333ea",
            },
            loginMethods: ["google", "email"],
            defaultChain: {
              id: 84532,
              name: "Base Sepolia",
              network: "base-sepolia",
              nativeCurrency: {
                decimals: 18,
                name: "Ether",
                symbol: "ETH",
              },
              rpcUrls: {
                default: {
                  http: ["https://sepolia.base.org"],
                },
                public: {
                  http: ["https://sepolia.base.org"],
                },
              },
              blockExplorers: {
                default: {
                  name: "BaseScan",
                  url: "https://sepolia.basescan.org",
                },
              },
            },
          }}
        >
          <WalletProvider>
            {children}
          </WalletProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
