"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Wallet, Download, LogOut, RefreshCw } from "lucide-react";
import { useWallet } from "./providers/WalletProvider";

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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);

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

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">AI Debit Wallet</h2>
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
        <p className="text-sm text-gray-400 mt-1">An ai wallet that allows your ai agent to spend your funds — assign a debit balance to your ai for autonomous payments.</p>
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
                  <div className="text-sm text-gray-400">Base Sepolia Testnet Address</div>
                  <button
                    onClick={fetchBalances}
                    disabled={refreshing}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="text-white font-mono text-sm text-ellipsis overflow-hidden">
                  {address}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">USDC Balance</div>
                  <div className="text-white font-semibold">{parseFloat(usdcBalance).toFixed(2)}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-400 mb-1">Debit Balance for AI</div>
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
                    Claim Test USDC
                  </>
                )}
              </button>

              <button
                onClick={depositToWallet}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Processing..." : "Deposit to Debit Balance"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
