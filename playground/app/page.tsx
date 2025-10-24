"use client";

import { WalletPanel } from "@/components/WalletPanel";
import { PayeePanel } from "@/components/PayeePanel";
import { SPPanel } from "@/components/SPPanel";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-white">
            AEP2 Playground
            <span className="ml-3 text-sm font-normal text-purple-300">
              Agent Embedded Payment Protocol v2
            </span>
          </h1>
        </div>
      </header>

      {/* Main Content - 3 Column Layout */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-6 h-[calc(100vh-120px)]">
          {/* Left Column - Wallet */}
          <div className="overflow-hidden">
            <WalletPanel />
          </div>

          {/* Middle Column - Payee API */}
          <div className="overflow-hidden">
            <PayeePanel />
          </div>

          {/* Right Column - SP Status */}
          <div className="overflow-hidden">
            <SPPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
