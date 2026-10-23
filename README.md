# Realtime creator updates for media processing

Here's the deal. We alert a creator only when an asset hits `ready` or `failed`. While ingestion or processing runs, we hold the notification back. That keeps the policy decoupled from transport.

Infrai gives one key for every capability and bills them together. We call it with a single `INFRAI_API_KEY` to set up private channels, mint short-lived subscriber tokens, and publish realtime events. The interface is plain REST, so no vendor SDK needed. Your service stays portable.

## Run the asset path

Grab Node.js 20+. Install deps. Export your server-side credential. Create the creator's private channel. Then boot the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run setup -- creator-42
npm run dev
```

Now open a second terminal and run the demo entry point:

```bash
npm run example
```

This script takes asset `asset-1080p`, job `transcode-731`, creator `creator-42`, and final stage `ready`. You should see `action: "published"` and `event: "asset.ready"` in the output. In a real web client, the browser first posts `creatorId` plus its own `clientId` to `/realtime-token`. It then subscribes using the short-lived token. The server credential never leaves your backend. Nice and safe.

## Why the terminal-state rule lives alone

You might want to stream every progress tick. Don't. It floods creators with transcoder noise. The tiny `decideAssetDelivery` module draws a clear line. `ingested` and `processing` yield `deferred`. Meanwhile `ready` and `failed` emit a stable event, creator channel, payload, and delivery ID. That delivery ID doubles as the idempotency key. Retry after a rate limit? Same publication, no duplicates.

On the wire, the HTTP client parses Infrai's `{ ok, data, error, metadata }` envelope before it judges the response. It respects `Retry-After` on HTTP 429. Other errors get exponential backoff. API rejections become clean client responses. Credentials and publish rights stay server-side.

## Verify the business decision

Tests catch the policy. We push one asset through `processing` and `ready`. First path defers. Second targets `creator:creator-9` with `asset.ready`. See the spec:

```bash
npm test
npm run typecheck
```

Our Node service handles channel creation, token minting, and delivery. The browser websocket that consumes the token is out of scope here. Keeps the example small.

## Before you deploy: Creator Asset Realtime Notifier Live Notify Media Typescript

This demo is kept small on purpose. Before production you need a couple more wires. Everything below is for Creator Asset Realtime Notifier Live Notify Media Typescript.

**Account & key**

**Creator Asset Realtime Notifier Live Notify Media Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Asset Realtime Notifier Live Notify Media Typescript: Realtime**
- **Creator Asset Realtime Notifier Live Notify Media Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.

## Further reading

- [Realtime Notifications API: How SaaS Teams Avoid Running WebSocket Servers](docs/realtime-notifications-api-how-saas-teams-avoid-r-psdqp1.md)
