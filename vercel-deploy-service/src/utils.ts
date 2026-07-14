import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputBase = process.env.OUTPUT_DIR || path.join(__dirname, "output");

export function buildProject(id: string) {
  return new Promise((resolve) => {
    const child = exec(
      `cd ${path.join(outputBase, id)} && npm install && npm run build`
    );

    child.stdout?.on("data", (data) => {
      console.log("stdout: " + data);
    });
    child.stderr?.on("data", (data) => {
      console.log("stderr: " + data);
    });

    child.on("close", () => {
      resolve("");
    });
  });
}
