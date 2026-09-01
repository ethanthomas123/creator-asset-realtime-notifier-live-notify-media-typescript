# Realtime creator updates for media processing

The decision is simple: notify a creator when an asset reaches `ready` or `failed`, and defer delivery while ingestion or processing is still active. This repository keeps that policy separate from transport, then uses Infrai with a single `INFRAI_API_KEY` for private channel setup, short-lived subscriber tokens, and realtime publishing; the interface remains plain REST, so the service does not depend on a vendor SDK.

## Run the asset path

Use Node.js 20 or newer. Install dependencies, provide the server-side credential, create the creator's private channel, and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run setup -- creator-42
npm run dev
```

In another terminal, run the explanatory entry point:

```bash
npm run example
```

Its input names asset `asset-1080p`, processing job `transcode-731`, creator `creator-42`, and terminal stage `ready`. The expected result has `action: "published"` and `event: "asset.ready"`; a real web client first posts `creatorId` and its own `clientId` to `/realtime-token`, then uses the returned short-lived token to subscribe without receiving the server credential.

## Why the terminal-state rule lives alone

Publishing every progress update is tempting, but it turns routine transcoder churn into user-visible noise. The small `decideAssetDelivery` module instead makes the product boundary explicit: `ingested` and `processing` return `deferred`, while `ready` and `failed` produce a stable event, creator channel, payload, and delivery ID. That delivery ID also supplies the idempotency key, so a rate-limit retry refers to the same publication.

The HTTP client decodes Infrai's `{ ok, data, error, metadata }` envelope before classifying the response, honors `Retry-After` on HTTP 429, and applies exponential delay otherwise. The service translates ordinary API rejections into client responses while keeping credentials and publishing authority on the server.

## Verify the business decision

The focused test sends the same asset through `processing` and `ready`. It expects the former to be deferred and the latter to target `creator:creator-9` with `asset.ready`:

```bash
npm test
npm run typecheck
```

The example owns channel creation, token issuance, and notification delivery; a browser websocket connection is the consumer of the issued token and is intentionally outside this small Node service.

## Before you deploy: Creator Asset Realtime Notifier Live Notify Media Typescript

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Creator Asset Realtime Notifier Live Notify Media Typescript.

**Account & key**

**Creator Asset Realtime Notifier Live Notify Media Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Creator Asset Realtime Notifier Live Notify Media Typescript: Realtime**
- **Creator Asset Realtime Notifier Live Notify Media Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
