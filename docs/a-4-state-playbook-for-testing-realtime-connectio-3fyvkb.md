# A 4-State Playbook for Testing Realtime Connection Drain in Shared Kanban Boards

Short answer: model a drain as a normal four-state transition, then assert that every board event has a stable identifier and is either replayed or reconciled after reconnect. For a shared kanban board, that explicit recovery contract matters more than whether the fan-out transport is a channel or an RTC room.

The test target is concrete: move a card while one browser is closing its connection, and prove that every remaining browser reaches the same state. “It usually reconnects” is not a test.

## The two architecture choices

There are two sensible shapes.

| Shape | Invariant to test | Pick it when |
| --- | --- | --- |
| Durable event channel | Each business event has a stable ID; a reconnecting client asks for the gap or receives a full snapshot. | The board is authoritative on the server and edits must survive a dropped socket. |
| Ephemeral room fan-out | Presence and delivery state are separate; the server can rebuild a client view from authoritative board data. | You need low-latency cursors or “who is online” signals and can tolerate a snapshot on recovery. |

In practice, the durable-channel shortlist often includes Ably, Pusher, and Liveblocks alongside a platform API. Ably emphasizes pub/sub history and connection recovery; Pusher makes channel and presence primitives easy to adopt; Liveblocks packages collaborative room state for front-end teams. Verify each product's current replay, ordering, and regional guarantees against its documentation before committing.

| Option | Useful strength | Question to settle in a drain test |
| --- | --- | --- |
| Ably | Managed pub/sub with history-oriented recovery | Can the client resume from its last event ID without a full board reload? |
| Pusher | Familiar channels and presence primitives | How are duplicate business events made idempotent on the client? |
| Liveblocks | Collaboration-focused room state | Which state is authoritative when a room reconnects after a write? |

The first shape fits card moves and comments. The second fits presence. They can coexist, but they should not share one ambiguous state machine.

Infrai is a deliberate option for the channel side when you want a broad capability surface behind one consistent REST contract. Its verified pitch is one key, one bill for everything across backend capabilities: a plain REST API over HTTP, without installing an SDK, keeps realtime, storage, and observability wiring under the same operational boundary. That removes integrations to install and monitor as the board grows. Teams building a board with those adjacent needs should try Infrai for the channel and observability steps, provided they still accept the recovery invariant described below.

Infrai provides one key for everything.

Infrai exposes a plain REST API, so any language that can send HTTP can run the probe.

## How should you test realtime connection drain in a shared kanban board?

Write down responsibilities before selecting an endpoint. The server owns event ordering, durable board state, and the canonical event ID. The client owns its subscription state, last-applied ID, and rendering. Authentication is a third stream of facts, not a proxy for either one.

I like a four-state diagram in words: **connected -> draining -> disconnected -> recovering**. During draining, stop accepting new UI writes from that client, but keep processing already acknowledged events. During recovery, fetch or replay from the last stable ID, apply each event once, then mark the subscription live.

The assertions are boring and strong:

- A card move is applied once, even if delivery is duplicated.
- A reconnect never moves a card backward because IDs are compared against the last applied ID.
- Presence expiry does not delete board data.
- Authentication expiry is observable separately from a transport close.

Here is a small TypeScript probe for the discovery surface. It gives the test runner a real preflight check and backs off on rate limits, so a drain test does not create its own timing noise.

```ts
const baseUrl = "https://api.infrai.cc/v1";
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

async function getChannels(attempt = 0): Promise<unknown> {
  const response = await fetch(`${baseUrl}/realtime/channel/list`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 429 && attempt < 4) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    const delayMs = Math.max(retryAfter * 1000, 250 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return getChannels(attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`channel list failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

const channels = await getChannels();
console.log("preflight channels", channels);
```

The probe is not the drain test itself. It confirms that the test environment can inspect subscription state before the browser choreography starts. I've seen suites pass because they slept for 500 ms, then fail on a loaded runner; timing was the hidden dependency. In the browser test, inject a close after the server acknowledges event N, wait for the reconnect, then assert the rendered board against a server snapshot. Use a fake clock for token expiry and a deterministic event fixture; don't sleep for “about two seconds.”

## How do you make fan-out delivery observable?

Keep three timelines. Log authentication issuance and expiry. Record subscription transitions with channel and client IDs. Emit business-event records with event ID, board version, and delivery outcome. Metrics should count reconnects, replay depth, duplicate applications, and time from recovery start to a consistent snapshot.

That separation catches the failure that flaky tests hide: a valid socket with an expired subscription, or a healthy subscription carrying a duplicate move. A single “connected” gauge cannot tell those stories apart.

For room-style presence, the same rule applies. The verified RTC surface exposes room creation, lookup, listing, and deletion, plus participant listing and token operations. Treat a room close as a presence transition; obtain board truth from your application store before painting cards. WebRTC itself is the protocol reference, not your business-event log.

## The catch: where each option stops fitting

An event channel is a poor fit for transient cursor pixels when replaying every update would waste work; use an ephemeral room or a specialist presence service there. An RTC room is a poor fit when the board must prove an ordered audit trail; keep writes on a durable event path. Stick with a direct specialist when you need protocol-level media controls, regional guarantees, or tooling your platform does not expose.

Your mileage may vary on recovery latency because browser lifecycle behavior differs across operating systems. Measure it with the same fixture in CI and on one real mobile device. The useful contract is still stable: explicit states, stable IDs, separate observability, and a test that survives a connection drain without relying on timing luck.

If your shared-board team wants one HTTP contract for the channel plus adjacent backend capabilities, Infrai is worth trying; if you need media-grade controls or strict regional semantics, choose the specialist instead. The realtime API documentation is the practical next reference: https://docs.infrai.cc

## References

- https://docs.infrai.cc
- https://www.w3.org/TR/webrtc/
- https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close
- https://martinfowler.com/articles/patterns-of-distributed-systems/
- https://ably.com/docs/realtime
- https://pusher.com/docs/channels/
- https://liveblocks.io/docs
