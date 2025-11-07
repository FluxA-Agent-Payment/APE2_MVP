"use client";

import { useState, useEffect } from "react";
import { Activity, Clock, CheckCircle, AlertTriangle, ExternalLink, Zap, Loader2 } from "lucide-react";

interface MandateHistory {
  mandateDigest: string;
  payer: string;
  payee: string;
  amount: string;
  status: "enqueued" | "settled" | "failed";
  enqueuedAt: number;
  settledAt?: number;
  txHash?: string;
}

export function SPPanel() {
  const [mandates, setMandates] = useState<MandateHistory[]>([]);
  const [spStatus, setSPStatus] = useState<{
    connected: boolean;
    queueLength: number;
    settled: number;
    sp: string;
  } | null>(null);

  useEffect(() => {
    // Check SP health
    const checkHealth = async () => {
      try {
        const spUrl = process.env.NEXT_PUBLIC_SP_URL || "http://localhost:3001";
        const res = await fetch(`${spUrl}/health`);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        setSPStatus({
          connected: true,
          queueLength: data.queueLength || 0,
          settled: data.settled || 0,
          sp: data.sp || "",
        });

        // Update mandates from history (already ordered DESC from backend)
        if (data.history && Array.isArray(data.history)) {
          // Ensure all required fields are present and handle both payer/owner
          const validMandates = data.history.map((m: any) => ({
            mandateDigest: m.mandateDigest || m.mandate_digest || "",
            payer: m.payer || m.owner || "",
            payee: m.payee || "",
            amount: m.amount || "0",
            status: (m.status || "enqueued") as "enqueued" | "settled" | "failed",
            enqueuedAt: m.enqueuedAt || m.enqueued_at || Math.floor(Date.now() / 1000),
            settledAt: m.settledAt || m.settled_at || undefined,
            txHash: m.txHash || m.tx_hash || undefined,
          })).filter((m: any) => m.mandateDigest); // Filter out invalid entries
          
          setMandates(validMandates);
        } else {
          setMandates([]);
        }
      } catch (error) {
        setSPStatus({
          connected: false,
          queueLength: 0,
          settled: 0,
          sp: "",
        });
        setMandates([]);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 2000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: MandateHistory["status"]) => {
    switch (status) {
      case "enqueued":
        return "text-blue-400 bg-blue-500/20 border-blue-500/30";
      case "settled":
        return "text-green-400 bg-green-500/20 border-green-500/30";
      case "failed":
        return "text-red-400 bg-red-500/20 border-red-500/30";
    }
  };

  const getStatusIcon = (status: MandateHistory["status"]) => {
    switch (status) {
      case "enqueued":
        return <Clock className="w-4 h-4" />;
      case "settled":
        return <CheckCircle className="w-4 h-4" />;
      case "failed":
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-semibold text-white">On-Chain Settlement</h2>
          </div>
          <div className={`flex items-center gap-2 text-xs ${
            spStatus?.connected ? "text-green-400" : "text-red-400"
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              spStatus?.connected ? "bg-green-400 animate-pulse" : "bg-red-400"
            }`} />
            {spStatus?.connected ? "Connected" : "Disconnected"}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Payments enqueued in Step 3 are settled here on-chain. This happens <strong>after</strong> the API response.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* SP Info */}
        {spStatus && spStatus.connected && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="text-xs text-gray-400 mb-1">Queue Length</div>
              <div className="text-2xl font-bold text-white">{spStatus.queueLength}</div>
            </div>
            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="text-xs text-gray-400 mb-1">Settled</div>
              <div className="text-2xl font-bold text-green-400">
                {spStatus.settled}
              </div>
            </div>
          </div>
        )}

        {spStatus && spStatus.sp && (
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="text-xs text-gray-400 mb-1">SP Address</div>
            <div className="text-white font-mono text-xs">
              {spStatus.sp?.slice(0, 10)}...{spStatus.sp?.slice(-8)}
            </div>
          </div>
        )}

        {/* Mandates List */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            Latest Mandates
          </h3>

          <div className="space-y-2">
            {mandates.length === 0 ? (
              <div className="p-8 text-center">
                <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <div className="text-gray-400 text-sm">No mandates yet</div>
                <div className="text-gray-500 text-xs mt-1">
                  {spStatus?.connected ? (
                    <>
                      Make a payment request in Step 3 to see mandates here.
                      <br />
                      <span className="text-gray-600 mt-2 block">
                        Queue: {spStatus.queueLength} | Settled: {spStatus.settled}
                      </span>
                    </>
                  ) : (
                    "Signed mandates will appear here"
                  )}
                </div>
              </div>
            ) : (
              mandates.map((mandate) => {
                const timeDiff = mandate.settledAt 
                  ? mandate.settledAt - mandate.enqueuedAt 
                  : Math.floor(Date.now() / 1000) - mandate.enqueuedAt;
                
                return (
                  <div
                    key={mandate.mandateDigest}
                    className={`p-4 rounded-lg border ${getStatusColor(mandate.status)}`}
                  >
                    {/* Payment Lifecycle Timeline */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-white">Payment Lifecycle</span>
                      </div>
                      <div className="space-y-2">
                        {/* Step 1: Enqueued */}
                        <div className="flex items-center gap-2 text-xs">
                          <div className={`w-2 h-2 rounded-full ${
                            mandate.status === "enqueued" 
                              ? "bg-amber-400 animate-pulse" 
                              : "bg-green-400"
                          }`}></div>
                          <span className={mandate.status === "enqueued" ? "text-amber-300" : "text-green-300"}>
                            ✓ Enqueued (Step 3)
                          </span>
                          <span className="text-gray-400 ml-auto text-[10px]">
                            {new Date(mandate.enqueuedAt * 1000).toLocaleTimeString()}
                          </span>
                        </div>
                        
                        {/* Step 2: Settling */}
                        {mandate.status === "enqueued" && (
                          <div className="flex items-center gap-2 text-xs">
                            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                            <span className="text-blue-300">⏳ Settling on-chain...</span>
                            <span className="text-gray-400 ml-auto text-[10px]">
                              {timeDiff > 0 ? `${timeDiff}s ago` : "Now"}
                            </span>
                          </div>
                        )}
                        
                        {/* Step 3: Settled */}
                        {mandate.status === "settled" && mandate.settledAt && (
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="text-green-300">✓ Settled on-chain</span>
                            <span className="text-gray-400 ml-auto text-[10px]">
                              {new Date(mandate.settledAt * 1000).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                        
                        {/* Time difference */}
                        {mandate.settledAt && (
                          <div className="ml-4 text-[10px] text-gray-500">
                            ⏱️ Settled {timeDiff}s after enqueue
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start justify-between mb-2 pt-3 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(mandate.status)}
                        <span className="text-xs font-semibold capitalize">
                          {mandate.status}
                        </span>
                      </div>
                      {mandate.status === "enqueued" && (
                        <span className="text-xs text-amber-300 animate-pulse">Deferred</span>
                      )}
                    </div>

                    <div className="text-xs font-mono text-gray-300 mb-2">
                      {mandate.mandateDigest?.slice(0, 20)}...
                    </div>

                    <div className="text-xs text-gray-400 space-y-0.5 mb-2">
                      <div>From: {mandate.payer?.slice(0, 10)}...{mandate.payer?.slice(-4)}</div>
                      <div>To: {mandate.payee?.slice(0, 10)}...{mandate.payee?.slice(-4)}</div>
                      <div>Amount: {(parseInt(mandate.amount || "0") / 1e6).toFixed(2)} USDC</div>
                    </div>

                    {mandate.settledAt && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                        <div className="text-xs text-green-300 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Settled at {new Date(mandate.settledAt * 1000).toLocaleTimeString()}
                        </div>
                        {mandate.txHash && (
                          <a
                            href={`https://sepolia.basescan.org/tx/${mandate.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View on BaseScan
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Help Text */}
        {!spStatus?.connected && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="text-sm text-red-300">
              <strong>SP Not Connected</strong>
              <p className="mt-2 text-xs">
                Make sure the Settlement Processor is running:
              </p>
              <code className="block mt-2 text-xs bg-black/30 p-2 rounded">
                npm run sp
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
