"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { FileText, Copy, Check } from "lucide-react";
import { useWallet } from "./providers/WalletProvider";

interface Mandate {
  owner: string;
  token: string;
  payee: string;
  amount: string;
  nonce: string;
  deadline: number;
  ref: string;
}

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDR || "0x81bb48C38d6127cEd513804Bfb4828622eb3D0d4";
const WALLET_CONTRACT = process.env.NEXT_PUBLIC_WALLET_ADDR || "0x91d861cD4d2F5d8Ffb31CB7308388CA5e6999912";

export function MandatePanel() {
  const { address, provider } = useWallet();

  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [mandateBase64, setMandateBase64] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [payeeAddress, setPayeeAddress] = useState("0x2130797f2F66c06110fF298cC361fCA4d72e1499");
  const [amount, setAmount] = useState("0.001");
  const [reference, setReference] = useState("");

  const signMandate = async () => {
    if (!address || !provider) {
      alert("Please connect wallet first in Step 1");
      return;
    }

    try {
      setLoading(true);

      // Check network
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== 84532) {
        alert("Please switch to Base Sepolia network (Chain ID: 84532)");
        setLoading(false);
        return;
      }

      const signer = await provider.getSigner();

      const mandateData: Mandate = {
        owner: ethers.getAddress(address),
        token: ethers.getAddress(USDC_ADDRESS),
        payee: ethers.getAddress(payeeAddress),
        amount: ethers.parseUnits(amount, 6).toString(),
        nonce: Math.floor(Math.random() * 1000000).toString(),
        deadline: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        ref: reference || ethers.id(`ref-${Date.now()}`),
      };

      // EIP-712 Domain
      const domain = {
        name: "AEP2DebitWallet",
        version: "1",
        chainId: 84532,
        verifyingContract: ethers.getAddress(WALLET_CONTRACT),
      };

      // EIP-712 Types
      const types = {
        Mandate: [
          { name: "owner", type: "address" },
          { name: "token", type: "address" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "ref", type: "bytes32" },
        ],
      };

      const signature = await signer.signTypedData(domain, types, mandateData);

      setMandate(mandateData);

      // Create base64 encoding
      const payload = JSON.stringify({
        mandate: mandateData,
        payerSig: signature,
      });
      const base64 = Buffer.from(payload).toString("base64");
      setMandateBase64(base64);

    } catch (error) {
      console.error("Error signing mandate:", error);
      alert("Error signing mandate: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copyBase64 = () => {
    navigator.clipboard.writeText(mandateBase64);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!address ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-center">
              Please connect your wallet in Step 1 first
            </p>
          </div>
        ) : (
          <>
            {/* Mandate Form */}
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Create a payment mandate to authorize a payee to debit from your wallet.
              </p>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Payee Address</label>
                <input
                  type="text"
                  value={payeeAddress}
                  onChange={(e) => setPayeeAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-blue-500 focus:outline-none"
                  placeholder="0x..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Amount (USDC)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="0.001"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Reference (Optional)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-blue-500 focus:outline-none"
                  placeholder="order-id"
                />
              </div>

              <button
                onClick={signMandate}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Signing..." : "Sign Mandate"}
              </button>
            </div>

            {/* Signed Mandate Display */}
            {mandate && (
              <div className="space-y-3 border-t border-white/10 pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-semibold text-white">Signed Mandate</h3>
                </div>

                <div className="p-3 bg-black/20 rounded-lg border border-white/10">
                  <div className="text-xs text-gray-400 mb-2">JSON Format</div>
                  <pre className="text-xs text-green-400 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                    {JSON.stringify(mandate, null, 2)}
                  </pre>
                </div>

                <div className="p-3 bg-black/20 rounded-lg border border-white/10">
                  <div className="text-xs text-gray-400 mb-2">Base64 Format (for HTTP Header)</div>
                  <div className="text-xs text-blue-400 font-mono break-all max-h-20 overflow-y-auto">
                    {mandateBase64}
                  </div>
                  <button
                    onClick={copyBase64}
                    className="mt-2 w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Base64
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <p className="text-xs text-blue-300">
                    ✓ Mandate signed successfully! Copy the Base64 string and use it in Step 3 to make a payment request.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
