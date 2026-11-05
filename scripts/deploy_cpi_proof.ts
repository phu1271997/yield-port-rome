import { ethers, network } from "hardhat";
import { getPrograms, getChain } from "@rome-protocol/registry";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

function base58ToBytes32(base58String: string): string {
  const bytes = bs58.decode(base58String);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32 bytes for pubkey, got ${bytes.length}`);
  }
  return "0x" + Buffer.from(bytes).toString("hex");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("--------------------------------------------------");
  console.log("Deploying CpiProof contract on network:", network.name);
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatUnits(balance, 18), "gas token");

  // Fetch live Solana Memo program ID from registry
  const chainId = network.config.chainId || 200010;
  const isTestnet = chainId === 200010;
  const cluster = isTestnet ? "devnet" : "mainnet";

  const programs = getPrograms(cluster as any);
  if (!programs?.memo) {
    throw new Error(`Memo program not found in registry for cluster: ${cluster}`);
  }
  console.log(`Found live Solana Memo program for ${cluster}:`, programs.memo);

  const memoBytes32 = base58ToBytes32(programs.memo);
  console.log("Solana Memo program ID as bytes32:", memoBytes32);

  // Deploy CpiProof
  const CpiProofFactory = await ethers.getContractFactory("CpiProof");
  const cpiProof = await CpiProofFactory.deploy(memoBytes32);
  await cpiProof.waitForDeployment();

  const cpiProofAddress = await cpiProof.getAddress();
  console.log("CpiProof deployed at:", cpiProofAddress);

  // Send a test memo CPI if deployer has gas
  if (balance > 0n) {
    console.log("Executing test CPI call into Solana Memo program...");
    const memoMessage = `Rome Arena de-risk: Yield Port CPI alive at ${Date.now()}`;
    const tx = await cpiProof.sendMemo(memoMessage);
    console.log("CPI Transaction submitted. Hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("CPI Transaction confirmed in block:", receipt?.blockNumber);

    const chain = getChain(chainId);
    if (chain?.explorerUrl) {
      console.log(`View EVM explorer: ${chain.explorerUrl}/tx/${tx.hash}`);
    }
    console.log(`Verify settlement with CLI: rome tx hadrian ${tx.hash}`);
  } else {
    console.log("Notice: Deployer has 0 gas balance. Run `rome fund hadrian` to fund with USDC.");
  }

  // Save deployment info
  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(outDir, `cpi_proof_${network.name}.json`),
    JSON.stringify(
      {
        network: network.name,
        chainId,
        cpiProof: cpiProofAddress,
        memoProgram: programs.memo,
        memoBytes32,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
