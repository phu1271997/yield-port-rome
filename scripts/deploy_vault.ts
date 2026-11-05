import { ethers, network } from "hardhat";
import { getChain, getTokens, getContracts, getPrograms } from "@rome-protocol/registry";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("==================================================");
  console.log("Deploying Yield Port Protocol on network:", network.name);
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer gas balance:", ethers.formatUnits(balance, 18), "gas token");

  const chainId = network.config.chainId || 200010;
  let chain: any;
  try {
    chain = getChain(chainId);
  } catch {
    chain = { name: network.name, chainId, explorerUrl: "" };
  }
  if (!chain) {
    chain = { name: network.name, chainId, explorerUrl: "" };
  }
  console.log("Resolved chain metadata:", chain.name, "ID:", chain.chainId);

  // 1. Resolve USDC token dynamically from registry
  let usdcAddress = "";
  let tokens: any[] = [];
  try {
    tokens = getTokens(chainId) || [];
  } catch {}

  const wUsdcToken = tokens.find((t) => t.symbol === "wUSDC");
  if (wUsdcToken) {
    usdcAddress = wUsdcToken.address;
    console.log("Found wUSDC in registry:", usdcAddress);
  } else {
    // If testing on hardhat local, deploy MockERC20
    if (network.name === "hardhat" || network.name === "localhost") {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockUsdc = await MockERC20.deploy("USD Coin", "USDC", 6);
      await mockUsdc.waitForDeployment();
      usdcAddress = await mockUsdc.getAddress();
      console.log("Deployed local Mock USDC at:", usdcAddress);
    } else {
      throw new Error(`wUSDC not found in registry for chain ${chainId}`);
    }
  }

  // 2. Resolve Aave v3 contracts dynamically from registry
  let contracts: any[] = [];
  try {
    contracts = getContracts(chainId) || [];
  } catch {}

  const aavePoolEntry = contracts.find((c) => c.name === "AavePool");
  const aTokenEntry = contracts.find((c) => c.name === "AaveAToken-wUSDC");
  const dataProviderEntry = contracts.find((c) => c.name === "AaveProtocolDataProvider");

  const aavePoolAddress = aavePoolEntry?.versions?.find((v: any) => v.status === "live")?.address ||
    aavePoolEntry?.versions?.[0]?.address || ethers.ZeroAddress;

  const aTokenAddress = aTokenEntry?.versions?.find((v: any) => v.status === "live")?.address ||
    aTokenEntry?.versions?.[0]?.address || ethers.ZeroAddress;

  const dataProviderAddress = dataProviderEntry?.versions?.find((v: any) => v.status === "live")?.address ||
    dataProviderEntry?.versions?.[0]?.address || ethers.ZeroAddress;

  console.log("Aave Pool address:", aavePoolAddress);
  console.log("Aave aToken address:", aTokenAddress);
  console.log("Aave DataProvider address:", dataProviderAddress);

  // 3. Deploy or reuse AaveV3Adapter
  console.log("\n1. Deploying AaveV3Adapter...");
  const AaveV3AdapterFactory = await ethers.getContractFactory("AaveV3Adapter");
  
  // Can reuse existing if already deployed
  const existingAdapter = process.env.ADAPTER_ADDRESS || "0x9A39788df5d93b3b868b13BBa67434b116a938AA";
  let adapterAddress = existingAdapter;
  let aaveAdapter: any;

  if (existingAdapter && network.name === "hadrian") {
    console.log("Reusing deployed AaveV3Adapter at:", existingAdapter);
    aaveAdapter = AaveV3AdapterFactory.attach(existingAdapter);
  } else {
    aaveAdapter = await AaveV3AdapterFactory.deploy(
      usdcAddress,
      aTokenAddress,
      aavePoolAddress !== ethers.ZeroAddress ? aavePoolAddress : deployer.address,
      dataProviderAddress,
      deployer.address,
      { gasLimit: 5000000 }
    );
    await aaveAdapter.waitForDeployment();
    adapterAddress = await aaveAdapter.getAddress();
    console.log("AaveV3Adapter deployed at:", adapterAddress);
  }

  // 4. Resolve Solana Memo program dynamically from registry
  console.log("\n2. Configuring Solana target program from registry...");
  const cluster = chainId === 200010 ? "devnet" : "mainnet";
  const clusterPrograms = getPrograms(cluster as any);
  if (!clusterPrograms?.memo) {
    throw new Error(`Memo program not found in registry for cluster: ${cluster}`);
  }
  const memoBase58 = clusterPrograms.memo;
  const memoBytes = bs58.decode(memoBase58);
  const solanaMemoProgram = "0x" + Buffer.from(memoBytes).toString("hex");
  console.log(`Found live Solana Memo program (${cluster}):`, memoBase58);
  console.log("Resolved Solana Memo program bytes32:", solanaMemoProgram);

  const YieldVaultFactory = await ethers.getContractFactory("YieldVault");
  const existingVault = process.env.VAULT_ADDRESS || "0x35277217b31573b0547a63469C19F7F35e7566Ab";
  let vault: any;
  let vaultAddress: string;

  if (existingVault && network.name === "hadrian") {
    console.log("Reusing deployed YieldVault at:", existingVault);
    vault = YieldVaultFactory.attach(existingVault);
    vaultAddress = existingVault;
  } else {
    vault = await YieldVaultFactory.deploy(
      usdcAddress,
      "Yield Port USDC",
      "ypUSDC",
      deployer.address,
      solanaMemoProgram,
      { gasLimit: 80000000 }
    );
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    console.log("YieldVault deployed at:", vaultAddress);
  }

  // Set the live verified Solana program on vault
  console.log("Updating target Solana program on vault...");
  const txProg = await vault.setSolanaTargetProgram(solanaMemoProgram, true, { gasLimit: 5000000 });
  await txProg.wait();
  console.log("Vault configured with verified Solana Memo Program.");

  // 5. Connect Vault and Adapter
  console.log("\n3. Connecting Vault and Adapter...");
  const tx1 = await aaveAdapter.setVault(vaultAddress, { gasLimit: 5000000 });
  await tx1.wait();
  console.log("Adapter configured with vault address.");

  const tx2 = await vault.setAdapter(adapterAddress, { gasLimit: 5000000 });
  await tx2.wait();
  console.log("Vault configured with active adapter.");

  // 6. Verify wiring
  const configuredAdapter = await vault.adapter();
  const estApy = await vault.getEstimatedApyBps();
  console.log("\nVerification:");
  console.log("- Vault active adapter:", configuredAdapter);
  console.log("- Vault estimated APY:", Number(estApy) / 100, "%");

  // 7. Execute atomic Solana CPI proof
  console.log("\n4. Executing atomic Solana CPI settlement receipt...");
  const cpiTx = await vault.executeAtomicCpiReceipt("hadrian-settlement-proof", { gasLimit: 5000000 });
  const cpiReceipt = await cpiTx.wait();
  console.log("Atomic CPI receipt confirmed on Hadrian! Tx:", cpiReceipt.hash);

  // 8. Save outputs
  const cleanExplorerUrl = (chain.explorerUrl || "https://via-hadrian.testnet.romeprotocol.xyz").replace(/\/+$/, "");
  const deploymentData = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    vault: vaultAddress,
    adapter: adapterAddress,
    asset: usdcAddress,
    aToken: aTokenAddress,
    aavePool: aavePoolAddress,
    dataProvider: dataProviderAddress,
    solanaProgram: solanaMemoProgram,
    latestCpiTx: cpiReceipt.hash,
    deployedAt: new Date().toISOString(),
    explorerUrl: `${cleanExplorerUrl}/address/${vaultAddress}`,
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(outDir, `yield_port_${network.name}.json`),
    JSON.stringify(deploymentData, null, 2)
  );

  // Also write into web/lib/contracts.json
  const webContractsDir = path.join(__dirname, "../web/lib");
  if (!fs.existsSync(webContractsDir)) {
    fs.mkdirSync(webContractsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(webContractsDir, "contracts.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("\nSaved deployment artifact to deployments/ and web/lib/contracts.json");
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
