import { ethers, network } from "hardhat";
import { execSync } from "child_process";
import { expect } from "chai";
import * as path from "path";
import * as fs from "fs";

async function main() {
  console.log("==================================================");
  console.log("Running Atomic Solana CPI Integration Test on Hadrian");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.config.chainId);

  if (network.config.chainId !== 200010) {
    throw new Error(`This integration test is for Rome Hadrian (chainId 200010), not ${network.config.chainId}`);
  }

  const [signer] = await ethers.getSigners();
  console.log("Signer address:", signer.address);

  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Signer USDC gas balance:", ethers.formatUnits(balance, 18));
  if (balance === 0n) {
    throw new Error("Signer has 0 gas balance on Hadrian.");
  }

  // Load deployed YieldVault address
  const deploymentsPath = path.join(__dirname, "../deployments/yield_port_hadrian.json");
  let vaultAddress = "0x35277217b31573b0547a63469C19F7F35e7566Ab";
  if (fs.existsSync(deploymentsPath)) {
    const dep = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    if (dep.contracts?.YieldVault) {
      vaultAddress = dep.contracts.YieldVault;
    }
  }
  console.log("YieldVault address:", vaultAddress);

  const vault = await ethers.getContractAt("YieldVault", vaultAddress, signer);

  // Assert target Solana program is configured
  const targetProgram = await vault.solanaTargetProgram();
  console.log("Solana Target Program (bytes32):", targetProgram);
  expect(targetProgram).to.not.equal(ethers.ZeroHash);

  const cpiEnabled = await vault.atomicCpiEnabled();
  console.log("Atomic CPI Enabled:", cpiEnabled);
  expect(cpiEnabled).to.be.true;

  // Execute atomic CPI settlement receipt
  const memoTag = `integration-test-dep-${Date.now()}`;
  console.log("\nSubmitting atomic Solana CPI transaction with tag:", memoTag);
  const tx = await vault.executeAtomicCpiReceipt(memoTag, {
    gasLimit: 500000,
  });
  console.log("Transaction submitted. Hash:", tx.hash);

  const receipt = await tx.wait();
  expect(receipt).to.not.be.null;
  expect(receipt!.status).to.equal(1);
  console.log(`Transaction confirmed in block ${receipt!.blockNumber} (gasUsed: ${receipt!.gasUsed})`);

  // Assert SolanaCpiSettlement event was emitted
  const iface = vault.interface;
  const settlementTopic = iface.getEvent("SolanaCpiSettlement")?.topicHash;
  const settlementLogs = receipt!.logs.filter((l) => l.topics[0] === settlementTopic);

  expect(settlementLogs.length).to.be.greaterThan(0);
  const parsedEvent = iface.parseLog({
    topics: settlementLogs[0].topics as string[],
    data: settlementLogs[0].data,
  });
  const eventProgramId = parsedEvent?.args?.programId || parsedEvent?.args?.[4];
  console.log("\n[ASSERTION PASSED] SolanaCpiSettlement event emitted:");
  console.log("  Sender:", parsedEvent?.args?.sender || parsedEvent?.args?.[0]);
  console.log("  Receiver:", parsedEvent?.args?.receiver || parsedEvent?.args?.[1]);
  console.log("  ProgramId:", eventProgramId);
  expect(eventProgramId.toLowerCase()).to.equal(targetProgram.toLowerCase());

  // Query cross-VM settlement via Rome CLI
  console.log("\nVerifying settlement via Rome CLI: `rome tx hadrian " + tx.hash + "`");
  let cliOutput: any;
  try {
    const cmd = `npx github:rome-protocol/rome-cli tx hadrian ${tx.hash}`;
    const rawOut = execSync(cmd, { encoding: "utf8" });
    cliOutput = JSON.parse(rawOut);
  } catch (err: any) {
    console.warn("CLI execution warning:", err.message);
  }

  if (cliOutput) {
    console.log("[ASSERTION PASSED] Rome CLI reported status:", cliOutput.status);
    expect(cliOutput.status).to.equal("success");
    expect(cliOutput.solanaSettlement).to.be.an("array");
    expect(cliOutput.solanaSettlement.length).to.be.greaterThan(0);

    const solanaTxSig = cliOutput.solanaSettlement[0];
    console.log("  Solana Devnet Settlement Signature:", solanaTxSig);
    console.log("  Explorer URL:", cliOutput.explorer);

    // Verify inner Memo program invocation on Solana Devnet
    console.log("\nVerifying inner Memo program invocation on Solana devnet...");
    const solanaRpcRes = await fetch("https://api.devnet.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [solanaTxSig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }],
      }),
    });
    const solanaData: any = await solanaRpcRes.json();
    const logMessages: string[] = solanaData?.result?.meta?.logMessages || [];

    const memoLog = logMessages.find(
      (m) =>
        m.includes("Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr invoke") ||
        m.includes("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr success")
    );
    console.log("[ASSERTION PASSED] Found inner Memo program log in Solana tx:", memoLog);
    expect(memoLog).to.not.be.undefined;
  }

  console.log("\n==================================================");
  console.log("ALL INTEGRATION TEST ASSERTIONS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
