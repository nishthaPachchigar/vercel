import "dotenv/config";
import express from "express";
import cors from "cors";
import { simpleGit } from "simple-git";
import { generate } from "./utils.js";
import { getAllFiles } from "./file.js";
import { uploadFile } from "./s3.js";
import { Redis } from "ioredis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publisher = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");
const subscriber = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

const outputBase = process.env.OUTPUT_DIR || path.join(__dirname, "output");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/deploy", async (req, res) => {
  const repoUrl = req.body.repoUrl;
  const id = generate();
  await simpleGit().clone(repoUrl, path.join(outputBase, id));

  const files = getAllFiles(path.join(outputBase, id));

  await Promise.all(
    files.map((file) => {
      const s3Key = file.slice(outputBase.length + 1).replace(/\\/g, "/");
      return uploadFile(s3Key, file);
    })
  );

  publisher.lpush("build-queue", id);
  publisher.hset("status", id, "uploaded");

  res.json({ id });
});

app.get("/status", async (req, res) => {
  const id = req.query.id;
  const response = await subscriber.hget("status", id as string);
  res.json({ status: response });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
