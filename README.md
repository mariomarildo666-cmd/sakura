# Four.meme launcher

This workspace contains a Node/TypeScript launcher for creating a token on Four.meme through the documented flow:

1. Generate nonce
2. Sign in with the launch wallet
3. Upload the token image
4. Request `createArg` and API signature
5. Call `TokenManager2.createToken(bytes args, bytes signature)` on BSC

## Setup

```bash
npm install
copy .env.example .env
copy token.example.json token.json
```

Fill `.env` with:

- `PRIVATE_KEY`: wallet used for login and on-chain creation
- `BSC_RPC_URL`: BSC RPC endpoint

Put your token image on disk and update `imagePath` in `token.json`.

## Usage

Dry run:

```bash
npm run launch -- token.json
```

Real launch:

1. Set `"dryRun": false` in `token.json`
2. Make sure the wallet has enough BNB for the current Four.meme launch fee and your `presale`
3. Run:

```bash
npm run launch -- token.json
```

Check symbol candidates:

```bash
npm run symbol-check -- token.json symbols.txt
```

Lookup a token by CA:

```bash
npm run ca -- 0xYourContractAddress
```

Run the website locally:

```bash
npm start
```

Open:

```bash
http://localhost:3000
```

One-command Docker run:

```bash
docker compose up --build
```

## Notes

- The launcher currently validates and targets the BNB quote pair. That is the safest verified path from Four.meme's current public docs.
- If the wallet is recognized by Four.meme's `AgentIdentifier` contract, the launched token should be marked as created by an agent wallet.
- The script reads the live raised-token config from `https://four.meme/meme-api/v1/public/config`.
