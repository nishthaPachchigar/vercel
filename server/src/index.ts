import "dotenv/config";
import express from "express";
import cors from "cors";
import { simpleGit } from "simple-git";
import AWS from "aws-sdk";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputBase = process.env.OUTPUT_DIR || path.join(__dirname, "output");

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

// ─── Helpers ────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

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

// Status is stored in S3: status/{id} = "uploaded" | "deployed" | "building"

async function setStatus(id: string, status: string) {
  await s3.upload({ Body: status, Bucket: bucketName, Key: "status/" + id }).promise();
}

async function getStatus(id: string): Promise<string | null> {
  try {
    const data = await s3.getObject({ Bucket: bucketName, Key: "status/" + id }).promise();
    return data.Body?.toString() || null;
  } catch {
    return null;
  }
}

// ─── Background Worker: polls S3 for pending jobs ───────────

async function startWorker() {
  console.log("Worker started, polling S3 for jobs...");
  while (true) {
    try {
      const allFiles = await s3.listObjectsV2({ Bucket: bucketName, Prefix: "status/" }).promise();
      const pendingJobs = allFiles.Contents?.filter((f) => f.Key?.startsWith("status/") && f.Size === 0) || [];

      for (const job of pendingJobs) {
        const id = job.Key?.replace("status/", "");
        if (!id) continue;

        const currentStatus = await getStatus(id);
        if (currentStatus !== "uploaded") continue;

        console.log("Processing deploy: " + id);
        await setStatus(id, "building");

        await downloadS3Folder("output/" + id);
        await buildProject(id);

        const distPath = path.join(outputBase, id, "dist");
        if (fs.existsSync(distPath)) {
          copyFinalDist(id);
        } else {
          copyOutputFolder(id);
        }

        await setStatus(id, "deployed");
        console.log("Deployed: " + id);
      }
    } catch (err) {
      console.error("Worker error:", err);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ─── Express Server ─────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../public"), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

app.post("/deploy", async (req, res) => {
  const repoUrl = req.body.repoUrl;
  if (!repoUrl) {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }
  const id = generateId();
  try {
    fs.mkdirSync(path.join(outputBase, id), { recursive: true });
    await simpleGit().clone(repoUrl, path.join(outputBase, id));

    const files = getAllFilesDir(path.join(outputBase, id));
    await Promise.all(
      files.map((file) => {
        const s3Key = "output/" + id + "/" + file.slice(outputBase.length + id.length + 2).replace(/\\/g, "/");
        return uploadFileToS3(s3Key, file);
      })
    );

    await setStatus(id, "uploaded");

    res.json({ id });
  } catch (err: any) {
    console.error("Deploy error:", err);
    res.status(500).json({ error: err.message || "Deploy failed" });
  }
});

app.get("/status", async (req, res) => {
  const id = req.query.id;
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const status = await getStatus(id as string);
  res.json({ status: status || "not_found" });
});

// Request Handler - serves deployed sites from S3
app.use(async (req, res) => {
  const host = req.hostname;
  const pathParts = req.path.split("/").filter(Boolean);

  let id = "";
  let filePath = "/index.html";

  const firstSegment = pathParts[0] || "";

  // Check if first segment looks like a deployed ID (not a static file, not an API route)
  const isDeployedId = firstSegment && firstSegment !== "deploy" && firstSegment !== "status" &&
    !firstSegment.includes(".") && firstSegment !== "assets";

  if (isDeployedId) {
    id = firstSegment;
    filePath = "/" + pathParts.slice(1).join("/");
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
      return;
    } catch {
      // fall through to frontend
    }
  }

  // Serve frontend SPA
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
  startWorker();
});
