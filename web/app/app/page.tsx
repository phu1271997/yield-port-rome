"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Coins,
  AlertTriangle,
  ArrowLeft,
  Sun,
  Moon,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { YIELD_VAULT_ABI, ERC20_ABI } from "../../lib/abi";
import { CONTRACT_CONFIG, hadrian, getExplorerTxUrl } from "../../lib/rome";
import { useTheme } from "../../components/ThemeProvider";

export default function AppDashboard() {
  const { theme, toggleTheme } = useTheme();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isWrongChain = isConnected && currentChainId !== CONTRACT_CONFIG.chainId;

  // Active Tab
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [cpiTag, setCpiTag] = useState("arena-demo");

  // On-chain reads: Balances
  const { data: gasBalance, refetch: refetchGas } = useBalance({
    address,
    chainId: CONTRACT_CONFIG.chainId,
  });

  const { data: usdcBalanceRaw, refetch: refetchUsdc } = useReadContract({
    address: CONTRACT_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CONTRACT_CONFIG.chainId,
    query: { enabled: !!address },
  });

  const { data: sharesBalanceRaw, refetch: refetchShares } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CONTRACT_CONFIG.chainId,
    query: { enabled: !!address },
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, CONTRACT_CONFIG.vaultAddress] : undefined,
    chainId: CONTRACT_CONFIG.chainId,
    query: { enabled: !!address },
  });

  // On-chain reads: Vault state
  const { data: totalAssetsRaw, refetch: refetchTotalAssets } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "totalAssets",
    chainId: CONTRACT_CONFIG.chainId,
  });

  const { data: apyBpsRaw } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "getEstimatedApyBps",
    chainId: CONTRACT_CONFIG.chainId,
  });

  const { data: pricePerShareRaw } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "pricePerShare",
    chainId: CONTRACT_CONFIG.chainId,
  });

  // Safe parsing
  const parsedDeposit =
    depositAmount && Number(depositAmount) > 0
      ? parseUnits(depositAmount, 6)
      : 0n;

  const parsedWithdrawShares =
    withdrawAmount && Number(withdrawAmount) > 0
      ? parseUnits(withdrawAmount, 9)
      : 0n;

  // Contract previews
  const { data: previewSharesData } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "previewDeposit",
    args: [parsedDeposit],
    chainId: CONTRACT_CONFIG.chainId,
    query: { enabled: parsedDeposit > 0n },
  });

  const { data: previewAssetsData } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "previewRedeem",
    args: [parsedWithdrawShares],
    chainId: CONTRACT_CONFIG.chainId,
    query: { enabled: parsedWithdrawShares > 0n },
  });

  // Formatted numbers
  const userUsdc = usdcBalanceRaw ? formatUnits(usdcBalanceRaw as bigint, 6) : "0.00";
  const userShares = sharesBalanceRaw ? formatUnits(sharesBalanceRaw as bigint, 9) : "0.00";
  const allowance = allowanceRaw ? (allowanceRaw as bigint) : 0n;
  const needsApproval = parsedDeposit > 0n && allowance < parsedDeposit;

  const totalAssets = totalAssetsRaw
    ? Number(formatUnits(totalAssetsRaw as bigint, 6)).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";

  const apyNumber = apyBpsRaw !== undefined ? Number(apyBpsRaw) / 100 : null;
  const formattedApy = apyNumber !== null ? `${apyNumber.toFixed(2)}%` : "5.00%";
  const apyIsEstimated = apyNumber === null || apyNumber === 0;

  const sharePrice = pricePerShareRaw
    ? Number(formatUnits(pricePerShareRaw as bigint, 6)).toFixed(4)
    : "1.0000";

  const previewShares = previewSharesData
    ? formatUnits(previewSharesData as bigint, 9)
    : (Number(depositAmount || 0) * (1 / Number(sharePrice))).toFixed(4);

  const previewAssets = previewAssetsData
    ? formatUnits(previewAssetsData as bigint, 6)
    : (Number(withdrawAmount || 0) * Number(sharePrice)).toFixed(4);

  // Writes
  const {
    data: txHash,
    writeContract,
    isPending: isTxPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isTxConfirming,
    isSuccess: isTxSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const refreshAll = () => {
    refetchGas();
    refetchUsdc();
    refetchShares();
    refetchAllowance();
    refetchTotalAssets();
  };

  const handleApprove = () => {
    if (!parsedDeposit) return;
    resetWrite();
    writeContract({
      address: CONTRACT_CONFIG.usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACT_CONFIG.vaultAddress, parsedDeposit],
    });
  };

  const handleDeposit = () => {
    if (!parsedDeposit || !address) return;
    resetWrite();
    writeContract({
      address: CONTRACT_CONFIG.vaultAddress,
      abi: YIELD_VAULT_ABI,
      functionName: "deposit",
      args: [parsedDeposit, address],
    });
  };

  const handleWithdraw = () => {
    if (!parsedWithdrawShares || !address) return;
    resetWrite();
    writeContract({
      address: CONTRACT_CONFIG.vaultAddress,
      abi: YIELD_VAULT_ABI,
      functionName: "redeem",
      args: [parsedWithdrawShares, address, address],
    });
  };

  const handleExplicitCpi = () => {
    resetWrite();
    writeContract({
      address: CONTRACT_CONFIG.vaultAddress,
      abi: YIELD_VAULT_ABI,
      functionName: "executeAtomicCpiReceipt",
      args: [cpiTag || "arena-verification"],
    });
  };

  // Surface error description
  const errorMessage =
    (writeError as any)?.shortMessage ||
    writeError?.message ||
    (receiptError as any)?.shortMessage ||
    receiptError?.message ||
    null;

  // Sonner Toast Lifecycle
  useEffect(() => {
    if (isTxPending) {
      toast.loading("Awaiting wallet approval...", { id: "tx-lifecycle" });
    }
  }, [isTxPending]);

  useEffect(() => {
    if (txHash && isTxConfirming) {
      toast.loading("Transaction submitted! Settling atomically on Rome & Solana...", {
        id: "tx-lifecycle",
        description: `Tx: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`,
      });
    }
  }, [txHash, isTxConfirming]);

  useEffect(() => {
    if (isTxSuccess && txHash) {
      toast.success("Transaction Settled Successfully!", {
        id: "tx-lifecycle",
        description: "Atomic settlement confirmed across Rome EVM and Solana SVM.",
        action: {
          label: "View Explorer",
          onClick: () => window.open(getExplorerTxUrl(txHash), "_blank"),
        },
      });
      refreshAll();
    }
  }, [isTxSuccess, txHash]);

  useEffect(() => {
    if (errorMessage) {
      toast.error("Transaction Reverted", {
        id: "tx-lifecycle",
        description: errorMessage,
      });
    }
  }, [errorMessage]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-amber-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Overview
            </Link>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-800" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-sm">
                YP
              </div>
              <span className="font-bold text-sm tracking-tight hidden sm:inline">
                Yield Port App
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Wrong Network Warning */}
            {isWrongChain && (
              <button
                onClick={() => switchChain({ chainId: hadrian.id })}
                className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-xs px-3 py-1.5 rounded-xl font-medium animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Switch to Hadrian
              </button>
            )}

            {/* Network Badge */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Hadrian (200010)</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-amber-500 transition-all border border-slate-300 dark:border-slate-800"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Connect / Wallet */}
            {isConnected ? (
              <div className="flex items-center gap-2 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-mono font-medium">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <button
                  onClick={() => disconnect()}
                  className="text-xs text-slate-500 hover:text-red-500 ml-1 font-medium"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-4 py-2 rounded-xl shadow-md shadow-amber-500/10"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Gas & Architecture Notice */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-100 to-slate-100 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-900 border border-amber-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Coins className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Rome Gas Notice:{" "}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                Gas on Rome Hadrian is paid in <strong>native USDC</strong>. Need gas? Bridge from
                Sepolia via{" "}
                <code className="text-amber-500 bg-black/10 dark:bg-black/40 px-1 py-0.5 rounded font-mono">
                  rome fund hadrian
                </code>
                .
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <div className="bg-white/80 dark:bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Gas: </span>
              <span className="font-mono font-semibold">
                {gasBalance ? Number(gasBalance.formatted).toFixed(4) : "0.0000"} USDC
              </span>
            </div>
            <button
              onClick={refreshAll}
              className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              title="Refresh balances"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Vault TVL</div>
            <div className="text-xl font-bold font-mono mt-1">${totalAssets}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">USDC Deposits</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Lending APY</div>
            <div className="text-xl font-bold font-mono text-emerald-500 mt-1 flex items-baseline gap-1">
              {formattedApy}
              {apyIsEstimated && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">est.</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Aave v3 Rome Strategy</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Share Price</div>
            <div className="text-xl font-bold font-mono mt-1">{sharePrice}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">USDC per ypUSDC</div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Your Position</div>
            <div className="text-xl font-bold font-mono text-amber-500 mt-1">
              {Number(userShares).toFixed(4)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">ypUSDC Shares</div>
          </div>
        </div>

        {/* Main Vault Interactive Card */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          {/* Tabs */}
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-950 mb-6 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => {
                setActiveTab("deposit");
                resetWrite();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "deposit"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ArrowDownLeft className="w-4 h-4" /> Deposit USDC
            </button>
            <button
              onClick={() => {
                setActiveTab("withdraw");
                resetWrite();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "withdraw"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ArrowUpRight className="w-4 h-4" /> Withdraw Shares
            </button>
          </div>

          {/* Tab 1: Deposit */}
          {activeTab === "deposit" ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span>Deposit Amount</span>
                  <span>
                    Wallet Balance: <strong className="font-mono text-slate-900 dark:text-white">{userUsdc} wUSDC</strong>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl px-4 py-3.5 text-lg font-mono focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    onClick={() => setDepositAmount(userUsdc)}
                    className="absolute right-3 top-3 text-xs bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Preview Box */}
              {depositAmount && Number(depositAmount) > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Expected Shares Received:</span>
                    <span className="font-mono text-amber-500 font-semibold">
                      ~{previewShares} ypUSDC
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Lending Strategy:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Rome EVM Aave v3 Core
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Solana Settlement:</span>
                    <span className="font-mono text-cyan-500 font-semibold">
                      Atomic Memo CPI Precompile
                    </span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                {!isConnected ? (
                  <button
                    onClick={() => connect({ connector: connectors[0] })}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
                  >
                    Connect Wallet to Deposit
                  </button>
                ) : isWrongChain ? (
                  <button
                    onClick={() => switchChain({ chainId: hadrian.id })}
                    className="w-full py-4 bg-red-500 hover:bg-red-400 text-white font-bold rounded-2xl shadow-lg shadow-red-500/20 transition-all"
                  >
                    Switch to Hadrian Testnet (200010)
                  </button>
                ) : needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={isTxPending || isTxConfirming}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
                  >
                    {isTxConfirming ? "Confirming Approval..." : "Step 1: Approve USDC"}
                  </button>
                ) : (
                  <button
                    onClick={handleDeposit}
                    disabled={isTxPending || isTxConfirming || !parsedDeposit}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    {isTxConfirming
                      ? "Executing Atomic Deposit & Solana CPI..."
                      : `Deposit ${depositAmount || "0"} USDC`}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Tab 2: Withdraw */
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span>Shares to Burn</span>
                  <span>
                    Your shares: <strong className="font-mono text-slate-900 dark:text-white">{userShares} ypUSDC</strong>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl px-4 py-3.5 text-lg font-mono focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    onClick={() => setWithdrawAmount(userShares)}
                    className="absolute right-3 top-3 text-xs bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Preview Box using Contract previewRedeem */}
              {withdrawAmount && Number(withdrawAmount) > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Underlying USDC Returned (previewRedeem):</span>
                    <span className="font-mono text-emerald-500 font-semibold">
                      ~{previewAssets} USDC
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Redemption Mechanism:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Direct Aave v3 Liquidity Pull
                    </span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                {!isConnected ? (
                  <button
                    onClick={() => connect({ connector: connectors[0] })}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
                  >
                    Connect Wallet to Withdraw
                  </button>
                ) : isWrongChain ? (
                  <button
                    onClick={() => switchChain({ chainId: hadrian.id })}
                    className="w-full py-4 bg-red-500 hover:bg-red-400 text-white font-bold rounded-2xl shadow-lg shadow-red-500/20 transition-all"
                  >
                    Switch to Hadrian Testnet (200010)
                  </button>
                ) : (
                  <button
                    onClick={handleWithdraw}
                    disabled={isTxPending || isTxConfirming || !parsedWithdrawShares}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
                  >
                    {isTxConfirming ? "Confirming Redemption..." : "Withdraw & Receive USDC"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Transaction Status Box */}
          {txHash && (
            <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Status:</span>
                <span className="flex items-center gap-1.5 font-semibold">
                  {isTxConfirming && (
                    <span className="text-amber-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 animate-spin" /> Settling on Rome & Solana...
                    </span>
                  )}
                  {isTxSuccess && (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Settled Atomically
                    </span>
                  )}
                  {!isTxConfirming && !isTxSuccess && (
                    <span className="text-slate-400">Broadcasted</span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span>EVM Transaction:</span>
                <a
                  href={getExplorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-mono font-medium"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                Inspect cross-VM Solana settlement:{" "}
                <code className="text-amber-600 dark:text-amber-400 font-mono bg-black/5 dark:bg-black/30 px-1 py-0.5 rounded">
                  rome tx hadrian {txHash}
                </code>
              </div>
            </div>
          )}

          {/* Error Message Box */}
          {errorMessage && (
            <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Transaction Error: </span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Separate On-Demand Atomic CPI Proof Card */}
        <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm">On-Demand Atomic Solana CPI Verification</h3>
            </div>
            <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
              Precompile 0xFF..08
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Execute a direct atomic Cross-Program Invocation from the vault into the Solana Memo
            Program (<code className="font-mono text-amber-500">MemoSq4...fcHr</code>) to prove
            the cross-VM settlement plumbing live on Hadrian.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={cpiTag}
              onChange={(e) => setCpiTag(e.target.value)}
              placeholder="Custom receipt tag"
              className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={handleExplicitCpi}
              disabled={isTxPending || isTxConfirming || !isConnected}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-amber-400 font-semibold text-xs rounded-xl border border-amber-600/30 dark:border-slate-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              Fire Test CPI
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
