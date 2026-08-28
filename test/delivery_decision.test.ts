import assert from "node:assert/strict";
import test from "node:test";
import { decideAssetDelivery } from "../src/asset_delivery.js";

const job = { assetId: "asset-7", creatorId: "creator-9", title: "Trailer", jobId: "job-12" } as const;

test("processing work is deferred, while a ready asset targets its creator", () => {
  assert.deepEqual(decideAssetDelivery({ ...job, stage: "processing" }), {
    action: "deferred",
    reason: "job_not_terminal",
  });
  assert.deepEqual(decideAssetDelivery({ ...job, stage: "ready" }), {
    action: "publish",
    channel: "creator:creator-9",
    event: "asset.ready",
    deliveryId: "asset-job:job-12:ready",
    data: { assetId: "asset-7", title: "Trailer", stage: "ready" },
  });
});
