import "dotenv/config";
import { Redis } from "ioredis";
import { copyFinalDist, copyOutputFolder, downloadS3Folder } from "./aws.js";
import { buildProject } from "./utils.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const subscriber = new Redis(redisHost);
const publisher = new Redis(redisHost);

async function main() {
  console.log("vercel-deploy-service started, waiting for jobs...");

  while (true) {
    const result = await subscriber.brpop("build-queue", 0);
    if (result) {
      const id = result[1];
      console.log(`Processing deploy: ${id}`);

      await downloadS3Folder(`output/${id}`);
      await buildProject(id);

      const distPath = path.join(__dirname, `output/${id}/dist`);
      if (fs.existsSync(distPath)) {
        copyFinalDist(id);
      } else {
        copyOutputFolder(id);
      }

      publisher.hset("status", id, "deployed");

      console.log(`Deployed: ${id}`);
    }
  }
}

main();
