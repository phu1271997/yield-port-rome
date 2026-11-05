const { getChain, getTokens, getContracts, getPrograms } = require("@rome-protocol/registry");
const fs = require("fs");
const path = require("path");

try {
  const hadrian = getChain(200010);
  const rubicon = getChain(7531);
  const hadrianTokens = getTokens(200010);
  const rubiconTokens = getTokens(7531);
  const hadrianContracts = getContracts(200010);
  const rubiconContracts = getContracts(7531);
  const devnetPrograms = getPrograms("devnet");
  const mainnetPrograms = getPrograms("mainnet");

  // Ensure Hadrian network is properly labeled
  const hadrianClean = {
    ...hadrian,
    network: "hadrian",
    explorerUrl: (hadrian.explorerUrl || "https://via-hadrian.testnet.romeprotocol.xyz").replace(/\/+$/, ""),
  };

  const rubiconClean = {
    ...rubicon,
    network: "rubicon",
    explorerUrl: (rubicon.explorerUrl || "https://via.mainnet.romeprotocol.xyz").replace(/\/+$/, ""),
  };

  const registryData = {
    chains: {
      hadrian: hadrianClean,
      rubicon: rubiconClean,
    },
    tokens: {
      hadrian: hadrianTokens,
      rubicon: rubiconTokens,
    },
    contracts: {
      hadrian: hadrianContracts,
      rubicon: rubiconContracts,
    },
    programs: {
      devnet: devnetPrograms,
      mainnet: mainnetPrograms,
    },
    exportedAt: new Date().toISOString(),
  };

  const targetPath = path.join(__dirname, "../lib/registry-data.json");
  fs.writeFileSync(targetPath, JSON.stringify(registryData, null, 2));
  console.log("Successfully refreshed web/lib/registry-data.json from @rome-protocol/registry");
} catch (err) {
  console.warn("Registry export warning:", err.message);
}
