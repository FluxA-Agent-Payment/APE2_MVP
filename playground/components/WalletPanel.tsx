"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Wallet, Download, FileText, Copy, Check, LogOut, RefreshCw } from "lucide-react";
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
const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET_URL || "http://localhost:3003";

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const WALLET_ABI = [
  "function balances(address owner, address token) view returns (uint256)",
  "function deposit(address token, uint256 amount)",
];

export function WalletPanel() {
  const { address, provider, connect, disconnect, isConnecting } = useWallet();

  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [debitBalance, setDebitBalance] = useState<string>("0");
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [mandateBase64, setMandateBase64] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Form states
  const [payeeAddress, setPayeeAddress] = useState("0x2130797f2F66c06110fF298cC361fCA4d72e1499");
  const [amount, setAmount] = useState("0.001");
  const [reference, setReference] = useState("");

  // Fetch balances
  const fetchBalances = async () => {
    if (!address || !provider) return;

    try {
      setRefreshing(true);

      // USDC balance
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const usdcBal = await usdcContract.balanceOf(address);
      setUsdcBalance(ethers.formatUnits(usdcBal, 6));

      // Debit wallet balance
      const walletContract = new ethers.Contract(WALLET_CONTRACT, WALLET_ABI, provider);
      const debitBal = await walletContract.balances(address, USDC_ADDRESS);
      setDebitBalance(ethers.formatUnits(debitBal, 6));
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (address && provider) {
      fetchBalances();
    }
  }, [address, provider]);

  const claimFreeUSDC = async () => {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }

    try {
      setClaiming(true);

      const response = await fetch(`${FAUCET_URL}/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "RATE_LIMITED") {
          alert(`Please wait ${data.remainingMinutes} minutes before claiming again`);
        } else {
          alert(`Claim failed: ${data.message}`);
        }
        return;
      }

      alert(`Success! You received 3 USDC and 0.0001 ETH\nETH tx: ${data.transactions.eth.hash}\nUSDC tx: ${data.transactions.usdc.hash}`);

      // Refresh balances after a short delay
      setTimeout(() => {
        fetchBalances();
      }, 2000);
    } catch (error: any) {
      console.error("Error claiming from faucet:", error);
      alert("Failed to claim from faucet. Please make sure the faucet service is running.");
    } finally {
      setClaiming(false);
    }
  };

  const depositToWallet = async () => {
    if (!provider || !address) {
      alert("Please connect wallet first");
      return;
    }

    try {
      setLoading(true);
      const signer = await provider.getSigner();

      const depositAmount = prompt("Enter amount to deposit (USDC):", "1");
      if (!depositAmount) return;

      const amountWei = ethers.parseUnits(depositAmount, 6);

      // Approve USDC
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const approveTx = await usdcContract.approve(WALLET_CONTRACT, amountWei);
      await approveTx.wait();

      // Deposit
      const walletContract = new ethers.Contract(WALLET_CONTRACT, WALLET_ABI, signer);
      const depositTx = await walletContract.deposit(USDC_ADDRESS, amountWei);
      await depositTx.wait();

      alert("Deposit successful!");
      await fetchBalances();
    } catch (error: any) {
      console.error("Error depositing:", error);
      alert("Deposit failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const signMandate = async () => {
    if (!address || !provider) {
      alert("Please connect wallet first");
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
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-semibold text-white">Wallet</h2>
          </div>
          {address && (
            <button
              onClick={disconnect}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">Web3 Wallet with Real Balances</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Connect Wallet */}
        {!address ? (
          <div className="space-y-3">
            <button
              onClick={connect}
              disabled={isConnecting}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </>
              )}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Connect MetaMask or any Web3 wallet
            </p>
          </div>
        ) : (
          <>
            {/* Address & Balance */}
            <div className="space-y-3">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-400">Address</div>
                  <button
                    onClick={fetchBalances}
                    disabled={refreshing}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="text-white font-mono text-sm">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">USDC Balance</div>
                  <div className="text-white font-semibold">{parseFloat(usdcBalance).toFixed(2)}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Debit Balance</div>
                  <div className="text-white font-semibold">{parseFloat(debitBalance).toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={claimFreeUSDC}
                disabled={claiming}
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claiming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Claim Free USDC
                  </>
                )}
              </button>

              <button
                onClick={depositToWallet}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Processing..." : "Deposit to Debit Wallet"}
              </button>
            </div>

            {/* Mandate Section */}
            <div className="border-t border-white/10 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Payment Mandate</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Payee Address</label>
                  <input
                    type="text"
                    value={payeeAddress}
                    onChange={(e) => setPayeeAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-purple-500 focus:outline-none"
                    placeholder="0x..."
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Amount (USDC)</label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                    placeholder="0.001"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Reference (Optional)</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-purple-500 focus:outline-none"
                    placeholder="order-id"
                  />
                </div>

                <button
                  onClick={signMandate}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? "Signing..." : "Sign Mandate"}
                </button>
              </div>

              {/* Signed Mandate Display */}
              {mandate && (
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-black/20 rounded-lg border border-white/10">
                    <div className="text-xs text-gray-400 mb-2">JSON Format</div>
                    <pre className="text-xs text-green-400 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                      {JSON.stringify(mandate, null, 2)}
                    </pre>
                  </div>

                  <div className="p-3 bg-black/20 rounded-lg border border-white/10">
                    <div className="text-xs text-gray-400 mb-2">Base64 Format</div>
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
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
