import "dotenv/config";

import { lookupCa } from "./lib/ca-lookup.js";

async function main() {
  const rawInput = process.argv.slice(2).join(" ").trim();
  if (!rawInput) {
    throw new Error("Usage: npm run ca -- <contract-address or text containing 0x...>");
  }

  const result = await lookupCa(rawInput);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
