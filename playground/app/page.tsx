"use client";

import { WalletProvider } from "@/components/providers/WalletProvider";
import { WalletPanel } from "@/components/WalletPanel";
import { MandatePanel } from "@/components/MandatePanel";
import { PayeePanel } from "@/components/PayeePanel";
import { SPPanel } from "@/components/SPPanel";

interface StepHeaderProps {
  step: number;
  title: string;
}

function StepHeader({ step, title }: StepHeaderProps) {
  return (
    <div className="flex flex-col items-center mb-6">
      <div className="w-auto px-8 py-2 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg mb-3">
        Step {step}
      </div>
      <h2 className="text-lg font-semibold text-white text-center px-2">
        {title}
      </h2>
    </div>
  );
}

export default function Home() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-600 via-blue-900 to-slate-500">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-white">
              AEP2 Playground
              <span className="ml-3 text-sm font-normal text-white">
                Learn how embedded payment works step by step
              </span>
            </h1>
            <div className="mt-2 px-2 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg max-w-4xl">
              <p className="text-xs text-amber-200">
                <strong>💡 Deferred Payment Concept:</strong> The server returns results <strong>immediately</strong> (Step 3), 
                while the payment transaction is settled on-chain <strong>later</strong> (Step 4). 
                This enables fast API responses without waiting for blockchain confirmation.
              </p>
            </div>
          </div>
        </header>

      {/* Main Content - 4 Column Layout with Horizontal Scroll */}
      <main className="px-6 py-8 overflow-x-auto">
        <div className="flex gap-6 min-w-max h-[calc(100vh-120px)] mx-auto justify-center">
          {/* Column 1 - Create AI Debit Wallet */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={1} title="Create AI Debit Wallet" />
            <WalletPanel />
          </div>

          {/* Column 2 - Sign Payment Mandate */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={2} title="Sign Payment Mandates" />
            <MandatePanel />
          </div>

          {/* Column 3 - Embedded Mandate into HTTP Request */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={3} title="API Request → Immediate Response" />
            <PayeePanel />
          </div>

          {/* Column 4 - Deferred Settlement */}
          <div className="w-[400px] flex-shrink-0">
            <StepHeader step={4} title="On-Chain Settlement (Later)" />
            <SPPanel />
          </div>
        </div>
      </main>
      </div>
    </WalletProvider>
  );
}
