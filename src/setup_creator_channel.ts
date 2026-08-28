import { infrai } from "./infrai_realtime.js";

const creatorId = process.argv[2];
if (!creatorId) throw new Error("Run with a creator ID: npm run setup -- creator-42");

const channel = `creator:${creatorId}`;
const created = await infrai.realtime.channel.create(channel);
console.log(JSON.stringify({ channel, created }, null, 2));
