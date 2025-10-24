"use client";

import { useState } from "react";
import { Server, Send, AlertCircle, CheckCircle2 } from "lucide-react";

export function PayeePanel() {
  const [headers, setHeaders] = useState<{ [key: string]: string }>({
    "X-Payment-Mandate": "",
  });
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestTime, setRequestTime] = useState<number>(0);

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

      const res = await fetch("http://localhost:3002/predict", {
        method: "GET",
        headers: requestHeaders,
      });

      const data = await res.json();

      const endTime = performance.now();
      const duration = endTime - startTime;
      setRequestTime(duration);

      if (!res.ok) {
        setError(data.message || `HTTP ${res.status}`);
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

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Server className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">ETH Price Pridiction  API</h2>
        </div>
        <p className="text-sm text-gray-400 mt-1">This is a pay-per-use api that provides 5-minute eth price predictions based on crypto market–driven large-model forecasts. </p>
        <p className="text-sm text-gray-400 mt-1">GET /predict - ETH-USD Price Oracle</p>
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
                      <div className="mt-2 text-xs text-green-400">
                        ✓ Payment processed: {response.data.payment.status}
                      </div>
                    )}
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
