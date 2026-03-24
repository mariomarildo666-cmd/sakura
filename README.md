# Sakura Terminal

```text
 ███████╗ █████╗ ██╗  ██╗██╗   ██╗██████╗  █████╗ 
 ██╔════╝██╔══██╗██║ ██╔╝██║   ██║██╔══██╗██╔══██╗
 ███████╗███████║█████╔╝ ██║   ██║██████╔╝███████║
 ╚════██║██╔══██║██╔═██╗ ██║   ██║██╔══██╗██╔══██║
 ███████║██║  ██║██║  ██╗╚██████╔╝██║  ██║██║  ██║
 ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
```

```text
SAKURA TERMINAL
AI CONTRACT INTELLIGENCE ENGINE
```

```text
----------------------------------------
OVERVIEW
----------------------------------------
```

Sakura Terminal is an AI-powered BSC contract intelligence engine.

Built to:

- analyze BSC contracts
- read meme strength and crowding
- flag weak structure and exit-liquidity risk
- launch tokens through the Four.meme flow
- execute deploy commands from X mentions

Product tone:

- trading intelligence
- anime terminal aesthetics
- degen-aware, not hype-brained

```text
----------------------------------------
FEATURES
----------------------------------------
```

- AI contract analysis
- meme strength detection
- launch risk evaluation
- creator / socials / token identity lookup
- DexScreener pair discovery and chart embedding
- X mention bot replies for `@sakuraonbsc 0x...`
- X deploy bot commands for `@sakuraonbsc deploy NAME + TICKER`
- Four.meme launch execution
- global recent searches in the UI
- shareable lookup URLs via `?ca=...`

```text
----------------------------------------
ARCHITECTURE
----------------------------------------
```

```text
            X (Twitter)
                |
                v
        +----------------+
        |   Sakura Bot   |
        +--------+-------+
                 |
                 v
        +----------------+
        |  Launch Core   |
        +--------+-------+
                 |
                 v
        +----------------+
        |   Four.meme    |
        +--------+-------+
                 |
                 v
              BSC Chain

                 ^
                 |
        +----------------+
        |  Web Terminal  |
        |  CA + Sakura   |
        +----------------+
```

```text
----------------------------------------
QUICK START
----------------------------------------
```

```bash
git clone https://github.com/mariomarildo666-cmd/sakura.git
cd sakura
npm install
copy .env.example .env
copy token.example.json token.json
npm start
```

Open:

```text
http://localhost:3000
```

```text
----------------------------------------
COMMANDS
----------------------------------------
```

Launch from config:

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

Run the web terminal:

```bash
npm start
```

Run Sakura agent directly:

```bash
curl "http://localhost:3000/api/sakura-agent?address=0xYourContractAddress&mode=read"
```

Create an X reply draft for a tagged CA:

```bash
npm run x-draft -- 0xYourContractAddress
```

Process X mentions once:

```bash
npm run x-bot -- once
```

Run the mention poll loop:

```bash
npm run x-bot -- poll
```

```text
----------------------------------------
DEPLOY COMMAND
----------------------------------------
```

```text
@sakuraonbsc deploy Moon Dog + MDOG
```

Meaning:

- `deploy` -> launch command
- `Moon Dog` -> token name
- `MDOG` -> ticker

Live launch behavior:

- if `X_BOT_DRY_RUN=false`, the bot can trigger a real Four.meme launch
- otherwise it only simulates the launch and replies in dry-run mode

```text
----------------------------------------
ENVIRONMENT VARIABLES
----------------------------------------
```

| Variable | Description |
| --- | --- |
| `PRIVATE_KEY` | Wallet private key used for live launches |
| `BSC_RPC_URL` | BSC RPC endpoint |
| `HF_API_KEY` | Hugging Face API key for Sakura analysis |
| `HF_MODEL` | Optional model override, defaults to `meta-llama/Llama-3.1-8B-Instruct:cerebras` |
| `X_BOT_USERNAME` | X account username for the bot |
| `X_BEARER_TOKEN` | X bearer token for mention reads |
| `X_API_KEY` | X API key |
| `X_API_SECRET` | X API secret |
| `X_ACCESS_TOKEN` | X access token |
| `X_ACCESS_TOKEN_SECRET` | X access token secret |
| `X_BOT_DRY_RUN` | Set to `false` for live posting and live launch execution |
| `X_BOT_POLL_SECONDS` | Poll interval for mention loop |
| `X_BOT_USER_ID` | Optional explicit bot user id |
| `X_BOT_MAX_RESULTS` | Optional mention fetch batch size |
| `X_BOT_STATE_PATH` | Optional state file path for mention cursor storage |
| `X_BOT_LAUNCH_CONFIG` | Optional launch config path, defaults to `token.json` |

Notes:

- `token.json` is ignored locally so live launch configs stay private
- mention state currently lives in `.data/x-bot-state.json`
- ephemeral platforms can lose that state on restart or redeploy

```text
----------------------------------------
DEPLOYMENT
----------------------------------------
```

This project has two production roles:

- Web Service -> UI + API routes
- X Bot Worker -> mention polling loop

They should run as separate services.

Web Service:

- Build Command: `npm install`
- Start Command: `npm start`

X Bot Worker:

- Build Command: `npm install`
- Start Command: `npm run x-bot -- poll`

Important:

- if `X_BOT_DRY_RUN` is not explicitly `false`, the bot will not post live replies
- the same rule applies to live Four.meme launches from X mentions
- TODO: move `.data/x-bot-state.json` to durable storage for production

Example Render layout:

- Web Service
  - Build Command: `npm install`
  - Start Command: `npm start`
- Background Worker
  - Build Command: `npm install`
  - Start Command: `npm run x-bot -- poll`

```text
----------------------------------------
STATUS
----------------------------------------
```

```text
Engine:      Online
Network:     BSC
Launch Core: Four.meme
Chart Feed:  DexScreener
AI Model:    Llama-3.1 / HF
X Mode:      Mention Polling
```

```text
----------------------------------------
REPO MAP
----------------------------------------
```

```text
public/                    frontend ui
public/assets/             sakura art
src/server.ts              web server + api routes
src/launch.ts              Four.meme launcher entry
src/ca.ts                  CLI CA lookup
src/x-bot.ts               X mention bot runner
src/agents/sakura.ts       Sakura analysis core
src/agents/sakura-agent.ts Sakura agent modes
src/agents/tools.ts        Sakura tool wrappers
src/lib/ca-lookup.ts       token aggregation + market discovery
src/lib/fourmeme-launch.ts reusable Four.meme launch flow
src/lib/x-bot.ts           X auth, mention parsing, reply + deploy logic
```

```text
----------------------------------------
NOTES
----------------------------------------
```

- launch path is centered on the BNB quote pair
- chart panel uses DexScreener embed
- recent searches are global for the running service
- recent search storage is memory-based
- server restart resets recent search history
- Sakura is being shaped into a broader meme coin intelligence layer over time

```text
----------------------------------------
Built for degens.
Powered by Sakura.
----------------------------------------
```
