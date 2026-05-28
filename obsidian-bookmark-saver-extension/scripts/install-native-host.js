#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOST_NAME = "com.opita.shopping_page_saver";
const EXTENSION_ID = "edodmoleijepfafmlkhafodnpnjhbeol";
const ROOT = path.resolve(__dirname, "..");
const HOST_PATH = path.join(ROOT, "run-native-host.sh");
const NODE_PATH = "/opt/homebrew/bin/node";

if (!fs.existsSync(NODE_PATH)) {
  throw new Error(`Expected Node at ${NODE_PATH}. Update run-native-host.sh if Node moved.`);
}

const hostManifest = {
  name: HOST_NAME,
  description: "Native writer for Obsidian Bookmark Saver.",
  path: HOST_PATH,
  type: "stdio",
  allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
};

const nativeHostDirs = [
  "Library/Application Support/Google/Chrome/NativeMessagingHosts",
  "Library/Application Support/Chromium/NativeMessagingHosts",
  "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
  "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
].map((relativePath) => path.join(os.homedir(), relativePath));

for (const dir of nativeHostDirs) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${HOST_NAME}.json`),
    `${JSON.stringify(hostManifest, null, 2)}\n`,
    "utf8",
  );
}

fs.chmodSync(HOST_PATH, 0o755);

console.log(`Installed native host ${HOST_NAME}`);
console.log(`Allowed extension id: ${EXTENSION_ID}`);
console.log(`Vault target: /Users/opita/Documents/Obsidian/Personal-Notes/30 Knowledge/Bookmarks`);
