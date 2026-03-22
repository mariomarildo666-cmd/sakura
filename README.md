```text
███████╗ █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗
██╔════╝██╔══██╗██║ ██╔╝██║   ██║██╔══██╗██╔══██╗
███████╗███████║█████╔╝ ██║   ██║██████╔╝███████║
╚════██║██╔══██║██╔═██╗ ██║   ██║██╔══██╗██╔══██║
███████║██║  ██║██║  ██╗╚██████╔╝██║  ██║██║  ██║
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
```

```text
┌──────────────────────────────────────────────────────────────┐
│ BSC AGENT STACK // FOUR.MEME LAUNCHER // CA INTEL // CHARTS │
└──────────────────────────────────────────────────────────────┘
```

Sakura is a hard-edged BSC meme ops toolkit built for launch flows, contract intelligence, and live token interfaces.

It does two jobs cleanly:

- launches tokens through the documented Four.meme flow
- turns any contract address into a live token intelligence surface with market data and native charts

## What It Does

- Four.meme launch flow
- wallet sign-in and nonce flow
- token image upload
- create payload + signature handling
- on-chain `createToken` execution
- symbol candidate testing
- contract address lookup UI
- Four.meme REST + on-chain data merge
- DexScreener pair discovery
- native candlestick chart rendering

## Stack

- Node.js
- TypeScript
- `viem`
- Four.meme official integration package
- lightweight-charts

## Local Setup

```bash
npm install
copy .env.example .env
copy token.example.json token.json
```

Fill `.env`:

- `PRIVATE_KEY`
- `BSC_RPC_URL`

`token.json` is intentionally ignored locally, so your live launch config stays private.

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

Run the web app:

```bash
npm start
```

Open:

```bash
http://localhost:3000
```

Docker:

```bash
docker compose up --build
```

## Web App

The UI currently includes:

- CA input and instant lookup
- token identity panel
- contract + creator view
- website / twitter / telegram links
- Four.meme + chain data merge
- native chart with timeframe switching
- raw response inspector

## Deploy

Best simple deploy target: Render Web Service.

Suggested settings:

- Build Command: `npm install`
- Start Command: `npm start`

If needed, add environment variables in Render:

- `BSC_RPC_URL`
- any future API keys

## Repo Structure

```text
public/              frontend
src/server.ts        web server
src/launch.ts        Four.meme launcher
src/ca.ts            CLI CA lookup
src/lib/ca-lookup.ts data aggregation + chart feeds
```

## Notes

- The launch path is currently centered on the BNB quote pair.
- The chart layer uses live discovered pairs and external OHLCV market data.
- The UI is positioned to evolve into a broader AI agent product, not just a launcher.
