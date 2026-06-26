#!/usr/bin/env node
const { findExistingSummary, saveMarkdown, summarizeAndSave } = require('./summarizer');

function readNativeMessage(input) {
  if (input.length < 4) return null;
  const length = input.readUInt32LE(0);
  if (input.length < 4 + length) return null;
  return JSON.parse(input.subarray(4, 4 + length).toString('utf8'));
}

function writeNativeMessage(payload, callback = () => {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]), callback);
}

async function handleMessage(message) {
  if (message?.type === 'summarizeAndSave') {
    return summarizeAndSave({ video: message.video, model: message.model });
  }
  if (message?.type === 'saveMarkdown') {
    if (!message.markdown) throw new Error('No Markdown provided.');
    return saveMarkdown({ video: message.video, markdown: message.markdown, category: message.category, previousPath: message.previousPath });
  }
  if (message?.type === 'findExistingSummary') {
    return findExistingSummary({ videoId: message.videoId });
  }
  throw new Error(`Unknown native message type: ${message?.type || 'missing'}`);
}

function main() {
  const chunks = [];
  process.stdin.on('data', async (chunk) => {
    chunks.push(chunk);
    const message = readNativeMessage(Buffer.concat(chunks));
    if (!message) return;

    try {
      const result = await handleMessage(message);
      writeNativeMessage(result, () => process.exit(0));
    } catch (error) {
      writeNativeMessage({ ok: false, error: error.message }, () => process.exit(0));
    }
  });
}

main();
