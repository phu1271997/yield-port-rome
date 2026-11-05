import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const privateKey =
  process.env.PRIVATE_KEY ||
  process.env.GENLAYER_PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";

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
