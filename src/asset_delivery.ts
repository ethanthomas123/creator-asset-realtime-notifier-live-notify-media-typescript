import { z } from "zod";

export const assetJobSchema = z.object({
  assetId: z.string().min(1),
  creatorId: z.string().min(1),
  title: z.string().min(1),
  stage: z.enum(["ingested", "processing", "ready", "failed"]),
  jobId: z.string().min(1),
});

export type AssetJob = z.infer<typeof assetJobSchema>;

export type DeliveryDecision =
  | { action: "deferred"; reason: "job_not_terminal" }
  | {
      action: "publish";
      channel: string;
      event: "asset.ready" | "asset.failed";
      deliveryId: string;
      data: { assetId: string; title: string; stage: "ready" | "failed" };
    };

export function decideAssetDelivery(job: AssetJob): DeliveryDecision {
  if (job.stage !== "ready" && job.stage !== "failed") {
    return { action: "deferred", reason: "job_not_terminal" };
  }
  return {
    action: "publish",
    channel: `creator:${job.creatorId}`,
    event: `asset.${job.stage}`,
    deliveryId: `asset-job:${job.jobId}:${job.stage}`,
    data: { assetId: job.assetId, title: job.title, stage: job.stage },
  };
}
