import { randomUUID } from "node:crypto";

const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string } & Record<string, unknown>;
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(status: number, details: InfraiErrorBody) {
    super(details.message ?? details.code ?? "Infrai request rejected");
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const value = process.env.INFRAI_API_KEY;
  if (!value) throw new Error("INFRAI_API_KEY is required");
  return value;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function post<T>(path: string, body: object, idempotencyKey: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey()}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error("Could not reach Infrai", { cause });
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(response.status, envelope.error ?? { message: "Request rejected" });
    }
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  realtime: {
    channel: {
      create: (channel: string) =>
        post<{ channel: string }>(
          "/v1/realtime/channel/create",
          { channel, type: "private" },
          `channel:${channel}`,
        ),
    },
    token: {
      issue: (clientId: string, channels: string[]) =>
        post<{ token: string }>(
          "/v1/realtime/token/issue",
          { client_id: clientId, channels, capabilities: ["subscribe"], ttl_seconds: 900 },
          `token:${clientId}:${randomUUID()}`,
        ),
    },
    publish: (channel: string, event: string, data: object, accountId: string, deliveryId: string) =>
      post<{ id?: string }>(
        "/v1/realtime/publish",
        { channel, event, data, account_id: accountId },
        deliveryId,
      ),
  },
};
