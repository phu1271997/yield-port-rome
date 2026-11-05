"use client";

import React, { useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { CONTRACT_CONFIG, hadrian, rubicon } from "../lib/rome";
import { YIELD_VAULT_ABI, ERC20_ABI } from "../lib/abi";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  Zap,
  ExternalLink,
  Wallet,
  TrendingUp,
  RefreshCw,
  Coins,
} from "lucide-react";

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 1. Balances
  // Native gas balance (USDC on Hadrian has 18 decimals)
  const { data: gasBalance, refetch: refetchGas } = useBalance({
    address,
  });

  // wUSDC token balance (6 decimals)
  const { data: usdcBalanceData, refetch: refetchUsdc } = useReadContract({
    address: CONTRACT_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // User vault shares
  const { data: userSharesData, refetch: refetchShares } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Allowance of wUSDC to Vault
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_CONFIG.usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, CONTRACT_CONFIG.vaultAddress] : undefined,
  });

  // 2. Vault Stats
  const { data: totalAssetsData } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "totalAssets",
  });

  const { data: apyData } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "getEstimatedApyBps",
  });

  const { data: pricePerShareData } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "pricePerShare",
  });

  // 3. Transactions
  const { writeContract, data: txHash, isPending: isTxPending } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Formatted values
  const usdcBalance = usdcBalanceData ? formatUnits(usdcBalanceData as bigint, 6) : "0.0";
  const userShares = userSharesData ? formatUnits(userSharesData as bigint, 9) : "0.0";
  const allowance = (allowanceData as bigint) || 0n;
  const totalTvl = totalAssetsData ? formatUnits(totalAssetsData as bigint, 6) : "0.0";
  const apyPercent = apyData ? (Number(apyData) / 100).toFixed(2) : "5.00";
  const sharePrice = pricePerShareData ? formatUnits(pricePerShareData as bigint, 6) : "1.0000";

  const parsedDeposit = depositAmount ? parseUnits(depositAmount, 6) : 0n;
  const needsApproval = parsedDeposit > 0n && allowance < parsedDeposit;

  // Actions
  const handleApprove = () => {
    if (!parsedDeposit) return;
    setStatusMessage("Approving USDC spend...");
    writeContract({
      address: CONTRACT_CONFIG.usdcAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACT_CONFIG.vaultAddress, parseUnits("1000000", 6)],
    });
  };

  const handleDeposit = () => {
    if (!parsedDeposit || !address) return;
    setStatusMessage("Depositing USDC into Yield Port (atomic CPI executing)...");
    writeContract({
      address: CONTRACT_CONFIG.vaultAddress,
      abi: YIELD_VAULT_ABI,
      functionName: "deposit",
      args: [parsedDeposit, address],
    });
  };

  const handleWithdraw = () => {
    if (!withdrawAmount || !address) return;
    const parsedShares = parseUnits(withdrawAmount, 9);
    setStatusMessage("Withdrawing assets from Yield Port...");
    writeContract({
      address: CONTRACT_CONFIG.vaultAddress,
      abi: YIELD_VAULT_ABI,
      functionName: "redeem",
      args: [parsedShares, address, address],
    });
  };

  const refreshAll = () => {
    refetchGas();
    refetchUsdc();
    refetchShares();
    refetchAllowance();
  };

  return (
    <div className="min-h-screen text-slate-100 p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4 py-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Zap className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">Yield Port</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Rome Arena
              </span>
            </div>
            <p className="text-xs text-slate-400">
              EVM USDC ➔ Atomic CPI ➔ Solana Lending Yield
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Network Selector */}
          <div className="flex bg-slate-900 border border-slate-850 p-1 rounded-xl text-xs">
            <button
              onClick={() => switchChain?.({ chainId: hadrian.id })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chain?.id === hadrian.id
                  ? "bg-amber-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Hadrian (200010)
            </button>
            <button
              onClick={() => switchChain?.({ chainId: rubicon.id })}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chain?.id === rubicon.id
                  ? "bg-amber-500 text-slate-950 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Rubicon (7531)
            </button>
          </div>

          {/* Connect Button */}
          {isConnected ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-slate-300">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <button
                onClick={() => disconnect()}
                className="text-xs text-slate-500 hover:text-red-400 ml-1"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect({ connector: connectors[0] })}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-amber-500/10"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Gas Banner */}
      <div className="my-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Coins className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-amber-300">Hadrian Gas Notice: </span>
            <span className="text-slate-300">
              Gas on Rome Hadrian is paid in <strong>USDC</strong>. Need gas? Bridge from Sepolia or Solana devnet via{" "}
              <code className="text-amber-400 bg-black/40 px-1 py-0.5 rounded">rome fund hadrian</code>.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs">
          <div className="bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-slate-400">Gas Balance: </span>
            <span className="font-mono font-semibold text-white">
              {gasBalance ? Number(gasBalance.formatted).toFixed(4) : "0.0000"} USDC
            </span>
          </div>
          <button
            onClick={refreshAll}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Refresh balances"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Total Value Locked</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">${totalTvl}</div>
          <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3" /> Earning in lending market
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Current Yield APY</span>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">{apyPercent}%</div>
          <span className="text-[10px] text-slate-400 mt-1">Auto-compounding</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Share Price</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{sharePrice}</div>
          <span className="text-[10px] text-slate-400 mt-1">USDC per ypUSDC</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Execution Mode</span>
          <div className="text-sm font-semibold text-emerald-300 mt-2 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Single Solana Tx
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Atomic CPI &le; 4 depth</span>
        </div>
      </div>

      {/* Main Interaction Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 mb-6">
            <button
              onClick={() => setActiveTab("deposit")}
              className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "deposit"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" /> Deposit USDC
            </button>
            <button
              onClick={() => setActiveTab("withdraw")}
              className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === "withdraw"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4" /> Withdraw Shares
            </button>
          </div>

          {activeTab === "deposit" ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Deposit Amount</span>
                  <span>
                    Available: <strong className="text-white font-mono">{usdcBalance} USDC</strong>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-lg font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => setDepositAmount(usdcBalance)}
                    className="absolute right-3 top-3 text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-1.5 rounded-lg font-semibold"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {depositAmount && Number(depositAmount) > 0 && (
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>You receive (est. shares):</span>
                    <span className="font-mono text-white">
                      {(Number(depositAmount) / Number(sharePrice)).toFixed(6)} ypUSDC
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Target Strategy:</span>
                    <span className="text-amber-400 font-semibold">
                      Rome EVM ➔ Aave v3 / Kamino CPI
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                {!isConnected ? (
                  <button
                    onClick={() => connect({ connector: connectors[0] })}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20"
                  >
                    Connect Wallet to Deposit
                  </button>
                ) : needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={isTxPending || isTxConfirming}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20"
                  >
                    {isTxConfirming ? "Confirming Approval..." : "Step 1: Approve USDC"}
                  </button>
                ) : (
                  <button
                    onClick={handleDeposit}
                    disabled={isTxPending || isTxConfirming || !parsedDeposit}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20"
                  >
                    {isTxConfirming
                      ? "Executing Atomic CPI Deposit..."
                      : `Deposit ${depositAmount || "0"} USDC`}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Shares to Redeem</span>
                  <span>
                    Your shares: <strong className="text-white font-mono">{userShares} ypUSDC</strong>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-lg font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => setWithdrawAmount(userShares)}
                    className="absolute right-3 top-3 text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-1.5 rounded-lg font-semibold"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {withdrawAmount && Number(withdrawAmount) > 0 && (
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Underlying USDC returned:</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      ~{(Number(withdrawAmount) * Number(sharePrice)).toFixed(4)} USDC
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleWithdraw}
                  disabled={isTxPending || isTxConfirming || !withdrawAmount}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20"
                >
                  {isTxConfirming ? "Confirming Withdrawal..." : "Withdraw & Receive USDC"}
                </button>
              </div>
            </div>
          )}

          {/* Transaction Status Box */}
          {txHash && (
            <div className="mt-6 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Transaction Status:</span>
                <span className={isTxSuccess ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                  {isTxConfirming ? "Settling on Solana..." : isTxSuccess ? "Settled Atomically" : "Submitted"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>EVM Hash:</span>
                <a
                  href={`${CONTRACT_CONFIG.explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-1 font-mono"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="text-[11px] text-slate-400 pt-1">
                Inspect cross-VM settlement:{" "}
                <code className="text-amber-300 bg-black/60 px-1 py-0.5 rounded">
                  rome tx hadrian {txHash}
                </code>
              </div>
            </div>
          )}
        </div>

        {/* Position & Protocol Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-400" /> Your Position
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Vault Shares</span>
                <span className="font-mono text-white font-semibold">{userShares} ypUSDC</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">USDC Value</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  ${(Number(userShares) * Number(sharePrice)).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Yield Accrual</span>
                <span className="text-amber-400 font-semibold">Real-time / Compound</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 text-xs space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" /> What's Rome-Native Here?
            </h3>
            <p className="text-slate-300 leading-relaxed">
              Yield Port uses Rome Protocol's <strong>Cross-Program Invocation (CPI)</strong> precompile{" "}
              <code className="text-amber-400 bg-black/40 px-1 rounded">0xff...08</code> to reach Solana lending markets directly from a Solidity ERC-4626 vault.
            </p>
            <ul className="list-disc list-inside text-slate-400 space-y-1">
              <li>Atomic settlement: EVM deposit + Solana supply in 1 tx</li>
              <li>Reentrancy &amp; inflation-attack guarded (virtual shares)</li>
              <li>No manual bridge or wrapper loss</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
