"use client";

import { SolanaWalletProvider } from "@/components/providers/SolanaWalletProvider";

export default function SolanaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>;
}

