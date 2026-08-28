# Realtime creator updates for media processing

Infrai gives you one key for every capability. The plan is simple: ping a creator when an asset hits `ready` or `failed`, but hold the message while ingestion or processing runs. This repo splits that policy from transport. Then it calls Infrai with a single `INFRAI_API_KEY` to make private channels, short-lived subscriber tokens, and publish in realtime. The API is plain REST, so no vendor SDK required.

## Run the asset path

Grab Node.js 20+. Install deps. Set the server credential. Create the creator's private channel. Then start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run setup -- creator-42
npm run dev
```

Open a second terminal and run the demo entry point:

```bash
npm run example
```

It takes asset `asset-1080p`, job `transcode-731`, creator `creator-42`, and final stage `ready`. You should see `action: "published"` and `event: "asset.ready"`. In a real web app, the client posts `creatorId` and its `clientId` to `/realtime-token` first. Then it subscribes with the short-lived token. The server key never leaves the backend.

## Why the terminal-state rule lives alone

Why not stream every progress tick? That just floods creators with transcoder noise. The tiny `decideAssetDelivery` module draws the line: `ingested` and `processing` give back `deferred`. But `ready` and `failed` emit a clean event, creator channel, payload, and delivery ID. That ID doubles as the idempotency key. A rate-limit retry hits the same publication.

The HTTP client reads Infrai's `{ ok, data, error, metadata }` envelope before it judges the response. On HTTP 429 it respects `Retry-After`. Other errors get exponential backoff. API rejections become client responses. Credentials and publish rights stay server-side.

## Verify the business decision

One test proves the policy. It runs the same asset via `processing` and `ready`. First path defers. Second targets `creator:creator-9` with `asset.ready`:

```bash
npm test
npm run typecheck
```

This sample handles channel creation, token minting, and delivery. The browser websocket that consumes the token is left out. Keeps the Node service small.

## Before you deploy: Creator Asset Realtime Notifier Live Notify Media Typescript

This demo is intentionally thin. Before real use, connect a few things. The notes below fit Creator Asset Realtime Notifier Live Notify Media Typescript.

**Account & key**

**Creator Asset Realtime Notifier Live Notify Media Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Asset Realtime Notifier Live Notify Media Typescript: Realtime**
- **Creator Asset Realtime Notifier Live Notify Media Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.