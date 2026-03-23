# Sakura

```text
   /)  /)
  ( ^-^)   sakura terminal
 c(")(")   meme coin reads for chaotic traders
```

```text
╭──────────────────────────────────────────────────────────────╮
│  SAKURA // FOUR.MEME OPS // CA LOOKUP // MEME COIN READER   │
╰──────────────────────────────────────────────────────────────╯
```

Sakura is a cute BSC meme coin terminal built around two things:

- launching through the documented Four.meme flow
- reading any contract address through a stylized lookup dashboard

It is part launcher, part CA intelligence tool, part anime trader product.

## What Sakura Does

- Four.meme launch flow with wallet sign-in and create payload handling
- token image upload and launch execution
- symbol candidate checking
- CA lookup from Four.meme REST + on-chain token info
- DexScreener pair discovery
- DexScreener chart embed inside the app
- Sakura verdicts with OpenAI first, heuristic fallback second
- recent global searches shown inside the UI
- shareable lookup URLs via `?ca=...`

## Current Product Feel

```text
search ca -> read token -> let sakura react -> open market -> share result
```

The web app currently includes:

- top-level CA search
- token identity cards
- contract / creator / socials view
- Sakura analysis panel with character states
- market panel
- raw payload inspector
- recent searches visible to all visitors on the running service

## Stack

- Node.js
- TypeScript
- `viem`
- `@four-meme/four-meme-ai`
- Four.meme protocol integration flow

## Local Setup

```bash
npm install
copy .env.example .env
copy token.example.json token.json
```

Fill `.env` with what you need:

- `PRIVATE_KEY`
- `BSC_RPC_URL`
- `OPENAI_API_KEY`
- optional: `OPENAI_MODEL` default is `gpt-5.4-mini`

`token.json` is ignored locally so live launch configs stay private.

## Commands

Launch dry run:

```bash
npm run launch -- token.json
```

Check symbol candidates:

```bash
npm run symbol-check -- token.json symbols.txt
```

Lookup by contract address:

```bash
npm run ca -- 0xYourContractAddress
```

Run the website:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Docker:

```bash
docker compose up --build
```

## Deploy

Best simple target:

- Render Web Service

Suggested settings:

- Build Command: `npm install`
- Start Command: `npm start`

Useful environment variables:

- `BSC_RPC_URL`
- `OPENAI_API_KEY`
- optional: `OPENAI_MODEL`

## Repo Map

```text
public/                  frontend ui
public/assets/           sakura art
src/server.ts            web server + api routes
src/launch.ts            Four.meme launcher
src/ca.ts                CLI CA lookup
src/agents/sakura.ts     Sakura analysis logic
src/lib/ca-lookup.ts     token aggregation + market discovery
```

## Notes

- the launch path is centered on the BNB quote pair
- the chart panel currently uses DexScreener embed
- recent searches are global for the running service, but memory-based
- if the server restarts, recent searches reset
- Sakura is being shaped into a broader meme coin agent product over time

## Vibe

```text
Sakura does not do polite research.
Sakura reads the coin, judges the vibe, and tells you if it feels shillable.
```
