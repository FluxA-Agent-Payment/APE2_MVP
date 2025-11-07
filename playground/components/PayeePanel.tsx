"use client";

import { useState, useEffect, useRef } from "react";
import { Server, Send, AlertCircle, CheckCircle2, Clock, ArrowRight, Zap } from "lucide-react";

export function PayeePanel() {
  const [headers, setHeaders] = useState<{ [key: string]: string }>({
    "X-Payment-Mandate": "",
  });
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestTime, setRequestTime] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<"enqueued" | "settled" | "failed" | null>(null);
  const [mandateDigest, setMandateDigest] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendRequest = async () => {
    try {
      setLoading(true);
      setError(null);
      setResponse(null);
      setRequestTime(0);

      const requestHeaders: HeadersInit = {};
      Object.entries(headers).forEach(([key, value]) => {
        if (value.trim()) {
          requestHeaders[key] = value;
        }
      });

      const startTime = performance.now();

      const payeeUrl = process.env.NEXT_PUBLIC_PAYEE_URL || "http://localhost:3002";
      const res = await fetch(`${payeeUrl}/predict`, {
        method: "GET",
        headers: requestHeaders,
      });

      const data = await res.json();

      const endTime = performance.now();
      const duration = endTime - startTime;
      setRequestTime(duration);

      if (!res.ok) {
        setError(data.message || `HTTP ${res.status}`);
      } else {
        // Dispatch payment success event to refresh wallet balance
        if (data.payment?.status === "enqueued") {
          window.dispatchEvent(new CustomEvent('payment-success'));
          
          // Store mandate digest for status tracking
          const digest = data.payment?.spReceipt?.mandateDigest;
          if (digest) {
            setMandateDigest(digest);
            setPaymentStatus("enqueued");
            // Start polling for settlement status
            startPollingStatus(digest);
          }
        }
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateHeader = (key: string, value: string) => {
    setHeaders({
      ...headers,
      [key]: value,
    });
  };

  // Poll SP health endpoint to check payment status
  const checkPaymentStatus = async (digest: string) => {
    try {
      const spUrl = process.env.NEXT_PUBLIC_SP_URL || "http://localhost:3001";
      const res = await fetch(`${spUrl}/health`);
      const data = await res.json();
      
      if (data.history) {
        const mandate = data.history.find((m: any) => m.mandateDigest === digest);
        if (mandate) {
          const newStatus = mandate.status as "enqueued" | "settled" | "failed";
          
          // Update payment status and response data
          setPaymentStatus((prevStatus) => {
            // Only update if status changed
            if (prevStatus !== newStatus) {
              // Update response data with new status
              setResponse((prev: any) => {
                if (prev && prev.data && prev.data.payment) {
                  return {
                    ...prev,
                    data: {
                      ...prev.data,
                      payment: {
                        ...prev.data.payment,
                        status: newStatus,
                        settledAt: mandate.settledAt,
                        txHash: mandate.txHash,
                      },
                    },
                  };
                }
                return prev;
              });
              
              // Stop polling if settled or failed
              if (newStatus === "settled" || newStatus === "failed") {
                stopPollingStatus();
              }
              
              return newStatus;
            }
            return prevStatus;
          });
        }
      }
    } catch (error) {
      console.error("Error checking payment status:", error);
    }
  };

  const startPollingStatus = (digest: string) => {
    // Clear any existing polling
    stopPollingStatus();
    
    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(() => {
      checkPaymentStatus(digest);
    }, 2000);
  };

  const stopPollingStatus = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPollingStatus();
    };
  }, []);

  // Reset payment status when sending new request
  useEffect(() => {
    if (loading) {
      stopPollingStatus();
      setPaymentStatus(null);
      setMandateDigest(null);
    }
  }, [loading]);

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Server className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">ETH Price Prediction API</h2>
        </div>
        <p className="text-sm text-gray-400 mt-1">This is a pay-per-use API that provides 5-minute ETH price predictions based on crypto market–driven large-model forecasts.</p>
        <p className="text-sm text-gray-400 mt-1">GET /predict - ETH-USD Price Oracle</p>
        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-200">
          <strong>⚡ Fast Response:</strong> API returns results immediately. Payment is settled on-chain later (see Step 4).
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Request Section */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">HTTP Headers</h3>
          <div className="space-y-3">
            {Object.entries(headers).map(([key, value]) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1">{key}</label>
                <textarea
                  value={value}
                  onChange={(e) => updateHeader(key, e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs font-mono focus:border-blue-500 focus:outline-none resize-none"
                  rows={3}
                  placeholder="Paste base64 encoded mandate here..."
                />
              </div>
            ))}
          </div>

          <button
            onClick={sendRequest}
            disabled={loading}
            className="mt-4 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {loading ? "Sending HTTP Request..." : "Send HTTP Request"}
          </button>
        </div>

        {/* Response Section */}
        {(response || error) && (
          <div className="border-t border-white/10 pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Response
                {error ? (
                  <span className="flex items-center gap-1 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    Error
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-400 text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    {response?.status}
                  </span>
                )}
              </h3>
              {requestTime > 0 && (
                <div className="text-xs font-semibold text-purple-400 bg-purple-900/20 px-3 py-1 rounded-full border border-purple-500/30">
                  ⚡ {requestTime.toFixed(0)}ms
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="text-red-400 text-sm">{error}</div>
              </div>
            )}

            {response && (
              <div className="space-y-3">
                {/* Status */}
                <div className="p-3 bg-black/20 rounded-lg border border-white/10">
                  <div className="text-xs text-gray-400 mb-1">Status</div>
                  <div className={`text-sm font-semibold ${
                    response.status === 200 ? "text-green-400" :
                    response.status === 402 ? "text-yellow-400" :
                    "text-red-400"
                  }`}>
                    {response.status} {response.statusText}
                  </div>
                </div>

                {/* Data */}
                <div className="p-3 bg-black/20 rounded-lg border border-white/10">
                  <div className="text-xs text-gray-400 mb-2">Response Data</div>
                  <pre className="text-xs text-white font-mono overflow-x-auto">
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>

                {/* Highlight Price if available */}
                {response.data?.price && (
                  <div className="p-4 bg-gradient-to-r from-blue-500/20 to-blue-500/20 rounded-lg border border-blue-500/30">
                    <div className="text-sm text-gray-400 mb-1">ETH-USD Price</div>
                    <div className="text-3xl font-bold text-white">
                      ${response.data.price.toFixed(2)}
                    </div>
                    {response.data.payment && (
                      <div className={`mt-2 text-xs ${
                        (response.data.payment.status === "settled" || paymentStatus === "settled")
                          ? "text-green-400"
                          : "text-amber-400"
                      }`}>
                        {paymentStatus === "settled" || response.data.payment.status === "settled" ? (
                          <>✓ Payment settled on-chain</>
                        ) : (
                          <>⏳ Payment enqueued: {response.data.payment.status}</>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Deferred Payment Status - Prominent Display (only show when enqueued) */}
                {response.data?.payment && 
                 (response.data.payment.status === "enqueued" || paymentStatus === "enqueued") &&
                 paymentStatus !== "settled" && 
                 response.data.payment.status !== "settled" && (
                  <div className="p-4 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 rounded-lg border-2 border-amber-500/40 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-500/30 rounded-lg">
                        <Clock className="w-5 h-5 text-amber-300" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-amber-300" />
                          <h4 className="text-sm font-bold text-amber-200">Deferred Payment</h4>
                        </div>
                        <p className="text-xs text-amber-100 mb-3">
                          <strong>Payment is NOT settled yet!</strong> The server returned results immediately, 
                          but the transaction will be settled on-chain later.
                        </p>
                        
                        {/* Payment Timeline */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="text-green-300">✓ API Response Received</span>
                            <span className="text-gray-400 ml-auto">{requestTime.toFixed(0)}ms</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                            <span className="text-amber-300">⏳ Payment Enqueued</span>
                            <span className="text-gray-400 ml-auto">Pending</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                            <span className="text-gray-400">⏸️ On-Chain Settlement</span>
                            <span className="text-gray-500 ml-auto">→ Step 4</span>
                          </div>
                        </div>

                        {/* Connection to Step 4 */}
                        <div className="mt-3 pt-3 border-t border-amber-500/30">
                          <div className="flex items-center gap-2 text-xs text-amber-200">
                            <ArrowRight className="w-4 h-4" />
                            <span>Check <strong>Step 4</strong> to see when payment is settled on-chain</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Status Badge */}
                {(response.data?.payment || paymentStatus) && (
                  <div className={`p-3 rounded-lg border ${
                    (response.data?.payment?.status === "enqueued" || paymentStatus === "enqueued")
                      ? "bg-amber-500/10 border-amber-500/30" 
                      : (response.data?.payment?.status === "settled" || paymentStatus === "settled")
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-gray-500/10 border-gray-500/30"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {(response.data?.payment?.status === "enqueued" || paymentStatus === "enqueued") ? (
                          <Clock className="w-4 h-4 text-amber-400" />
                        ) : (response.data?.payment?.status === "settled" || paymentStatus === "settled") ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="text-xs font-semibold text-white">
                          Payment Status: <span className="capitalize">
                            {paymentStatus || response.data?.payment?.status || "unknown"}
                          </span>
                        </span>
                      </div>
                      {(response.data?.payment?.status === "enqueued" || paymentStatus === "enqueued") && (
                        <span className="text-xs text-amber-300 animate-pulse">Deferred</span>
                      )}
                      {(response.data?.payment?.status === "settled" || paymentStatus === "settled") && (
                        <span className="text-xs text-green-300">✓ Settled</span>
                      )}
                    </div>
                    {(response.data?.payment?.status === "settled" || paymentStatus === "settled") && response.data?.payment?.txHash && (
                      <div className="mt-2 text-xs text-green-300">
                        ✓ Transaction: {response.data.payment.txHash.slice(0, 20)}...
                      </div>
                    )}
                  </div>
                )}

                {/* Settled Payment Success Display */}
                {(response.data?.payment?.status === "settled" || paymentStatus === "settled") && (
                  <div className="p-4 bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-green-500/20 rounded-lg border-2 border-green-500/40">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-green-500/30 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-300" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-green-300" />
                          <h4 className="text-sm font-bold text-green-200">Payment Settled On-Chain</h4>
                        </div>
                        <p className="text-xs text-green-100 mb-3">
                          <strong>Payment completed!</strong> The transaction has been successfully settled on-chain.
                        </p>
                        
                        {/* Updated Payment Timeline */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="text-green-300">✓ API Response Received</span>
                            <span className="text-gray-400 ml-auto">{requestTime.toFixed(0)}ms</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="text-green-300">✓ Payment Enqueued</span>
                            <span className="text-gray-400 ml-auto">Completed</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            <span className="text-green-300">✓ On-Chain Settlement</span>
                            <span className="text-gray-400 ml-auto">Completed</span>
                          </div>
                        </div>

                        {response.data?.payment?.txHash && (
                          <div className="mt-3 pt-3 border-t border-green-500/30">
                            <div className="text-xs text-green-200">
                              Transaction Hash: <span className="font-mono">{response.data.payment.txHash.slice(0, 20)}...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Help Text */}
        {!response && !error && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="text-sm text-blue-300">
              <strong>How to use:</strong>
              <ol className="mt-2 space-y-1 text-xs list-decimal list-inside">
                <li>Sign a mandate in the Wallet panel</li>
                <li>Copy the Base64 encoded mandate</li>
                <li>Paste it into the X-Payment-Mandate header</li>
                <li>Click "Send Request" to get the ETH-USD price</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
