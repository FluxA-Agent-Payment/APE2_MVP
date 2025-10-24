"use client";

import { useState, useEffect } from "react";
import { Activity, Clock, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";

interface MandateStatus {
  mandateDigest: string;
  status: "enqueued" | "processing" | "settled" | "failed";
  timestamp: number;
  txHash?: string;
  error?: string;
}

export function SPPanel() {
  const [mandates, setMandates] = useState<MandateStatus[]>([]);
  const [spStatus, setSPStatus] = useState<{
    connected: boolean;
    queueLength: number;
    sp: string;
  } | null>(null);

  useEffect(() => {
    // Check SP health
    const checkHealth = async () => {
      try {
        const res = await fetch("http://localhost:3001/health");
        const data = await res.json();
        setSPStatus({
          connected: true,
          queueLength: data.queueLength || 0,
          sp: data.sp || "",
        });
      } catch (error) {
        setSPStatus({
          connected: false,
          queueLength: 0,
          sp: "",
        });
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  // Add mandate to tracking (would be called from parent or context)
  const addMandate = (digest: string) => {
    setMandates((prev) => [
      {
        mandateDigest: digest,
        status: "enqueued",
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  };

  const getStatusColor = (status: MandateStatus["status"]) => {
    switch (status) {
      case "enqueued":
        return "text-blue-400 bg-blue-500/20 border-blue-500/30";
      case "processing":
        return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
      case "settled":
        return "text-green-400 bg-green-500/20 border-green-500/30";
      case "failed":
        return "text-red-400 bg-red-500/20 border-red-500/30";
    }
  };

  const getStatusIcon = (status: MandateStatus["status"]) => {
    switch (status) {
      case "enqueued":
        return <Clock className="w-4 h-4" />;
      case "processing":
        return <Activity className="w-4 h-4 animate-pulse" />;
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-green-400" />
            <h2 className="text-xl font-semibold text-white">Settlement Processor</h2>
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
                {mandates.filter((m) => m.status === "settled").length}
              </div>
            </div>
          </div>
        )}

        {spStatus && spStatus.sp && (
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="text-xs text-gray-400 mb-1">SP Address</div>
            <div className="text-white font-mono text-xs">
              {spStatus.sp.slice(0, 10)}...{spStatus.sp.slice(-8)}
            </div>
          </div>
        )}

        {/* Mandates List */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            Mandate History
            {mandates.length > 0 && (
              <span className="ml-2 text-gray-400 font-normal">({mandates.length})</span>
            )}
          </h3>

          <div className="space-y-2">
            {mandates.length === 0 ? (
              <div className="p-8 text-center">
                <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <div className="text-gray-400 text-sm">No mandates yet</div>
                <div className="text-gray-500 text-xs mt-1">
                  Signed mandates will appear here
                </div>
              </div>
            ) : (
              mandates.map((mandate) => (
                <div
                  key={mandate.mandateDigest}
                  className={`p-3 rounded-lg border ${getStatusColor(mandate.status)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(mandate.status)}
                      <span className="text-xs font-semibold capitalize">
                        {mandate.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(mandate.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  <div className="text-xs font-mono text-gray-300 mb-2">
                    {mandate.mandateDigest.slice(0, 20)}...
                  </div>

                  {mandate.txHash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${mandate.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      View on BaseScan
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {mandate.error && (
                    <div className="mt-2 text-xs text-red-300">
                      Error: {mandate.error}
                    </div>
                  )}
                </div>
              ))
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
