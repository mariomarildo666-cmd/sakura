import "dotenv/config";

import { buildSakuraReplyDraft, pollMentionsForever, processMentionsOnce } from "./lib/x-bot.js";

async function main() {
  const [command = "once", ...rest] = process.argv.slice(2);

  switch (command) {
    case "draft": {
      const rawInput = rest.join(" ").trim();
      if (!rawInput) {
        throw new Error("Usage: npm run x-draft -- <contract-address or text containing 0x...>");
      }

      const draft = await buildSakuraReplyDraft(rawInput, process.env.X_BOT_TEST_USERNAME?.trim() || "anon");
      console.log(JSON.stringify(draft, null, 2));
      return;
    }
    case "poll": {
      await pollMentionsForever();
      return;
    }
    case "once":
    default: {
      const result = await processMentionsOnce();
      console.log(JSON.stringify(result, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
