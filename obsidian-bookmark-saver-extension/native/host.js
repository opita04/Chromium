#!/usr/bin/env node

const { appendBookmarkPayload, DEFAULT_BOOKMARKS_DIR } = require("./writer");

function readNativeMessage(input) {
  if (input.length < 4) {
    return null;
  }

  const length = input.readUInt32LE(0);
  if (input.length < 4 + length) {
    return null;
  }

  const body = input.subarray(4, 4 + length).toString("utf8");
  return JSON.parse(body);
}

function writeNativeMessage(payload, callback = () => {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]), callback);
}

function main() {
  const chunks = [];

  process.stdin.on("data", (chunk) => {
    chunks.push(chunk);
    const buffered = Buffer.concat(chunks);
    const message = readNativeMessage(buffered);
    if (!message) {
      return;
    }

    try {
      const result = appendBookmarkPayload(message, process.env.BOOKMARKS_MD_DIR || DEFAULT_BOOKMARKS_DIR);
      writeNativeMessage(result, () => process.exit(0));
    } catch (error) {
      writeNativeMessage({ ok: false, error: error.message }, () => process.exit(0));
    }
  });
}

main();
