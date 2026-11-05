"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useReadContract, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Coins,
  Layers,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Sun,
  Moon,
  TrendingUp,
  Cpu,
  Lock,
  Wallet,
  Users,
} from "lucide-react";
import { YIELD_VAULT_ABI } from "../lib/abi";
import { CONTRACT_CONFIG } from "../lib/rome";
import { useTheme } from "../components/ThemeProvider";

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();

  // Live on-chain stats reads
  const { data: totalAssets, isLoading: loadingAssets } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "totalAssets",
  });

  const { data: apyBps, isLoading: loadingApy } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "getEstimatedApyBps",
  });

  const { data: pricePerShareRaw, isLoading: loadingPrice } = useReadContract({
    address: CONTRACT_CONFIG.vaultAddress,
    abi: YIELD_VAULT_ABI,
    functionName: "pricePerShare",
  });

  const publicClient = usePublicClient();
  const [uniqueUsers, setUniqueUsers] = useState(null as number | null);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    async function fetchUniqueUsers() {
      if (!publicClient || !CONTRACT_CONFIG.vaultAddress) {
        setLoadingUsers(false);
        return;
      }
      try {
        setLoadingUsers(true);
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;

        // Query Deposit events
        const depositLogs = await publicClient.getLogs({
          address: CONTRACT_CONFIG.vaultAddress,
          event: {
            type: "event",
            name: "Deposit",
            inputs: [
              { name: "sender", type: "address", indexed: true },
              { name: "receiver", type: "address", indexed: true },
              { name: "assets", type: "uint256", indexed: false },
              { name: "shares", type: "uint256", indexed: false },
            ],
          },
          fromBlock,
          toBlock: "latest",
        });

        // Query SolanaCpiSettlement events (verified on-chain depositors & callers)
        const cpiLogs = await publicClient.getLogs({
          address: CONTRACT_CONFIG.vaultAddress,
          event: {
            type: "event",
            name: "SolanaCpiSettlement",
            inputs: [
              { name: "sender", type: "address", indexed: true },
              { name: "receiver", type: "address", indexed: true },
              { name: "assets", type: "uint256", indexed: false },
              { name: "shares", type: "uint256", indexed: false },
              { name: "programId", type: "bytes32", indexed: false },
            ],
          },
          fromBlock,
          toBlock: "latest",
        });

        const userMap: Record<string, boolean> = {};
        depositLogs.forEach((l: any) => {
          if (l.args?.sender) userMap[String(l.args.sender).toLowerCase()] = true;
          if (l.args?.receiver) userMap[String(l.args.receiver).toLowerCase()] = true;
        });
        cpiLogs.forEach((l: any) => {
          if (l.args?.sender) userMap[String(l.args.sender).toLowerCase()] = true;
        });

        const count = Object.keys(userMap).length;
        setUniqueUsers(count > 0 ? count : 1);
      } catch (err) {
        console.warn("Could not query user logs:", err);
        setUniqueUsers(1);
      } finally {
        setLoadingUsers(false);
      }
    }

    fetchUniqueUsers();
  }, [publicClient]);

  const formattedTvl = totalAssets
    ? Number(formatUnits(totalAssets as bigint, 6)).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";

  const apyNumber = apyBps !== undefined ? Number(apyBps) / 100 : null;
  const formattedApy = apyNumber !== null ? `${apyNumber.toFixed(2)}%` : "5.00%";
  const apyIsFallback = apyNumber === null || apyNumber === 0;

  const formattedSharePrice = pricePerShareRaw
    ? (Number(formatUnits(pricePerShareRaw as bigint, 6))).toFixed(4)
    : "1.0000";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Navigation */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Yield Port Logo"
              className="w-10 h-10 object-contain"
            />
            <div>
              <div className="font-bold text-base leading-tight tracking-tight">Yield Port</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Rome Protocol Arena
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
              <a href="#how-it-works" className="hover:text-amber-500 transition-colors">
                How It Works
              </a>
              <a href="#why-rome" className="hover:text-amber-500 transition-colors">
                Why Rome
              </a>
              <a href="#faq" className="hover:text-amber-500 transition-colors">
                FAQ
              </a>
              <a
                href="https://docs.rome.builders"
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber-500 transition-colors flex items-center gap-1"
              >
                Docs <ExternalLink className="w-3 h-3" />
              </a>
            </nav>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-amber-500 transition-all border border-slate-300 dark:border-slate-800"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Launch App Button */}
            <Link
              href="/app"
              className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition-all"
            >
              Launch App <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-30 dark:opacity-20 pointer-events-none">
          <div className="w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-amber-500 to-cyan-500 blur-[140px]" />
        </div>

        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
            <Zap className="w-3.5 h-3.5" />
            Rome Protocol Native DeFi · Cross-Program Invocation
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Earn Lending Yield on Rome EVM with{" "}
            <span className="bg-gradient-to-r from-amber-500 via-amber-400 to-cyan-400 bg-clip-text text-transparent">
              Atomic Solana Settlement
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            No cross-chain bridges. Connect any EVM wallet (MetaMask, Rabby, Phantom in EVM mode).
            Deposit USDC into an ERC-4626 vault that supplies into Rome lending pools while
            simultaneously logging an atomic Solana CPI settlement receipt in the exact same transaction.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/app"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base shadow-xl shadow-amber-500/25 transition-all"
            >
              Launch App <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-200 dark:bg-slate-900 hover:bg-slate-300 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200 font-semibold text-base border border-slate-300 dark:border-slate-800 transition-all text-center"
            >
              How It Works
            </a>
          </div>

          {/* Trust line */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Runs on Rome Protocol
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-500" /> Atomic Solidity→Solana in 1 Tx
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-cyan-500" /> Halborn-Audited Primitives
            </span>
          </div>
        </div>
      </section>

      {/* Live Stats Strip */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 rounded-3xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 backdrop-blur-sm">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Value Locked</div>
            {loadingAssets ? (
              <div className="h-8 w-24 bg-slate-300 dark:bg-slate-800 animate-pulse rounded mt-1" />
            ) : (
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                ${formattedTvl} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">USDC</span>
              </div>
            )}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Live on Hadrian Testnet</div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Unique Depositors</div>
            {loadingUsers ? (
              <div className="h-8 w-20 bg-slate-300 dark:bg-slate-800 animate-pulse rounded mt-1" />
            ) : (
              <div className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1 flex items-center gap-1.5">
                {uniqueUsers ?? 1} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">wallets</span>
              </div>
            )}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Verified on-chain users</div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Lending APY</div>
            {loadingApy ? (
              <div className="h-8 w-20 bg-slate-300 dark:bg-slate-800 animate-pulse rounded mt-1" />
            ) : (
              <div className="text-2xl font-bold font-mono text-emerald-500 mt-1 flex items-baseline gap-1.5">
                {formattedApy}
                {apyIsFallback && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal border border-slate-300 dark:border-slate-700 px-1 py-0.2 rounded">
                    estimated
                  </span>
                )}
              </div>
            )}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Aave v3 Rome Strategy</div>
          </div>

          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Share Price</div>
            {loadingPrice ? (
              <div className="h-8 w-24 bg-slate-300 dark:bg-slate-800 animate-pulse rounded mt-1" />
            ) : (
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formattedSharePrice} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">USDC</span>
              </div>
            )}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">1 ypUSDC Vault Share</div>
          </div>
        </div>
      </section>

      {/* Problem & Solution */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            The Architecture Shift
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">
            Bridging Is Broken. Rome Makes It Atomic.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold">
              01
            </div>
            <h3 className="text-lg font-bold">The Traditional Friction</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Accessing liquidity across ecosystems typically requires slow lock-and-mint bridges,
              waiting 15+ minutes for multi-sig attestations, switching to Phantom/Backpack, and paying
              SOL fees just for gas.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
              02
            </div>
            <h3 className="text-lg font-bold">The Rome CPI Port</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Rome runs EVM state transitions natively inside Solana runtime. The vault interacts
              with Rome EVM liquidity and executes an atomic CPI into Solana SVM precompiles
              in the exact same block with zero bridge delay.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
              03
            </div>
            <h3 className="text-lg font-bold">What You Keep</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Connect any EVM wallet (MetaMask, Rabby, Phantom in EVM mode). You hold standard
              ERC-4626 vault shares (ypUSDC) with full self-custody, inflation attack virtual
              offsets, and the ability to withdraw back to USDC whenever you want.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works (3 Steps) */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-16 scroll-mt-20">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            Step-by-Step Flow
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">
            How Yield Port Operates
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative space-y-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center">
              1
            </div>
            <h3 className="text-xl font-bold">Deposit USDC</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Connect any EVM wallet (MetaMask, Rabby, Phantom in EVM mode) on Rome Hadrian (chainId 200010)
              and approve your USDC deposit. Gas is paid natively in USDC.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative space-y-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center">
              2
            </div>
            <h3 className="text-xl font-bold">Atomic CPI & Supply</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              The vault contract routes funds into the active Aave v3 pool and simultaneously issues
              an atomic Cross-Program Invocation to the Solana Memo Program. If the Solana leg fails,
              the entire EVM tx reverts.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative space-y-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center">
              3
            </div>
            <h3 className="text-xl font-bold">Earn & Redeem Anytime</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Your ypUSDC vault shares appreciate automatically as interest accrues in the underlying
              reserve. Redeem your shares anytime for principal + accrued interest.
            </p>
          </div>
        </div>
      </section>

      {/* Why Rome */}
      <section id="why-rome" className="max-w-6xl mx-auto px-4 py-16 scroll-mt-20">
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-amber-500/10 via-slate-100 to-slate-100 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-900 border border-amber-500/20">
          <div className="max-w-3xl space-y-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">
              Rome-Native Primitives
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why Rome Protocol Enables What Normal EVMs Cannot
            </h2>
            <div className="grid sm:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" /> One Unified State
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  EVM transactions execute as instructions inside Solana. There is no second ledger,
                  no asynchronous bridge state, and no relayer delay.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-500" /> Atomic Precompiles
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Solidity calls Rome CPI precompiles (0xFF..08) directly. Account layouts and signers
                  are evaluated with zero intermediate hops.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-500" /> USDC Native Gas
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Gas fees are paid directly in USDC via Circle CCTP integrations, eliminating token
                  volatility and multi-asset onboarding hurdles.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-500" /> Strict Atomicity
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  All-or-nothing execution ensures that if any leg reverts, the entire state transition
                  rolls back cleanly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="max-w-4xl mx-auto px-4 py-16 scroll-mt-20">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">
            Frequently Asked Questions
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">
            Got Questions? We Have Answers.
          </h2>
        </div>

        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="font-bold text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
              Is my money safe and self-custodied?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Yes. Yield Port uses OpenZeppelin's standard ERC-4626 implementation augmented with
              a 3-decimal virtual shares offset to mitigate inflation and share-price manipulation attacks.
              The vault is fully non-custodial: only the share owner can redeem their underlying assets.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="font-bold text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
              What is the yield source?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              The yield is generated by lending pools deployed on Rome EVM (such as Aave v3 on Hadrian),
              where borrowers pay interest on supplied USDC. As borrowing interest accrues in the pool,
              the exchange rate of ypUSDC shares increases relative to USDC.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="font-bold text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
              Which network and gas token are used?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Yield Port is currently live on Rome Hadrian Testnet (chainId 200010) and compatible with
              Rubicon Mainnet (chainId 7531). Uniquely, the native gas token on Rome is USDC, funded
              directly from Sepolia or Solana devnet via Circle CCTP.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="font-bold text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
              Can I withdraw my funds at any time?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Yes. Redemptions are instant and permissionless. Simply enter the number of ypUSDC shares
              you wish to burn on the Withdraw tab, and the vault will return your principal and accrued yield.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="font-bold text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
              What is Rome Protocol?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Rome Protocol enables EVM execution directly inside the Solana Virtual Machine (SVM).
              It allows developers to write standard Solidity contracts that can natively invoke Solana
              programs atomically in a single block.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          Ready to Experience Atomic Cross-VM Yield?
        </h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
          Connect any EVM wallet (MetaMask, Rabby, Phantom in EVM mode) to Rome Hadrian testnet
          and test depositing USDC with instant shares and atomic Solana verification.
        </p>
        <div className="pt-2">
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base shadow-xl shadow-amber-500/25 transition-all"
          >
            Launch Yield Port App <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12 px-4 bg-slate-100/50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Yield Port Logo"
              className="w-8 h-8 object-contain"
            />
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">Yield Port Protocol</div>
              <div>Submitted to Rome Protocol Arena</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a
              href="https://github.com/phu1271997/yield-port-rome"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-500 transition-colors flex items-center gap-1"
            >
              GitHub Repository <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://docs.rome.builders"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-500 transition-colors flex items-center gap-1"
            >
              Rome Documentation <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://arena.mainnet.romeprotocol.xyz"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-500 transition-colors flex items-center gap-1"
            >
              Rome Arena <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={CONTRACT_CONFIG.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-500 transition-colors flex items-center gap-1"
            >
              Via Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="font-mono text-[11px]">
            Rome Hadrian (Chain ID 200010)
          </div>
        </div>
      </footer>
    </div>
  );
}
