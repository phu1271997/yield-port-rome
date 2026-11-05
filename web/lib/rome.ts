import { defineChain } from "viem";
import registryData from "./registry-data.json";
import deployedContracts from "./contracts.json";

const hadrianRegistry = registryData.chains.hadrian;
const rubiconRegistry = registryData.chains.rubicon;

if (!deployedContracts || !deployedContracts.vault) {
  throw new Error("Missing deployed contracts configuration. Please run deployment scripts first.");
}

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
      url: (hadrianRegistry.explorerUrl || "https://via-hadrian.testnet.romeprotocol.xyz").replace(/\/+$/, ""),
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
      url: (rubiconRegistry.explorerUrl || "https://via.mainnet.romeprotocol.xyz").replace(/\/+$/, ""),
    },
  },
  testnet: false,
});

// Resolve wUSDC from registry
const hadrianTokens = registryData.tokens.hadrian || [];
const hadrianWUsdc = hadrianTokens.find((t: any) => t.symbol === "wUSDC");

export const CONTRACT_CONFIG = {
  chainId: hadrian.id,
  vaultAddress: deployedContracts.vault as `0x${string}`,
  adapterAddress: deployedContracts.adapter as `0x${string}`,
  usdcAddress: (hadrianWUsdc?.address || deployedContracts.asset) as `0x${string}`,
  explorerUrl: (hadrianRegistry.explorerUrl || "https://via-hadrian.testnet.romeprotocol.xyz").replace(/\/+$/, ""),
  romeEvmProgramId: hadrianRegistry.romeEvmProgramId,
};

export function getExplorerTxUrl(hash: string): string {
  const base = CONTRACT_CONFIG.explorerUrl;
  return `${base}/tx/${hash}`;
}

export function getExplorerAddressUrl(address: string): string {
  const base = CONTRACT_CONFIG.explorerUrl;
  return `${base}/address/${address}`;
}
