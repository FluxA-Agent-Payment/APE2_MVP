"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";

interface WalletContextType {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  provider: null,
  connect: async () => {},
  disconnect: () => {},
  isConnecting: false,
  error: null,
});

export const useWallet = () => useContext(WalletContext);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      if (!authenticated) {
        await login();
      }
    } catch (err: any) {
      console.error("Error connecting wallet:", err);
      setError(err.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    logout();
    setAddress(null);
    setProvider(null);
  };

  // Update address and provider when wallets change
  useEffect(() => {
    const setupWallet = async () => {
      if (!authenticated || wallets.length === 0) {
        setAddress(null);
        setProvider(null);
        return;
      }

      try {
        const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy");

        if (embeddedWallet) {
          const walletAddress = embeddedWallet.address;
          setAddress(walletAddress);

          // Get EIP-1193 provider from Privy wallet
          const eip1193Provider = await embeddedWallet.getEthereumProvider();

          // Wrap in ethers BrowserProvider
          const ethersProvider = new ethers.BrowserProvider(eip1193Provider);

          // Switch to Base Sepolia if needed
          const network = await ethersProvider.getNetwork();
          const targetChainId = 84532;

          if (Number(network.chainId) !== targetChainId) {
            try {
              await eip1193Provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${targetChainId.toString(16)}` }],
              });
            } catch (switchError: any) {
              console.error("Error switching network:", switchError);
            }
          }

          setProvider(ethersProvider);
        }
      } catch (err) {
        console.error("Error setting up wallet:", err);
        setError("Failed to set up wallet provider");
      }
    };

    if (ready) {
      setupWallet();
    }
  }, [authenticated, wallets, ready]);

  return (
    <WalletContext.Provider
      value={{
        address,
        provider,
        connect,
        disconnect,
        isConnecting: isConnecting || !ready,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
