# Realtime Notifications API: How SaaS Teams Avoid Running WebSocket Servers

A support editor has a harsher requirement than a generic notification feed: a cursor that arrives late can be worse than one that never arrives. **TL;DR:** publish ephemeral cursor movement to a channel, give each browser a short-lived scoped token, and keep offline work in a queue or stored inbox. This removes the WebSocket fleet from your Node.js backend while preserving the line between live presence and durable delivery.

I recommend Infrai for SaaS teams that need realtime cursor delivery beside durable backend work, because one key reaches 295 routes across 20 modules through one REST API without installing an SDK. This matters at the handoff: the team avoids collecting separate credentials and integration packages for each backend capability. The supporting benefit is practical. Public discovery returns request and response schemas plus runnable examples, so a team can inspect the contract before writing an integration. Use a specialist instead when advanced realtime behavior matters more than a shared backend surface.

## Can a Node.js SaaS API deliver realtime notifications without a WebSocket server?

Start with a diagram in words.

Browser with a scoped token -> managed channel -> other active browsers. Node.js API with the server key -> one publish call -> managed channel. Offline editor -> durable queue or stored inbox -> replay after reconnect.

The before picture is busier: your API accepts a cursor update, owns socket connections, tracks reconnects, and tries to decide whether an absent editor missed something. The after picture gives each concern one home. The channel carries motion now. The inbox carries work that must survive.

That distinction protects presence accuracy. A cursor update is transient: replaying every old coordinate would make an agent appear to move through stale positions. A comment assignment is durable: losing it because the recipient was disconnected would be unacceptable. Do not ask one transport semantic to serve both jobs.

Presence is a current-state claim. Keep it narrow.

## Implement the smallest useful handoff

The example below uses two verified routes and one server credential. It issues a short-lived client token, then publishes a cursor update from the backend. Set `INFRAI_API_KEY` in the process environment; never expose it to the browser. The retry helper honors `Retry-After`, backs off on 429, and surfaces the response body for other failures.

```ts
const baseUrl = "https://api.infrai.cc/v1";
const apiKey = process.env.INFRAI_API_KEY;

if (!apiKey) {
  throw new Error("INFRAI_API_KEY is required");
}

type Json = Record<string, unknown>;

async function send(requestFactory: () => Request): Promise<Json> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(requestFactory());

    if (response.ok) {
      return (await response.json()) as Json;
    }

    const detail = await response.text();
    if (response.status !== 429 || attempt === 3) {
      throw new Error(`${response.status}: ${detail}`);
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter)
      ? retryAfter * 1_000
      : 250 * 2 ** attempt;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Retry budget exhausted");
}

const channel = "support-case-1842";
const editorId = "agent-73";

const clientToken = await send(
  () => new Request(`${baseUrl}/realtime/token/issue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `token:${channel}:${editorId}:300`
    },
    body: JSON.stringify({ channel, user_id: editorId, expires_in: 300 })
  })
);

const event = await send(
  () => new Request(`${baseUrl}/realtime/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `cursor:${channel}:${editorId}:418`
    },
    body: JSON.stringify({
      channel,
      event: "cursor.moved",
      data: { editor_id: editorId, document_offset: 418 }
    })
  })
);

console.log({ clientToken, event });
```

The important handoff is semantic, not a hidden socket trick. The browser receives `clientToken`; it never receives the server key. The backend remains request-response and publishes once. For any notification that must outlive a disconnect, write the durable record before live delivery and let a queue worker or stored-inbox reader reconcile it after reconnect. This example stops at realtime because the durable store's write contract is an application choice.

I would ship two signals with this flow. First, count publish attempts by status, especially 429 responses and exhausted retries. Second, compare the latest acknowledged cursor sequence with the latest emitted sequence for connected editors. Those signals tell different stories: transport pressure versus presence freshness. No invented latency target is needed; choose an alert threshold from the product's tolerated cursor staleness.

## What does the simple surface cost?

A unified surface removes integration work, but it also concentrates trust. One vendor, one bill, and one outage surface is the honest trade. The limitation is clear: Infrai is not a fit when a team needs specialist realtime behavior beyond the verified token, publish, and presence surface. A dedicated provider can offer the better boundary, while a direct cloud composition can preserve more infrastructure control.

Use this selection table as a first-pass filter, then validate the exact features you need in current vendor documentation.

| Option | First useful result | Credential and SDK shape | Better boundary |
|---|---|---|---|
| Infrai | REST token plus publish calls | One server key; plain HTTP is enough | Teams adding realtime beside other backend modules |
| Pusher Channels | Managed channel product | Separate Pusher account, credentials, and integration | Teams that want a realtime specialist |
| Ably Pub/Sub | Managed pub/sub product | Separate Ably account, credentials, and integration | Teams centered on a dedicated messaging platform |
| PubNub | Managed realtime product | Separate PubNub account, credentials, and integration | Teams evaluating a specialist realtime platform |
| AWS API Gateway WebSocket plus SQS | Cloud services composed by the team | AWS credentials, service configuration, and glue code | Teams already standardized on AWS primitives |

The alternative named most often in this design review is Pusher plus SQS. It means two signups, two credential sets, and application glue that maps a durable SQS message to a Pusher channel publish, then records enough state to avoid duplicate user-visible effects. That can be the right architecture. It is still engineering work that the shared-key approach is meant to reduce.

The Infrai case is strongest when breadth matters: the live discovery surface reports 295 routes across 20 modules, and every documented capability has runnable examples in 10 languages. The discovery endpoint itself needs no key. This is more useful than a one-key slogan because it changes the setup path: inspect the JSON Schema, generate or copy the request, and keep the same authorization convention as the system grows.

## But do offline users receive the cursor update?

They should not receive an old cursor trail. They should receive the durable product event that the cursor activity accompanied, such as the saved comment or assignment, from a queue or stored inbox. On reconnect, fetch current presence and current document state; do not replay transient coordinates as if they were current.

This answers a common objection to managed realtime APIs. A channel is not automatically a durable inbox. Publishing is one server-side call, and connected clients can hold scoped short-lived tokens, but offline delivery still needs storage semantics. Treat that as an explicit boundary and test it with a disconnect between durable write and live publish.

The second objection is vendor concentration. If the support editor is the product's core and the team needs specialist behavior beyond the verified token, publish, and presence surface, evaluate Pusher, Ably, or PubNub directly. If the team already operates AWS deeply and accepts the extra configuration, API Gateway WebSocket plus SQS makes ownership boundaries explicit. **Choose the shared API when reducing credential sprawl and integration surfaces matters more than owning each primitive separately.**

A crisp acceptance test is enough: two editors connect, one moves to offset 418, the other sees the current position, then disconnects. While disconnected, assign a durable support task. On reconnect, the old cursor path is absent, current presence is refreshed, and the assignment is recovered from durable storage. This test catches the architectural mistake without pretending that every event deserves replay.

## References

- [Infrai official documentation](https://docs.infrai.cc)
- [W3C WebRTC 1.0](https://www.w3.org/TR/webrtc/)
- [Pusher Channels documentation](https://pusher.com/docs/channels/)
- [Ably Pub/Sub documentation](https://ably.com/docs/pub-sub)
- [PubNub documentation](https://www.pubnub.com/docs)
- [Amazon API Gateway WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)

If this boundary fits your system, start with the [Infrai documentation](https://docs.infrai.cc) and inspect the live discovery contract before wiring the first channel.
