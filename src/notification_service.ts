import { createServer } from "node:http";
import { z } from "zod";
import { assetJobSchema, decideAssetDelivery } from "./asset_delivery.js";
import { InfraiError, infrai } from "./infrai_realtime.js";

const tokenRequestSchema = z.object({ creatorId: z.string().min(1), clientId: z.string().min(1) });

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/asset-jobs") {
      const job = assetJobSchema.parse(await readJson(request));
      const decision = decideAssetDelivery(job);
      if (decision.action === "deferred") return send(response, 202, decision);

      const receipt = await infrai.realtime.publish(
        decision.channel,
        decision.event,
        decision.data,
        job.creatorId,
        decision.deliveryId,
      );
      return send(response, 200, { action: "published", event: decision.event, receipt });
    }

    if (request.method === "POST" && request.url === "/realtime-token") {
      const input = tokenRequestSchema.parse(await readJson(request));
      const channel = `creator:${input.creatorId}`;
      const token = await infrai.realtime.token.issue(input.clientId, [channel]);
      return send(response, 200, { channel, ...token });
    }

    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof InfraiError) return send(response, error.status < 500 ? error.status : 502, { error: error.message });
    console.error(error);
    return send(response, 500, { error: "Request could not be completed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Asset notification service listening on http://localhost:${port}`));
