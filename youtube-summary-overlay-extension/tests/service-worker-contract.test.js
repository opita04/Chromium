const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');

function createServiceWorker({ nativeHandler, directKey = '', localGlobalKey = '', fetchHandler = null, storageCallbackOnly = false }) {
  let messageListener = null;
  const nativeMessages = [];
  const fetchCalls = [];
  const sandbox = {
    AbortController,
    URL,
    console,
    clearTimeout,
    setTimeout,
    fetch: async (...args) => {
      fetchCalls.push(args);
      if (!fetchHandler) throw new Error('fetch should not be called in this contract test');
      return fetchHandler(...args);
    },
    OPENROUTER_API_KEY: localGlobalKey,
    chrome: {
      action: {
        onClicked: { addListener() {} },
      },
      runtime: {
        lastError: null,
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
        sendNativeMessage(_host, message, callback) {
          nativeMessages.push(message);
          Promise.resolve()
            .then(() => nativeHandler(message))
            .then((response) => {
              sandbox.chrome.runtime.lastError = null;
              callback(response);
            })
            .catch((error) => {
              sandbox.chrome.runtime.lastError = { message: error.message };
              callback(null);
              sandbox.chrome.runtime.lastError = null;
            });
        },
        getURL: (assetPath) => `chrome-extension://test/${assetPath}`,
      },
      storage: {
        local: {
          get(keys, callback) {
            const keyList = Array.isArray(keys) ? keys : [keys];
            const data = {};
            for (const key of keyList) {
              if (directKey && (key === 'openRouterApiKey' || key === 'OPENROUTER_API_KEY')) {
                data[key] = directKey;
              }
            }
            if (storageCallbackOnly) {
              if (callback) callback(data);
              return undefined;
            }
            return Promise.resolve(data);
          },
        },
      },
      tabs: {
        query: async () => [],
        sendMessage: async () => ({ ok: true }),
        create() {},
        onUpdated: {
          addListener() {},
          removeListener() {},
        },
      },
      scripting: {
        executeScript: async () => {},
      },
    },
  };

  vm.runInNewContext(scriptSource, sandbox, {
    filename: path.join(root, 'background/service-worker.js'),
  });

  return {
    fetchCalls,
    nativeMessages,
    send(message) {
      return new Promise((resolve) => {
        messageListener(message, {}, resolve);
      });
    },
  };
}

async function testSummarizePrefersReachableNativeHostEvenWithDirectKey() {
  const worker = createServiceWorker({
    directKey: 'sk-test-storage-key',
    nativeHandler: async (message) => {
      assert.equal(message.type, 'summarizeAndSave');
      return {
        ok: true,
        markdown: '# Native Summary',
        path: '/tmp/native.md',
        category: 'General',
        model: message.model,
      };
    },
  });

  const result = await worker.send({
    type: 'SUMMARIZE_AND_SAVE',
    video: { videoId: 'abc123', title: 'Example', transcript: 'Long transcript '.repeat(20) },
    model: 'mistralai/mistral-small-24b-instruct-2501',
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, '/tmp/native.md');
  assert.deepEqual(worker.nativeMessages.map((message) => message.type), ['summarizeAndSave']);
  assert.equal(worker.fetchCalls.length, 0);
}

async function testSummarizeFallsBackToDirectWhenNativeUnavailable() {
  const worker = createServiceWorker({
    directKey: 'sk-test-storage-key',
    nativeHandler: async () => {
      throw new Error('Native host unavailable');
    },
    fetchHandler: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer sk-test-storage-key');
      assert.equal(options.headers['HTTP-Referer'], 'https://www.youtube.com/watch?v=abc123');
      assert.doesNotMatch(options.body, /token=secret|#frag/);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '# Direct Summary' } }],
          usage: { total_tokens: 10 },
        }),
      };
    },
  });

  const result = await worker.send({
    type: 'SUMMARIZE_AND_SAVE',
    video: {
      videoId: 'abc123',
      title: 'Example',
      url: 'https://www.youtube.com/watch?v=abc123&token=secret#frag',
      transcript: 'Long transcript '.repeat(20),
    },
    model: 'mistralai/mistral-small-24b-instruct-2501',
  });
  assert.equal(result.ok, true);
  assert.equal(result.markdown, '# Direct Summary');
  assert.equal(result.path, '');
  assert.equal(result.saveMode, 'browser-direct');
  assert.equal(result.nativeSaveUnavailable, true);
  assert.deepEqual(worker.nativeMessages.map((message) => message.type), ['summarizeAndSave']);
  assert.equal(worker.fetchCalls.length, 1);
}

