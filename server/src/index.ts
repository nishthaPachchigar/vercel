import "dotenv/config";
import express from "express";
import cors from "cors";
import { simpleGit } from "simple-git";
import { generate } from "./utils.js";
import { Redis } from "ioredis";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import AWS from "aws-sdk";
import { exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputBase = process.env.OUTPUT_DIR || path.join(__dirname, "output");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const publisher = new Redis(redisUrl);
const subscriber = new Redis(redisUrl);

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: process.env.AWS_REGION!,
});
const bucketName = process.env.BUCKET_NAME!;

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ─── S3 Helpers ─────────────────────────────────────────────

function getAllFilesDir(folderPath: string): string[] {
  let response: string[] = [];
  const allFilesAndFolders = fs.readdirSync(folderPath);
  allFilesAndFolders.forEach((file) => {
    const fullFilePath = path.join(folderPath, file);
    if (fs.statSync(fullFilePath).isDirectory()) {
      response = response.concat(getAllFilesDir(fullFilePath));
    } else {
      response.push(fullFilePath);
    }
  });
  return response;
}

async function uploadFileToS3(fileName: string, localFilePath: string) {
  const fileContent = fs.readFileSync(localFilePath);
  await s3.upload({ Body: fileContent, Bucket: bucketName, Key: fileName }).promise();
}

async function downloadS3Folder(prefix: string) {
  const allFiles = await s3.listObjectsV2({ Bucket: bucketName, Prefix: prefix }).promise();
  const allPromises =
    allFiles.Contents?.map(async ({ Key }) => {
      return new Promise<void>(async (resolve) => {
        if (!Key) {
          resolve();
          return;
        }
        const finalOutputPath = path.join(outputBase, Key);
        const dirName = path.dirname(finalOutputPath);
        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true });
        }
        const outputFile = fs.createWriteStream(finalOutputPath);
        s3.getObject({ Bucket: bucketName, Key }).createReadStream().pipe(outputFile).on("finish", () => {
          resolve();
        });
      });
    }) || [];
  await Promise.all(allPromises);
}

function copyFinalDist(id: string) {
  const folderPath = path.join(outputBase, id, "dist");
  const allFiles = getAllFilesDir(folderPath);
  allFiles.forEach((file) => {
    const s3Key = "dist/" + id + "/" + file.slice(folderPath.length + 1).replace(/\\/g, "/");
    uploadFileToS3(s3Key, file);
  });
}

function copyOutputFolder(id: string) {
  const folderPath = path.join(outputBase, id);
  const allFiles = getAllFilesDir(folderPath);
  allFiles.forEach((file) => {
    const s3Key = "dist/" + id + "/" + file.slice(folderPath.length + 1).replace(/\\/g, "/");
    uploadFileToS3(s3Key, file);
  });
}

function buildProject(id: string) {
  return new Promise<void>((resolve) => {
    const child = exec("cd " + path.join(outputBase, id) + " && npm install && npm run build");
    child.stdout?.on("data", (data) => console.log("build stdout: " + data));
    child.stderr?.on("data", (data) => console.log("build stderr: " + data));
    child.on("close", () => resolve());
  });
}

// ─── Deploy Worker (background) ─────────────────────────────

async function startWorker() {
  console.log("Worker started, waiting for jobs...");
  while (true) {
    try {
      const result = await subscriber.brpop("build-queue", 0);
      if (result) {
        const id = result[1];
        console.log("Processing deploy: " + id);

        await downloadS3Folder("output/" + id);
        await buildProject(id);

        const distPath = path.join(outputBase, id, "dist");
        if (fs.existsSync(distPath)) {
          copyFinalDist(id);
        } else {
          copyOutputFolder(id);
        }

        publisher.hset("status", id, "deployed");
        console.log("Deployed: " + id);
      }
    } catch (err) {
      console.error("Worker error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ─── Express Server ─────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.post("/deploy", async (req, res) => {
  const repoUrl = req.body.repoUrl;
  if (!repoUrl) {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }
  const id = generate();
  try {
    await simpleGit().clone(repoUrl, path.join(outputBase, id));

    const files = getAllFilesDir(path.join(outputBase, id));
    await Promise.all(
      files.map((file) => {
        const s3Key = file.slice(outputBase.length + 1).replace(/\\/g, "/");
        return uploadFileToS3(s3Key, file);
      })
    );

    publisher.lpush("build-queue", id);
    publisher.hset("status", id, "uploaded");

    res.json({ id });
  } catch (err: any) {
    console.error("Deploy error:", err);
    res.status(500).json({ error: err.message || "Deploy failed" });
  }
});

app.get("/status", async (req, res) => {
  const id = req.query.id;
  const response = await subscriber.hget("status", id as string);
  res.json({ status: response });
});

// Request Handler - serves deployed sites
app.use(async (req, res) => {
  const host = req.hostname;
  const pathParts = req.path.split("/").filter(Boolean);

  let id = "";
  let filePath = "/index.html";

  const firstSegment = pathParts[0] || "";

  // Skip /deploy and /status routes
  if (firstSegment === "deploy" || firstSegment === "status") {
    return;
  }

  if (host.split(".")[0] !== "localhost" && host.split(".")[0] !== "127") {
    id = host.split(".")[0] ?? "";
    filePath = req.path;
  } else if (pathParts.length > 0) {
    id = pathParts[0]!;
    filePath = "/" + pathParts.slice(1).join("/");
  }

  if (!filePath || filePath === "/") {
    filePath = "/index.html";
  }

  const s3Key = "dist/" + id + filePath;

  try {
    const data = await s3.getObject({ Bucket: bucketName, Key: s3Key }).promise();
    const ext = s3Key.substring(s3Key.lastIndexOf("."));
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.set("Content-Type", contentType);
    res.send(data.Body);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
  startWorker();
});
