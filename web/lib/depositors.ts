export interface VerifiedDepositor {
  label: string;
  address: string;
  tx: string;
  solanaSig: string;
  block: number;
}

export const VERIFIED_TEST_DEPOSITORS: VerifiedDepositor[] = [
  {
    label: "Deployer / Vault Admin",
    address: "0x8b563A8c9eeF530300e92E26457D1AB001daEcC7",
    tx: "0x2c797304146a2b9711f1e19def90a859574f63be336d7585313a3da52c7d4f47",
    solanaSig: "4EA7rrCXoQi1ae1kGB2vUzoFNzmFCPs9Lnc6A2QBvXUB1TYEh5MFMzUyYryJ2mQ1rnRDrzb7se9GLF7nSShAPPvj",
    block: 518988728,
  },
  {
    label: "Primary Test Wallet",
    address: "0xFdc45874126A0580d9A9d034F2AA20d9bdad8235",
    tx: "0xceb82f947f3e6de19a247e0074b01ad4b609aade3dd71c1d18db5d66c004ae1e",
    solanaSig: "5NChaKcj5EsSTZJFsnbyr24kLPzXXhtjbgpvybwKokKiUCtcPtntvgpDKaKL5MFfkRHnrpB539pLkU759Y67Xx2Y",
    block: 518988740,
  },
  {
    label: "Secondary Test Wallet A",
    address: "0xCd8bE5b63AAb48E65AD9c2f64a9768Cbc923Df81",
    tx: "0xf1d7f6d7d6b8e4f69771d148949ba39e74ec0a7f65afa299063060619f4237c9",
    solanaSig: "3pzfqtoaJfGbjtgwymHT5NSmuaCJyJLPuJwaKQBWSSMruDU3RJkeSKKQs7aBJM8h8WbotMF37sySkSLVUU1Z6Vh1",
    block: 518988752,
  },
  {
    label: "Secondary Test Wallet B",
    address: "0x0aCCF52Aa2F50fC6eEFe67fb2558bcD721854CD7",
    tx: "0x6ffa7fe8677e17b38f4b743f50eaa4eb12168f422be5543cef4a19e2861fd05b",
    solanaSig: "3ApuHcv96gFwe2cabq1xZA9t5YMTAiAvbDmtdKpqL2Y6sa7LcEm9wUvhJrQgvSSctPepuQDzoKTCkWeTWSEHZHke",
    block: 518988764,
  },
  {
    label: "Secondary Test Wallet C",
    address: "0x4606f21DF0F3aF9CbFf39aFD2822380FE8d7BFa1",
    tx: "0x90d6db5b54c58bedd409ba25ee0be6db98c3b0e3fa5663e7116947a0851aec24",
    solanaSig: "i8iMd6eGM3izQ3FDSfpw8EgpXQJVHdJPRFEaZe5Vsv2xHQeHL7JicrwM7FboFpNUpaGoRUmieErM1eiBCcWNAze",
    block: 518988776,
  },
];