async function testFindExistingPrefersReachableNativeHost() {
  const worker = createServiceWorker({
    nativeHandler: async (message) => {
      assert.equal(message.type, 'findExistingSummary');
      return {
        ok: true,
        found: true,
        markdown: '# Existing',
        path: '/tmp/existing.md',
        category: 'General',
      };
    },
  });

  const result = await worker.send({ type: 'FIND_EXISTING_SUMMARY', videoId: 'abc123' });
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.markdown, '# Existing');
  assert.deepEqual(worker.nativeMessages.map((message) => message.type), ['findExistingSummary']);
}

async function testSaveMarkdownPrefersReachableNativeHost() {
  const worker = createServiceWorker({
    nativeHandler: async (message) => {
      assert.equal(message.type, 'saveMarkdown');
      return {
        ok: true,
        markdown: message.markdown,
        path: '/tmp/saved.md',
        category: message.category,
      };
    },
  });

  const result = await worker.send({
    type: 'SAVE_MARKDOWN',
    video: { videoId: 'abc123', title: 'Example' },
    markdown: '# Saved',
    category: 'Coding',
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, '/tmp/saved.md');
  assert.deepEqual(worker.nativeMessages.map((message) => message.type), ['saveMarkdown']);
}

async function testFindExistingFallsBackWhenNativeUnavailable() {
  const worker = createServiceWorker({
    directKey: 'sk-test-storage-key',
    nativeHandler: async () => {
      throw new Error('Native host unavailable');
    },
  });

  const result = await worker.send({ type: 'FIND_EXISTING_SUMMARY', videoId: 'abc123' });
  assert.equal(result.ok, true);
  assert.equal(result.found, false);
  assert.equal(result.saveMode, 'browser-direct');
}

async function testDirectKeyLookupSupportsCallbackOnlyStorage() {
  const worker = createServiceWorker({
    directKey: 'sk-test-storage-key',
    storageCallbackOnly: true,
    nativeHandler: async () => {
      throw new Error('Native host unavailable');
    },
    fetchHandler: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '# Callback Storage Summary' } }],
      }),
    }),
  });

  const result = await worker.send({
    type: 'SUMMARIZE_AND_SAVE',
    video: {
      videoId: 'abc123',
      title: 'Example',
      url: 'https://www.youtube.com/watch?v=abc123',
      transcript: 'Long transcript '.repeat(20),
    },
    model: 'mistralai/mistral-small-24b-instruct-2501',
  });
  assert.equal(result.ok, true);
  assert.equal(result.markdown, '# Callback Storage Summary');
  assert.equal(result.saveMode, 'browser-direct');
}

async function testDirectKeyLookupSupportsLocalSecretsGlobal() {
  const worker = createServiceWorker({
    localGlobalKey: 'sk-test-local-secret',
    nativeHandler: async () => {
      throw new Error('Native host unavailable');
    },
    fetchHandler: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer sk-test-local-secret');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '# Local Secret Summary' } }],
        }),
      };
    },
  });

  const result = await worker.send({
    type: 'SUMMARIZE_AND_SAVE',
    video: {
      videoId: 'abc123',
      title: 'Example',
      url: 'https://www.youtube.com/watch?v=abc123',
      transcript: 'Long transcript '.repeat(20),
    },
    model: 'mistralai/mistral-small-24b-instruct-2501',
  });
  assert.equal(result.ok, true);
  assert.equal(result.markdown, '# Local Secret Summary');
  assert.equal(result.saveMode, 'browser-direct');
}

(async () => {
  await testSummarizePrefersReachableNativeHostEvenWithDirectKey();
  await testSummarizeFallsBackToDirectWhenNativeUnavailable();
  await testFindExistingPrefersReachableNativeHost();
  await testSaveMarkdownPrefersReachableNativeHost();
  await testFindExistingFallsBackWhenNativeUnavailable();
  await testDirectKeyLookupSupportsCallbackOnlyStorage();
  await testDirectKeyLookupSupportsLocalSecretsGlobal();
  console.log('service-worker-contract.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
