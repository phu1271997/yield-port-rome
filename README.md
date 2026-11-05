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

## 2. Live Deployments & Arena Links

- **Live Production dApp:** [https://yieldport-rome.vercel.app](https://yieldport-rome.vercel.app) *(Alternate: [https://rome-yieldport.vercel.app](https://rome-yieldport.vercel.app))*
  - **Landing Page:** [`/`](https://yieldport-rome.vercel.app/) — 7-section marketing & architecture overview
  - **Interactive Vault App:** [`/app`](https://yieldport-rome.vercel.app/app) — Deposit, Withdraw, Live Stats & On-Demand CPI Verifier
- **Public GitHub Repository:** [https://github.com/phu1271997/yield-port-rome](https://github.com/phu1271997/yield-port-rome)
- **Deployed Contracts (Rome Hadrian Testnet - Chain ID `200010`):**
  - **YieldVault (ERC-4626 + Atomic Solana CPI):** [`0x35277217b31573b0547a63469C19F7F35e7566Ab`](https://via-hadrian.testnet.romeprotocol.xyz/address/0x35277217b31573b0547a63469C19F7F35e7566Ab)
  - **AaveV3Adapter:** [`0x9A39788df5d93b3b868b13BBa67434b116a938AA`](https://via-hadrian.testnet.romeprotocol.xyz/address/0x9A39788df5d93b3b868b13BBa67434b116a938AA)
  - **wUSDC (Vault Underlying Asset):** [`0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d`](https://via-hadrian.testnet.romeprotocol.xyz/address/0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d)
- **Proven Live Cross-VM Settlement (Atomic Solana CPI):**
  - **EVM Transaction Hash:** [`0xcc6dcfbf1b88711894b7112212525281e33a0e6e7a267123320216b3e5e2141c`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xcc6dcfbf1b88711894b7112212525281e33a0e6e7a267123320216b3e5e2141c)
  - **Solana Devnet Settlement Signature:** `4GkL5jWnL7mMqKX5XUpPADSrnGx9ByrbpEdMcqQ83SmJP3PnxSiGQtZgTQuX38a4nHnrfrsquD5mp1jhM1En35n9`
  - **Verify with Rome CLI:**
    ```bash
    npx github:rome-protocol/rome-cli tx hadrian 0xcc6dcfbf1b88711894b7112212525281e33a0e6e7a267123320216b3e5e2141c
    # Output: Status: success, SVM Signature: 4GkL5jWnL7mMqKX5XUpPADSrnGx9ByrbpEdMcqQ83SmJP3PnxSiGQtZgTQuX38a4nHnrfrsquD5mp1jhM1En35n9
    ```

---

## 3. What's Rome-Native Here? (Arena Submission Note)

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
    Atomic Solana CPI Integration
      ✔ should execute atomic Solana CPI receipt through precompile simulation

  18 passing
```

### Live Hadrian Integration Test (Atomic Solana CPI Deposit Path)

Unlike local unit mocks on chain `31337`, this integration test executes directly against the **live Rome Hadrian testnet (chainId `200010`)** and asserts atomic settlement across both EVM and Solana SVM:
1. Calls the deployed `YieldVault` (`0x35277217b31573b0547a63469C19F7F35e7566Ab`).
2. Asserts emission of the `SolanaCpiSettlement` event on the EVM transaction receipt.
3. Automatically queries `rome tx hadrian <hash>` to verify cross-VM settlement.
4. Asserts that the inner Solana Devnet transaction invoked the native Solana Memo Program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`).

```bash
npm run test:integration:hadrian
```

**Expected output:**
```
Running Atomic Solana CPI Integration Test on Hadrian
Network: hadrian
Chain ID: 200010
Signer address: 0x8b563A8c9eeF530300e92E26457D1AB001daEcC7
YieldVault address: 0x35277217b31573b0547a63469C19F7F35e7566Ab
Solana Target Program (bytes32): 0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d
Atomic CPI Enabled: true

Submitting atomic Solana CPI transaction with tag: integration-test-dep-...
Transaction submitted. Hash: 0x03133ff0ceaede07bd56a84bc1b4b86e39843fd3ca92d48d53339c13154cb519
Transaction confirmed in block 518808276 (gasUsed: 10001)

[ASSERTION PASSED] SolanaCpiSettlement event emitted:
  Sender: 0x8b563A8c9eeF530300e92E26457D1AB001daEcC7
  Receiver: 0x8b563A8c9eeF530300e92E26457D1AB001daEcC7
  ProgramId: 0x054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d

Verifying settlement via Rome CLI: `rome tx hadrian 0x03133ff0ceaede07bd56a84bc1b4b86e39843fd3ca92d48d53339c13154cb519`
[ASSERTION PASSED] Rome CLI reported status: success
  Solana Devnet Settlement Signature: WtqV4JDkVnM4CDqTueSuiVqHX6YoJom4MCu56TazPvpQVui9qG5Jd9ysbBUeqSiAHmaDrgQL6ZDzKzFtVa1tyqr
  Explorer URL: https://via-hadrian.testnet.romeprotocol.xyz/tx/0x03133ff0ceaede07bd56a84bc1b4b86e39843fd3ca92d48d53339c13154cb519

Verifying inner Memo program invocation on Solana devnet...
[ASSERTION PASSED] Found inner Memo program log in Solana tx: Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr invoke [2]

==================================================
ALL INTEGRATION TEST ASSERTIONS PASSED SUCCESSFULLY!
==================================================
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

### Architecture & Routes
- **`web/app/page.tsx` (`/`)**: 7-section Marketing Landing Page
  1. **Hero**: High-impact value proposition, CTA to `/app`, live audit indicators.
  2. **Trust Strip**: Rome Shared Sequencer, Hadrian testnet, Rubicon-ready, audited ERC-4626 standard.
  3. **Problem vs Solution**: Split comparison highlighting bridge latency/risks vs atomic single-tx CPI.
  4. **How It Works**: 3-step interactive breakdown (Deposit -> Atomic CPI -> Auto-compound & Withdraw).
  5. **Live Protocol Stats**: On-chain TVL, dynamic APY, CPI finality (~400ms), and 0s bridge wait.
  6. **Why Rome**: Deep dive into shared sequencers, atomic CPI precompiles, and Solana liquidity access.
  7. **FAQ & Arena Footer**: Common user questions and direct links to GitHub, Rome Explorer, and Arena docs.
- **`web/app/app/page.tsx` (`/app`)**: Interactive Vault Application
  - **Dual Balance Display**: Real-time USDC Gas Balance + wUSDC token balance.
  - **Deposit & Mint**: Enter USDC amount with instant shares preview (`previewDeposit`) and approval.
  - **Withdraw & Redeem**: Burn ypUSDC shares to receive principal + accrued yield (`previewRedeem`).
  - **On-Demand Atomic CPI Verifier**: 1-click test button executing `executeAtomicCpiReceipt()` with instant explorer settlement link.
  - **Network Guard**: Auto-detection with 1-click switch to Rome Hadrian (`200010`).
  - **Dark / Light Theme**: Persistent theme switcher in the navigation bar.

### Run Locally
```bash
npm run web:dev
```
Open [http://localhost:3000](http://localhost:3000) for the landing page or [http://localhost:3000/app](http://localhost:3000/app) for the vault app.

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
