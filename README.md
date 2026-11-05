# Yield Port — Rome Protocol Arena Submission

> **Solana Lending Yield from EVM (MetaMask) via Atomic Cross-Program Invocation (CPI)**  
> Built for the **Rome Arena** builder program. Deployed on **Rome Hadrian Testnet** (chainId `200010`) and ready for **Rubicon Mainnet** (`7531`).

---

## 1. What is Yield Port?

**Yield Port** is an ERC-4626-compliant tokenized vault running natively on Rome EVM. It enables Ethereum Virtual Machine users (using standard wallets like MetaMask) to deposit USDC and atomically earn yield inside **Solana lending markets** (such as Aave v3 on Rome EVM and Kamino / Save on Solana SVM) **in a single transaction**.

Users receive **ypUSDC** vault shares that auto-compound as lending interest accrues. Users maintain full self-custody and can withdraw back to USDC at any time.

```
┌─────────────┐   1. deposit(usdc)   ┌────────────────────┐   atomic CPI    ┌──────────────────────┐
│  MetaMask   │ ───────────────────▶ │  YieldVault.sol    │ ──────────────▶ │  Solana lending prog │
│  (EVM user) │ ◀─────────────────── │  (Rome EVM chain)  │ ◀────────────── │  (Aave v3 / Kamino)  │
└─────────────┘   4. shares/yield    └────────────────────┘   1 Solana tx   └──────────────────────┘
        ▲                                       │ reads rate
        │                                       ▼
   Next.js dApp                       ┌────────────────────┐
  (wagmi + viem)                      │  Oracle / aToken   │  (Auto-compounding state)
                                      └────────────────────┘
```

---

## 2. What's Rome-Native Here? (Arena Submission Note)

On any standard EVM chain (Ethereum, Arbitrum, Base), reaching Solana liquidity requires:
1. Bridging assets to Solana (5–20 minute latency, bridge vulnerability risks).
2. Switching to a Solana wallet (Phantom/Backpack) with a separate keypair.
3. Signing a second transaction and paying gas in SOL.

**Yield Port breaks this barrier using Rome Protocol's core primitive:**
- **Atomic Cross-Program Invocation (CPI):** The Solidity contract calls Rome's CPI precompile (`0xFF00000000000000000000000000000000000008`) to invoke instructions inside the SVM in the **exact same block**.
- **All-or-Nothing Atomicity:** If the lending supply leg on Solana fails, the entire EVM transaction reverts. No lost funds, no stuck bridges.
- **Unified State & Single Transaction:** The EVM state transition and Solana state mutation settle simultaneously in one Solana transaction (~400ms finality).
- **Zero Hardcoded Facts:** Chain IDs, contract addresses, token mints, and program IDs are dynamically resolved at runtime from `@rome-protocol/registry`.

---

## 3. Repository Layout

```
yield-port/
├── contracts/
│   ├── YieldVault.sol                 # ERC-4626 tokenized vault with inflation attack guard
│   ├── CpiProof.sol                   # Step 1 de-risking: atomic CPI into Solana Memo program
│   ├── interfaces/
│   │   └── ILendingAdapter.sol        # Pluggable yield adapter interface
│   ├── adapters/
│   │   ├── AaveV3Adapter.sol          # Live Aave v3 lending adapter on Hadrian EVM
│   │   └── KaminoCpiAdapter.sol       # Solana SVM adapter (Kamino klend via atomic CPI)
│   └── test/
│       ├── MockERC20.sol              # 6-decimal test token
│       └── MockLendingAdapter.sol     # Mock adapter for unit testing
├── scripts/
│   ├── deploy_cpi_proof.ts            # Milestone 1: deploy & verify Solana CPI settlement
│   ├── deploy_vault.ts                # Milestone 2: deploy Vault & configure Adapter
│   └── export_registry_for_web.js     # Exports live registry facts for frontend bundle
├── test/
│   └── YieldVault.test.ts             # 16 unit tests (ERC-4626, inflation, CPI, pause)
├── web/                               # Next.js (App Router) + wagmi + viem frontend
│   ├── app/
│   │   ├── page.tsx                   # Interactive dashboard (Deposit, Withdraw, Stats)
│   │   ├── layout.tsx                 # Root layout & metadata
│   │   └── providers.tsx              # Wagmi & React Query provider
│   ├── lib/
│   │   ├── rome.ts                    # Viem chain config built dynamically from registry
│   │   ├── abi.ts                     # Type-safe contract ABIs
│   │   └── contracts.json             # Live deployed addresses
│   └── package.json
├── hardhat.config.ts                  # Hardhat configuration (Hadrian 200010 & Rubicon 7531)
└── package.json
```

