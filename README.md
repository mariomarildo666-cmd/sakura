# Sakura

```text
███████╗ █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗
██╔════╝██╔══██╗██║ ██╔╝██║   ██║██╔══██╗██╔══██╗
███████╗███████║█████╔╝ ██║   ██║██████╔╝███████║
╚════██║██╔══██║██╔═██╗ ██║   ██║██╔══██╗██╔══██║
███████║██║  ██║██║  ██╗╚██████╔╝██║  ██║██║  ██║
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
```

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
- Sakura verdicts powered by Hugging Face
- Sakura agent endpoint with `read`, `warn`, `tweet`, and `reply` modes
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
- X mention bot hooks for `@sakuraonbsc 0x...` style replies
- X mention launch hooks for `@sakuraonbsc deploy NAME + TICKER`

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
- `HF_API_KEY`
- optional: `HF_MODEL` default is `meta-llama/Llama-3.1-8B-Instruct:cerebras`
- `X_BOT_USERNAME`
- `X_BEARER_TOKEN`
- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_BOT_DRY_RUN`
- `X_BOT_POLL_SECONDS`
- optional: `X_BOT_USER_ID`
- optional: `X_BOT_MAX_RESULTS`
- optional: `X_BOT_STATE_PATH`
- optional: `X_BOT_LAUNCH_CONFIG` default is `token.json`

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

Run Sakura agent mode directly:

```bash
curl "http://localhost:3000/api/sakura-agent?address=0xYourContractAddress&mode=read"
```

Create a reply draft for a tagged CA:

```bash
npm run x-draft -- 0xYourContractAddress
```

Process mentions once:

```bash
npm run x-bot -- once
```

Run the mention bot loop:

```bash
npm run x-bot -- poll
```

Launch by mention:

```text
@sakuraonbsc deploy Siren + SIREN
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

This app has two runtime roles in production:

- Web Service: UI + API routes
- X Bot Worker: mention polling loop

They should run as separate services. The X bot should not rely on the web service process staying alive.

### Deploy Web Service

Use this for the website and API:

- Build Command: `npm install`
- Start Command: `npm start`

Required environment:

- `BSC_RPC_URL`
- `HF_API_KEY`
- optional: `HF_MODEL`

### Deploy X Bot

Run the X mention poller as a separate background worker/service:

- Build Command: `npm install`
- Start Command: `npm run x-bot -- poll`

Required environment:

- `PRIVATE_KEY`
- `BSC_RPC_URL`
- `HF_API_KEY`
- optional: `HF_MODEL`
- `X_BOT_USERNAME`
- `X_BEARER_TOKEN`
- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_BOT_DRY_RUN`
- `X_BOT_POLL_SECONDS`
- optional: `X_BOT_USER_ID`
- optional: `X_BOT_MAX_RESULTS`
- optional: `X_BOT_STATE_PATH`
- optional: `X_BOT_LAUNCH_CONFIG`

Important:

- if `X_BOT_DRY_RUN` is not explicitly set to `false`, the bot will not post live replies
- the same rule applies to live Four.meme launches triggered from X mentions

Production note:

- mention state is currently stored in `.data/x-bot-state.json`
- this is not durable on ephemeral platforms or across redeploys/restarts
- TODO: move bot state to persistent storage for production use

### Example Render Setup

- Web Service
  - Build Command: `npm install`
  - Start Command: `npm start`
- Background Worker
  - Build Command: `npm install`
  - Start Command: `npm run x-bot -- poll`

## Repo Map

```text
public/                  frontend ui
public/assets/           sakura art
src/server.ts            web server + api routes
src/launch.ts            Four.meme launcher
src/ca.ts                CLI CA lookup
src/x-bot.ts             X mention bot runner
src/agents/sakura-agent.ts Sakura tool-based agent modes
src/agents/sakura.ts     Sakura analysis logic
src/agents/tools.ts      Sakura tool wrappers
src/lib/ca-lookup.ts     token aggregation + market discovery
src/lib/x-bot.ts         X auth, mention polling, and reply posting
```

## Notes

- the launch path is centered on the BNB quote pair
- the chart panel currently uses DexScreener embed
- recent searches are global for the running service, but memory-based
- if the server restarts, recent searches reset
- the X bot stores its mention state in `.data/x-bot-state.json`
- X replies are dry-run by default until `X_BOT_DRY_RUN=false`
- Sakura is being shaped into a broader meme coin agent product over time

## Vibe

```text
Sakura does not do polite research.
Sakura reads the coin, judges the vibe, and tells you if it feels shillable.
```

