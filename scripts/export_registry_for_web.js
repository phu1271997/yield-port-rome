const { getChain, getTokens, getContracts, getPrograms } = require("@rome-protocol/registry");
const fs = require("fs");
const path = require("path");

const hadrian = getChain(200010);
const rubicon = getChain(7531);
const hadrianTokens = getTokens(200010);
const rubiconTokens = getTokens(7531);
const hadrianContracts = getContracts(200010);
const rubiconContracts = getContracts(7531);
const devnetPrograms = getPrograms("devnet");
const mainnetPrograms = getPrograms("mainnet");

const registryData = {
  chains: {
    hadrian,
    rubicon,
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

const targetPath = path.join(__dirname, "../web/lib/registry-data.json");
fs.writeFileSync(targetPath, JSON.stringify(registryData, null, 2));
console.log("Successfully exported registry data to web/lib/registry-data.json");
