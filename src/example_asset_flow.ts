export {};

const response = await fetch("http://localhost:3000/asset-jobs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    assetId: "asset-1080p",
    creatorId: "creator-42",
    title: "Studio interview",
    stage: "ready",
    jobId: "transcode-731",
  }),
});

console.log(await response.json());
