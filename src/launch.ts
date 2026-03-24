import "dotenv/config";

import path from "node:path";

import { launchTokenFromConfig, runSymbolCheck } from "./lib/fourmeme-launch.js";

async function main() {
  const mode = process.argv[2] === "symbol-check" ? "symbol-check" : "launch";

  if (mode === "symbol-check") {
    const configPath = process.argv[3] ?? "token.json";
    const candidatesPath = process.argv[4] ?? "symbols.txt";
    const validSymbol = await runSymbolCheck(configPath, path.resolve(candidatesPath));
    if (validSymbol) {
      console.log(`VALID SYMBOL: ${validSymbol}`);
      return;
    }

    console.log("No valid symbol found in candidate list.");
    return;
  }

  const configPath = process.argv[2] ?? "token.json";
  const result = await launchTokenFromConfig(configPath);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
