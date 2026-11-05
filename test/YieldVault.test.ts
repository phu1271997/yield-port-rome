import { expect } from "chai";
import { ethers } from "hardhat";
import {
  YieldVault,
  MockERC20,
  MockLendingAdapter,
  KaminoCpiAdapter,
  CpiProof
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("YieldPort Test Suite", function () {
  let vault: YieldVault;
  let usdc: MockERC20;
  let adapter: MockLendingAdapter;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  const INITIAL_ALICE_BALANCE = ethers.parseUnits("10000", 6); // 10,000 USDC
  const INITIAL_BOB_BALANCE = ethers.parseUnits("10000", 6);

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    // Deploy Mock USDC (6 decimals like real USDC on Rome)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockERC20Factory.deploy("USD Coin", "USDC", 6)) as MockERC20;
    await usdc.waitForDeployment();

    // Deploy Mock Lending Adapter
    const MockAdapterFactory = await ethers.getContractFactory("MockLendingAdapter");
    adapter = (await MockAdapterFactory.deploy(await usdc.getAddress())) as MockLendingAdapter;
    await adapter.waitForDeployment();

    // Deploy YieldVault
    const VaultFactory = await ethers.getContractFactory("YieldVault");
    vault = (await VaultFactory.deploy(
      await usdc.getAddress(),
      "Yield Port USDC",
      "ypUSDC",
      owner.address
    )) as YieldVault;
    await vault.waitForDeployment();

    // Wire adapter to vault
    await vault.setAdapter(await adapter.getAddress());

    // Mint USDC to Alice and Bob
    await usdc.mint(alice.address, INITIAL_ALICE_BALANCE);
    await usdc.mint(bob.address, INITIAL_BOB_BALANCE);

    // Approve vault to spend USDC
    await usdc.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    await usdc.connect(bob).approve(await vault.getAddress(), ethers.MaxUint256);
  });

  describe("Deployment & Configuration", function () {
    it("should set correct token details and decimals", async function () {
      expect(await vault.name()).to.equal("Yield Port USDC");
      expect(await vault.symbol()).to.equal("ypUSDC");
      expect(await vault.asset()).to.equal(await usdc.getAddress());
      // 6 decimals for USDC + 3 virtual offset = 9 decimals
      expect(await vault.decimals()).to.equal(9);
    });

    it("should report active adapter address", async function () {
      expect(await vault.adapter()).to.equal(await adapter.getAddress());
    });

    it("should report estimated APY from adapter", async function () {
      expect(await vault.getEstimatedApyBps()).to.equal(650); // 6.50%
    });
  });

  describe("Deposit & Share Minting", function () {
    it("should allow Alice to deposit USDC and receive shares", async function () {
      const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC

      const expectedShares = await vault.previewDeposit(depositAmount);
      expect(expectedShares).to.be.gt(0);

      await expect(vault.connect(alice).deposit(depositAmount, alice.address))
        .to.emit(vault, "Deposit")
        .withArgs(alice.address, alice.address, depositAmount, expectedShares);

      expect(await vault.balanceOf(alice.address)).to.equal(expectedShares);
      expect(await vault.totalAssets()).to.equal(depositAmount);
      expect(await adapter.totalDeposited()).to.equal(depositAmount);
    });

    it("should reject deposits below minimum deposit threshold", async function () {
      const dust = 100n; // Less than 1e4 minDeposit
      await expect(
        vault.connect(alice).deposit(dust, alice.address)
      ).to.be.revertedWith("YieldVault: deposit below minimum");
    });

    it("should allow Bob to deposit and receive proportional shares", async function () {
      const aliceDeposit = ethers.parseUnits("1000", 6);
      const bobDeposit = ethers.parseUnits("500", 6);

      await vault.connect(alice).deposit(aliceDeposit, alice.address);
      const aliceShares = await vault.balanceOf(alice.address);

      await vault.connect(bob).deposit(bobDeposit, bob.address);
      const bobShares = await vault.balanceOf(bob.address);

      // Bob deposited half of Alice's amount, shares should be ~50%
      const ratio = Number(bobShares * 10000n / aliceShares) / 10000;
      expect(ratio).to.be.closeTo(0.5, 0.01);
    });
  });

  describe("Yield Accrual & Price Per Share", function () {
    it("should increase share price when adapter accrues yield", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      const priceBefore = await vault.pricePerShare();

      // Simulate lending protocol accruing 100 USDC of yield
      const yieldAmount = ethers.parseUnits("100", 6);
      await usdc.mint(await adapter.getAddress(), yieldAmount);
      await adapter.simulateYieldAccrual(yieldAmount);

      expect(await vault.totalAssets()).to.equal(depositAmount + yieldAmount);

      const priceAfter = await vault.pricePerShare();
      expect(priceAfter).to.be.gt(priceBefore);

      // Alice redeems all shares and gets principal + yield
      const aliceShares = await vault.balanceOf(alice.address);
      const aliceBalanceBefore = await usdc.balanceOf(alice.address);

      await vault.connect(alice).redeem(aliceShares, alice.address, alice.address);

      const aliceBalanceAfter = await usdc.balanceOf(alice.address);
      const actualReceived = aliceBalanceAfter - aliceBalanceBefore;

      expect(actualReceived).to.be.closeTo(depositAmount + yieldAmount, 1000n);
    });
  });

  describe("Withdrawals & Redemptions", function () {
    it("should allow partial withdrawals", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      const withdrawAmount = ethers.parseUnits("400", 6);
      await vault.connect(alice).withdraw(withdrawAmount, alice.address, alice.address);

      expect(await vault.totalAssets()).to.be.closeTo(ethers.parseUnits("600", 6), 100n);
    });

    it("should allow third party to redeem with approval allowance", async function () {
      const depositAmount = ethers.parseUnits("500", 6);
      await vault.connect(alice).deposit(depositAmount, alice.address);

      const shares = await vault.balanceOf(alice.address);
      await vault.connect(alice).approve(bob.address, shares);

      await vault.connect(bob).redeem(shares, bob.address, alice.address);
      expect(await vault.balanceOf(alice.address)).to.equal(0);
    });
  });

  describe("Inflation Attack Protection (Virtual Shares)", function () {
    it("should protect second depositor from inflation attack", async function () {
      // Attacker (Alice) deposits minimum amount
      const minDep = await vault.minDeposit();
      await vault.connect(alice).deposit(minDep, alice.address);

      // Attacker donates 1000 USDC directly to adapter to inflate share price
      const donation = ethers.parseUnits("1000", 6);
      await usdc.mint(await adapter.getAddress(), donation);
      await adapter.simulateYieldAccrual(donation);

      // Victim (Bob) deposits 1000 USDC
      const bobDeposit = ethers.parseUnits("1000", 6);
      await vault.connect(bob).deposit(bobDeposit, bob.address);

      // Because of virtual shares offset, Bob MUST receive non-zero shares
      const bobShares = await vault.balanceOf(bob.address);
      expect(bobShares).to.be.gt(0);

      // Bob should be able to withdraw almost all of his deposit
      const bobBalanceBefore = await usdc.balanceOf(bob.address);
      await vault.connect(bob).redeem(bobShares, bob.address, bob.address);
      const bobBalanceAfter = await usdc.balanceOf(bob.address);

      const received = bobBalanceAfter - bobBalanceBefore;
      expect(received).to.be.closeTo(bobDeposit, ethers.parseUnits("1", 6));
    });
  });

  describe("Pause Protection & Emergency", function () {
    it("should block deposits when paused", async function () {
      await vault.pause();
      await expect(
        vault.connect(alice).deposit(ethers.parseUnits("100", 6), alice.address)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("should allow unpausing", async function () {
      await vault.pause();
      await vault.unpause();
      await expect(
        vault.connect(alice).deposit(ethers.parseUnits("100", 6), alice.address)
      ).to.not.be.reverted;
    });

    it("should allow owner to rescue accidentally sent ERC20 tokens", async function () {
      const MockTokenFactory = await ethers.getContractFactory("MockERC20");
      const randomToken = await MockTokenFactory.deploy("Random", "RND", 18);
      await randomToken.mint(await vault.getAddress(), ethers.parseEther("50"));

      await vault.rescueToken(await randomToken.getAddress(), owner.address, ethers.parseEther("50"));
      expect(await randomToken.balanceOf(owner.address)).to.equal(ethers.parseEther("50"));
    });

    it("should prevent rescuing vault asset (USDC)", async function () {
      await expect(
        vault.rescueToken(await usdc.getAddress(), owner.address, 100)
      ).to.be.revertedWith("YieldVault: cannot rescue vault asset");
    });
  });

  describe("Kamino CPI Adapter Architecture & Encodings", function () {
    it("should verify Kamino discriminators and account layouts", async function () {
      const dummyBytes32 = ethers.ZeroHash;
      const KaminoFactory = await ethers.getContractFactory("KaminoCpiAdapter");

      const adapterKamino = await KaminoFactory.deploy(
        await usdc.getAddress(),
        owner.address,
        false, // liveCpi = false for local unit test
        {
          klendProgramId: dummyBytes32,
          lendingMarket: dummyBytes32,
          reserve: dummyBytes32,
          reserveLiquidityMint: dummyBytes32,
          reserveLiquiditySupply: dummyBytes32,
          reserveCollateralMint: dummyBytes32,
          userSourceLiquidity: dummyBytes32,
          userDestinationCollateral: dummyBytes32,
          lendingMarketAuthority: dummyBytes32,
          tokenProgram: dummyBytes32,
          instructionSysvar: dummyBytes32,
          eventAuthority: dummyBytes32,
        }
      );
      await adapterKamino.waitForDeployment();

      expect(await adapterKamino.DISC_DEPOSIT()).to.equal("0xf223c68952e1f2b6");
      expect(await adapterKamino.DISC_REDEEM()).to.equal("0xd6a495b28d44ee49");
      expect(await adapterKamino.getEstimatedApyBps()).to.equal(720); // 7.20%
    });
  });

  describe("CPI Proof Contract", function () {
    it("should deploy with target Solana Memo program ID", async function () {
      const memoProgram = ethers.id("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
      const CpiProofFactory = await ethers.getContractFactory("CpiProof");
      const cpiProof = await CpiProofFactory.deploy(memoProgram);
      await cpiProof.waitForDeployment();

      expect(await cpiProof.MEMO_PROGRAM()).to.equal(memoProgram);
    });
  });
});
