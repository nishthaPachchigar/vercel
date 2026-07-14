import AWS from "aws-sdk";
import fs from "fs";
import path from "path";
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

export async function downloadS3Folder(prefix: string) {
  const allFiles = await s3.listObjectsV2({
    Bucket: bucketName,
    Prefix: prefix,
  }).promise();

  const allPromises = allFiles.Contents?.map(async ({ Key }) => {
    return new Promise<void>(async (resolve) => {
      if (!Key) {
        resolve();
        return;
      }
      const finalOutputPath = path.join(outputBase, Key);
      const outputFile = fs.createWriteStream(finalOutputPath);
      const dirName = path.dirname(finalOutputPath);
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }
      s3.getObject({
        Bucket: bucketName,
        Key,
      }).createReadStream().pipe(outputFile).on("finish", () => {
        resolve();
      });
    });
  }) || [];

  await Promise.all(allPromises);
}

export function copyFinalDist(id: string) {
  const folderPath = path.join(outputBase, id, "dist");
  const allFiles = getAllFiles(folderPath);
  allFiles.forEach((file) => {
    const s3Key = `dist/${id}/` + file.slice(folderPath.length + 1).replace(/\\/g, "/");
    uploadFile(s3Key, file);
  });
}

export function copyOutputFolder(id: string) {
  const folderPath = path.join(outputBase, id);
  const allFiles = getAllFiles(folderPath);
  allFiles.forEach((file) => {
    const s3Key = `dist/${id}/` + file.slice(folderPath.length + 1).replace(/\\/g, "/");
    uploadFile(s3Key, file);
  });
}

const getAllFiles = (folderPath: string): string[] => {
  let response: string[] = [];
  const allFilesAndFolders = fs.readdirSync(folderPath);
  allFilesAndFolders.forEach((file) => {
    const fullFilePath = path.join(folderPath, file);
    if (fs.statSync(fullFilePath).isDirectory()) {
      response = response.concat(getAllFiles(fullFilePath));
    } else {
      response.push(fullFilePath);
    }
  });
  return response;
};

const uploadFile = async (fileName: string, localFilePath: string) => {
  const fileContent = fs.readFileSync(localFilePath);
  await s3.upload({
    Body: fileContent,
    Bucket: bucketName,
    Key: fileName,
  }).promise();
};

export async function uploadDirectoryToS3(localDir: string, s3Prefix: string) {
  const allFiles = getAllFiles(localDir);
  await Promise.all(
    allFiles.map((filePath) => {
      const s3Key = s3Prefix + "/" + path.relative(localDir, filePath).replace(/\\/g, "/");
      return uploadFile(s3Key, filePath);
    })
  );
}