---

## 4. Quickstart & Setup

### Prerequisites
- Node.js &ge; 18
- MetaMask or any Web3 EVM wallet
- Rome CLI (`npx github:rome-protocol/rome-cli`)

### Environment Configuration
Copy `.env.example` to `.env` and provide your deployer private key:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PRIVATE_KEY="0xYOUR_HEX_PRIVATE_KEY"
ROME_EVM_KEY="0xYOUR_HEX_PRIVATE_KEY"
```

### Funding Gas (USDC on Hadrian)
On Rome Hadrian (`chainId: 200010`), the native gas token is **USDC** (18 decimals):
```bash
# Verify connectivity and balance
npx github:rome-protocol/rome-cli doctor hadrian

# Fund gas (minimum 0.5 USDC recommended) from Sepolia or Solana devnet
npx github:rome-protocol/rome-cli fund hadrian --from sepolia --amount 1
```

---

## 5. Verification & Testing

Run the comprehensive unit test suite:
```bash
npm run test
```

Expected output:
```
  YieldPort Test Suite
    Deployment & Configuration
      ✔ should set correct token details and decimals
      ✔ should report active adapter address
      ✔ should report estimated APY from adapter
    Deposit & Share Minting
      ✔ should allow Alice to deposit USDC and receive shares
      ✔ should reject deposits below minimum deposit threshold
      ✔ should allow Bob to deposit and receive proportional shares
    Yield Accrual & Price Per Share
      ✔ should increase share price when adapter accrues yield
    Withdrawals & Redemptions
      ✔ should allow partial withdrawals
      ✔ should allow third party to redeem with approval allowance
    Inflation Attack Protection (Virtual Shares)
      ✔ should protect second depositor from inflation attack
    Pause Protection & Emergency
      ✔ should block deposits when paused
      ✔ should allow unpausing
      ✔ should allow owner to rescue accidentally sent ERC20 tokens
      ✔ should prevent rescuing vault asset (USDC)
    Kamino CPI Adapter Architecture & Encodings
      ✔ should verify Kamino discriminators and account layouts
    CPI Proof Contract
      ✔ should deploy with target Solana Memo program ID

  16 passing
```

---

## 6. Execution Milestones

### Milestone 1: De-Risking Single Solana CPI Call
Deploy `CpiProof.sol` to Hadrian testnet and send a memo into Solana's native Memo program:
```bash
npm run deploy:cpi:hadrian
```

Inspect the atomic cross-VM settlement with the Rome CLI:
```bash
npx github:rome-protocol/rome-cli tx hadrian <TX_HASH>
```

### Milestone 2: Deploying Full Yield Vault
Deploy the `AaveV3Adapter` and `YieldVault` contracts to Hadrian testnet:
```bash
npm run deploy:hadrian
```

The script dynamically:
1. Queries `@rome-protocol/registry` for `wUSDC` and live Aave v3 pool addresses.
2. Deploys the contracts.
3. Wires the vault to the adapter.
4. Writes output into `deployments/` and `web/lib/contracts.json`.

---

## 7. Next.js Frontend (dApp)

### Run Locally
```bash
npm run web:dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Features
- **Wallet Connection:** Connect MetaMask to Hadrian Testnet or Rubicon Mainnet.
- **Dual Balance Display:** Real-time USDC Gas Balance + wUSDC token balance.
- **Deposit & Mint:** Enter USDC amount with instant shares preview and 2-step approval.
- **Withdraw & Redeem:** Burn ypUSDC shares to receive principal + accrued yield.
- **Cross-VM Receipt Link:** Direct explorer link verifying atomic Solana settlement.

### Deploy to Vercel
```bash
cd web
npx vercel
```

---

## 8. Arena Scoring Alignment

| Arena Metric | How Yield Port Delivers |
|---|---|
| **Value Locked (TVL)** | Deposits continuously accumulate in the vault and generate yield in underlying lending reserves. |
| **Active Users** | Every EVM user holding USDC can deposit in 1 click without needing Solana SOL or Phantom setup. |
| **Transaction Volume** | Deposits, redemptions, yield harvests, and rebalances create continuous cross-VM transactions. |
| **Rome-Native Tech** | Built on atomic CPI precompiles, dynamic registry lookups, and single-transaction cross-VM settlement. |

---

## License
MIT
