/**
 * Stamps NEXT_PUBLIC_BUILD_ID with the current git commit sha (if available)
 * or a timestamp, so the client can detect when a newer deploy is live.
 * Writes .env.production.local, which `next build` picks up automatically.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getBuildId() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return String(Date.now());
  }
}

const buildId = getBuildId();
const envPath = path.join(__dirname, "..", ".env.production.local");
const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
const filtered = existing
  .split("\n")
  .filter((line) => line && !line.startsWith("NEXT_PUBLIC_BUILD_ID="))
  .join("\n");
fs.writeFileSync(envPath, `${filtered}\nNEXT_PUBLIC_BUILD_ID=${buildId}\n`);
console.log(`[set-build-id] NEXT_PUBLIC_BUILD_ID=${buildId}`);
