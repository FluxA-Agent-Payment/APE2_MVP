"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

interface SolanaWalletContextType {
  publicKey: PublicKey | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  connection: Connection;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: (transaction: any) => Promise<any>;
}

const SolanaWalletContext = createContext<SolanaWalletContextType | undefined>(undefined);

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [connection] = useState(() => new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet"), 
    "confirmed"
  ));

  // Check for existing Phantom connection on mount
  useEffect(() => {
    const checkPhantomConnection = async () => {
      if (typeof window !== "undefined" && "solana" in window) {
        const solana = (window as any).solana;
        if (solana?.isPhantom) {
          try {
            const response = await solana.connect({ onlyIfTrusted: true });
            setPublicKey(new PublicKey(response.publicKey.toString()));
            setConnected(true);
          } catch (err) {
            // Not previously connected
          }
        }
      }
    };
    checkPhantomConnection();
  }, []);

  const connect = async () => {
    if (typeof window !== "undefined" && "solana" in window) {
      const solana = (window as any).solana;
      if (solana?.isPhantom) {
        try {
          const response = await solana.connect();
          setPublicKey(new PublicKey(response.publicKey.toString()));
          setConnected(true);
        } catch (err) {
          console.error("Failed to connect:", err);
          throw new Error("Failed to connect to Phantom wallet");
        }
      } else {
        throw new Error("Phantom wallet not found. Please install it from phantom.app");
      }
    } else {
      throw new Error("Phantom wallet not available");
    }
  };

  const disconnect = () => {
    if (typeof window !== "undefined" && "solana" in window) {
      const solana = (window as any).solana;
      if (solana?.isPhantom) {
        solana.disconnect();
      }
    }
    
    setPublicKey(null);
    setConnected(false);
  };

  const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
    if (!connected) {
      throw new Error("Wallet not connected");
    }

    if (typeof window !== "undefined" && "solana" in window) {
      const solana = (window as any).solana;
      if (solana?.isPhantom) {
        const { signature } = await solana.signMessage(message, "utf8");
        return signature;
      }
    }
    
    throw new Error("Unable to sign message");
  };

  const signTransaction = async (transaction: any): Promise<any> => {
    if (!connected) {
      throw new Error("Wallet not connected");
    }

    if (typeof window !== "undefined" && "solana" in window) {
      const solana = (window as any).solana;
      if (solana?.isPhantom) {
        return await solana.signTransaction(transaction);
      }
    }
    
    throw new Error("Unable to sign transaction");
  };

  return (
    <SolanaWalletContext.Provider
      value={{
        publicKey,
        connected,
        connect,
        disconnect,
        connection,
        signMessage,
        signTransaction,
      }}
    >
      {children}
    </SolanaWalletContext.Provider>
  );
}

export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext);
  if (context === undefined) {
    throw new Error("useSolanaWallet must be used within a SolanaWalletProvider");
  }
  return context;
}

