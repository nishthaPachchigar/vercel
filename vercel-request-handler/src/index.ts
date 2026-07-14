import "dotenv/config";
import express from "express";
import AWS from "aws-sdk";

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

const app = express();

app.use(async (req, res) => {
  const host = req.hostname;
  const pathParts = req.path.split("/").filter(Boolean);

  let id = "";
  let filePath = "/index.html";

  if (host.split(".")[0] !== "localhost") {
    id = host.split(".")[0] ?? "";
    filePath = req.path;
  } else if (pathParts.length > 0) {
    id = pathParts[0]!;
    filePath = "/" + pathParts.slice(1).join("/");
  }

  if (!filePath || filePath === "/") {
    filePath = "/index.html";
  }

  const s3Key = `dist/${id}${filePath}`;
  console.log(`Request: ${req.method} ${req.path} → S3 Key: ${s3Key} (id: ${id})`);

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

app.listen(3001, () => {
  console.log("Request handler running on port 3001");
});
