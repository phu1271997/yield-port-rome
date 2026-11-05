import { defineChain } from "viem";
import registryData from "./registry-data.json";
import deployedContracts from "./contracts.json";

const hadrianRegistry = registryData.chains.hadrian;
const rubiconRegistry = registryData.chains.rubicon;

export const hadrian = defineChain({
  id: hadrianRegistry.chainId,
  name: hadrianRegistry.name,
  network: "hadrian",
  nativeCurrency: {
    name: hadrianRegistry.nativeCurrency.name,
    symbol: hadrianRegistry.nativeCurrency.symbol,
    decimals: hadrianRegistry.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: [hadrianRegistry.rpcUrl] },
    public: { http: [hadrianRegistry.rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "Via Explorer",
      url: hadrianRegistry.explorerUrl || "https://via-hadrian.testnet.romeprotocol.xyz",
    },
  },
  testnet: true,
});

export const rubicon = defineChain({
  id: rubiconRegistry.chainId,
  name: rubiconRegistry.name,
  network: "rubicon",
  nativeCurrency: {
    name: rubiconRegistry.nativeCurrency.name,
    symbol: rubiconRegistry.nativeCurrency.symbol,
    decimals: rubiconRegistry.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: [rubiconRegistry.rpcUrl] },
    public: { http: [rubiconRegistry.rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "Via Explorer",
      url: rubiconRegistry.explorerUrl || "https://via.mainnet.romeprotocol.xyz",
    },
  },
  testnet: false,
});

// Resolve wUSDC from registry
const hadrianTokens = registryData.tokens.hadrian || [];
const hadrianWUsdc = hadrianTokens.find((t: any) => t.symbol === "wUSDC");

export const CONTRACT_CONFIG = {
  chainId: hadrian.id,
  vaultAddress: (deployedContracts?.vault || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") as `0x${string}`,
  adapterAddress: (deployedContracts?.adapter || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as `0x${string}`,
  usdcAddress: (hadrianWUsdc?.address || deployedContracts?.asset || "0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d") as `0x${string}`,
  explorerUrl: hadrianRegistry.explorerUrl,
  romeEvmProgramId: hadrianRegistry.romeEvmProgramId,
};
