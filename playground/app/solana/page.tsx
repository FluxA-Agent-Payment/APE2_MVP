"use client";

import { SolanaWalletPanel } from "@/components/SolanaWalletPanel";
import { SolanaMandatePanel } from "@/components/SolanaMandatePanel";
import { PayeePanel } from "@/components/PayeePanel";
import { SPPanel } from "@/components/SPPanel";

interface StepHeaderProps {
  step: number;
  title: string;
}

function StepHeader({ step, title }: StepHeaderProps) {
  return (
    <div className="flex flex-col items-center mb-6">
      <div className="w-auto px-8 py-2 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-lg mb-3">
        Step {step}
      </div>
      <h2 className="text-lg font-semibold text-white text-center px-2">
        {title}
      </h2>
    </div>
  );
}

export default function SolanaPlayground() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-white">
            AEP2 Solana Playground
            <span className="ml-3 text-sm font-normal text-white">
              Learn how embedded payment works on Solana step by step
            </span>
          </h1>
        </div>
      </header>

      {/* Main Content - 4 Column Layout with Horizontal Scroll */}
      <main className="px-6 py-8 overflow-x-auto">
        <div className="flex gap-6 min-w-max h-[calc(100vh-120px)] mx-auto justify-center">
          {/* Column 1 - Create Solana Debit Wallet */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={1} title="Create Solana Debit Wallet" />
            <SolanaWalletPanel />
          </div>

          {/* Column 2 - Sign Payment Mandate */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={2} title="Sign Payment Mandates" />
            <SolanaMandatePanel />
          </div>

          {/* Column 3 - Embedded Mandate into HTTP Request */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={3} title="Embed Mandate into HTTP Request" />
            <PayeePanel />
          </div>

          {/* Column 4 - Deferred Settlement */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={4} title="Deferred Settlement" />
            <SPPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

