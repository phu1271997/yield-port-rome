"use client";

import React, { useEffect, useState } from "react";
import { useConnect, Connector } from "wagmi";
import { X, Wallet, ExternalLink, Loader2, AlertCircle, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KNOWN_WALLETS = [
  {
    name: "MetaMask",
    url: "https://metamask.io/download/",
    badge: "Popular EVM",
  },
  {
    name: "Rabby Wallet",
    url: "https://rabby.io/",
    badge: "Recommended EVM",
  },
  {
    name: "Phantom",
    url: "https://phantom.app/",
    badge: "EVM mode supported",
  },
  {
    name: "Coinbase Wallet",
    url: "https://www.coinbase.com/wallet",
    badge: "EVM",
  },
];

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { connectors, connect, isPending, variables, error } = useConnect();
  const [hasCheckedProviders, setHasCheckedProviders] = useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Request EIP-6963 providers once mounted
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      const t = setTimeout(() => setHasCheckedProviders(true), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter & deduplicate connectors
  const distinctConnectors: Connector[] = [];
  const seenIds = new Set<string>();

  for (const c of connectors) {
    const key = c.name.toLowerCase();
    if (!seenIds.has(key)) {
      seenIds.add(key);
      distinctConnectors.push(c);
    }
  }

  // If specific EIP-6963 wallets are detected, hide generic 'injected' fallback
  const displayConnectors =
    distinctConnectors.length > 1
      ? distinctConnectors.filter((c) => c.id !== "injected")
      : distinctConnectors;

  const handleConnect = (connector: Connector) => {
    connect(
      { connector },
      {
        onSuccess: () => {
          toast.success(`Connected to ${connector.name}!`);
          onClose();
        },
        onError: (err) => {
          const msg = (err as Error)?.message || "Failed to connect wallet";
          if (msg.includes("User rejected")) {
            toast.error("Connection request was rejected in your wallet.");
          } else {
            toast.error(`Connection failed: ${msg}`);
          }
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl relative space-y-5 text-slate-900 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Connect EVM Wallet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                EIP-6963 Multi-Wallet Discovery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Honest Notice */}
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <span>Rome EVM Network</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
            Connect any EVM wallet (MetaMask, Rabby, Phantom in EVM mode). Solana-wallet login is
            planned for a future upgrade.
          </p>
        </div>

        {/* Connector List */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
            Detected Wallets
          </div>

          {displayConnectors.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {displayConnectors.map((connector) => {
                const pendingId = (variables?.connector as { id?: string } | undefined)?.id;
                const isConnectingThis = isPending && pendingId === connector.id;
                const isPhantom = connector.name.toLowerCase().includes("phantom");

                return (
                  <button
                    key={connector.id}
                    onClick={() => handleConnect(connector)}
                    disabled={isPending}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-amber-500/50 transition-all text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      {connector.icon ? (
                        <img
                          src={connector.icon}
                          alt={connector.name}
                          className="w-7 h-7 rounded-lg object-contain"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-xs">
                          {connector.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span>{connector.name}</span>
                          {isPhantom && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium border border-purple-500/20">
                              EVM mode
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {isPhantom ? "Connect Ethereum account" : "Injected Web3 Provider"}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isConnectingThis ? (
                        <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                      ) : (
                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          Connect →
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                No EVM wallet detected
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Please install a compatible browser extension to interact with Rome Hadrian.
              </p>
            </div>
          )}
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-tight">
              {error.message.includes("User rejected")
                ? "Connection request rejected."
                : error.message}
            </div>
          </div>
        )}

        {/* Supported / Install Links */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
            Need an EVM Wallet?
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {KNOWN_WALLETS.map((w) => (
              <a
                key={w.name}
                href={w.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-slate-100 dark:bg-slate-800/30 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              >
                <span>{w.name}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
