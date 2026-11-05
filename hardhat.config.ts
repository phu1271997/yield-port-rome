import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

dotenv.config();

function getPrivateKey(): string {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  if (process.env.GENLAYER_PRIVATE_KEY) return process.env.GENLAYER_PRIVATE_KEY;
  const genlayerPath = path.join(os.homedir(), ".genlayer/keys.env");
  if (fs.existsSync(genlayerPath)) {
    const content = fs.readFileSync(genlayerPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("PRIVATE_KEY=") || trimmed.startsWith("GENLAYER_PRIVATE_KEY=")) {
        const val = trimmed.split("=")[1]?.trim().replace(/^["']|["']$/g, "");
        if (val && val.length >= 64) return val.startsWith("0x") ? val : `0x${val}`;
      }
    }
  }
  return "0x0000000000000000000000000000000000000000000000000000000000000001";
}

const privateKey = getPrivateKey();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    hadrian: {
      url: process.env.HADRIAN_RPC || "https://hadrian.testnet.romeprotocol.xyz/",
      chainId: 200010,
      accounts: [privateKey],
    },
    rubicon: {
      url: process.env.RUBICON_RPC || "https://rubicon.mainnet.romeprotocol.xyz/",
      chainId: 7531,
      accounts: [privateKey],
    },
  },
};

export default config;
