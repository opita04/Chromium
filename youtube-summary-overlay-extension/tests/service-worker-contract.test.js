const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
const contentScriptSource = fs.readFileSync(path.join(root, 'content/youtube-transcript.js'), 'utf8');

function createServiceWorker({ fetchHandler, activeTab = null, firstTabMessageRejects = false, initialStorage = {}, chromeRuntimeId = 'lbbncpgjnoffnhihjnomphmabaieaaoo', browserRuntimeId = '' }) {
  let messageListener = null;
  let actionClickListener = null;
  let tabMessageCount = 0;
  const fetchCalls = [];
  const executedScripts = [];
  const storageData = { ...initialStorage };
  const sandbox = {
    process, AbortController, URL, console, clearTimeout, setTimeout,
    fetch: async (...args) => { fetchCalls.push(args); if (!fetchHandler) throw new Error('fetch should not be called in this contract test'); return fetchHandler(...args); },
    importScripts() { throw new Error('local secrets should not be loaded by the transport-only service worker'); },
    chrome: {
      action: { onClicked: { addListener(listener) { actionClickListener = listener; } } },
      runtime: { id: chromeRuntimeId, lastError: null, onMessage: { addListener(listener) { messageListener = listener; } }, getURL: (assetPath) => 'chrome-extension://test/' + assetPath },
      storage: { local: { get: async (key) => { if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storageData[entry]])); if (typeof key === 'string') return { [key]: storageData[key] }; return { ...storageData }; }, set: async (values) => { Object.assign(storageData, values || {}); } } },
      tabs: {
        query: async () => activeTab ? [activeTab] : [],
        sendMessage: async () => { tabMessageCount += 1; if (firstTabMessageRejects && tabMessageCount === 1) throw new Error('Could not establish connection. Receiving end does not exist.'); return { ok: true }; },
        create() {}, onUpdated: { addListener() {}, removeListener() {} },
      },
      scripting: { executeScript: async (details) => { executedScripts.push(details); } },
    },
  };
  if (browserRuntimeId) sandbox.browser = { runtime: { id: browserRuntimeId } };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(scriptSource, sandbox, { filename: path.join(root, 'background/service-worker.js') });
  return { fetchCalls, executedScripts, get tabMessageCount() { return tabMessageCount; }, send(message) { return new Promise((resolve) => { messageListener(message, {}, resolve); }); }, async clickAction(tab = activeTab) { assert.equal(typeof actionClickListener, 'function'); actionClickListener(tab); await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0)); } };
}

function jsonResponse(payload, ok = true, status = ok ? 200 : 500) { return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => payload }; }
function assertLocalAuthHeader(options) { assert.equal(options.headers['X-YouTube-Summary-Token'], 'test-local-token'); }

async function testSummarizeRoutesThroughLocalJobApi() {
  const worker = createServiceWorker({ fetchHandler: async (url, options = {}) => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:4789\/api\/youtube-summary\//); assert.ok(!/openrouter\.ai/.test(url));
    if (url.endsWith('/api/youtube-summary/extension-auth')) { assert.equal(options.method, 'GET'); assert.equal(options.headers['X-YouTube-Summary-Extension-Id'], 'lbbncpgjnoffnhihjnomphmabaieaaoo'); return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' }); }
    if (url.endsWith('/api/youtube-summary/jobs')) { assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'application/json'); assertLocalAuthHeader(options); const body = JSON.parse(options.body); assert.equal(body.video.videoId, 'abc123'); assert.equal(body.model, 'mistralai/mistral-small-24b-instruct-2501'); return jsonResponse({ ok: true, id: 'job-1', status: 'queued' }, true, 202); }
    if (url.endsWith('/api/youtube-summary/jobs/job-1')) { assert.equal(options.method, 'GET'); return jsonResponse({ ok: true, id: 'job-1', status: 'succeeded', result: { ok: true, markdown: '# Local Summary', path: '/tmp/local.md', category: 'General', model: 'mistralai/mistral-small-24b-instruct-2501' } }); }
    throw new Error('unexpected fetch ' + url);
  } });
  const result = await worker.send({ type: 'SUMMARIZE_AND_SAVE', video: { videoId: 'abc123', title: 'Example', transcript: 'Long transcript '.repeat(20) }, model: 'mistralai/mistral-small-24b-instruct-2501' });
  assert.equal(result.ok, true); assert.equal(result.markdown, '# Local Summary'); assert.equal(result.path, '/tmp/local.md');
  assert.deepEqual(worker.fetchCalls.map(([url]) => new URL(url).pathname), ['/api/youtube-summary/extension-auth', '/api/youtube-summary/jobs', '/api/youtube-summary/jobs/job-1']);
}

async function testLocalAuthBootstrapUsesAllowlistedIdWhenRuntimeIdIsMissingOrSafariScoped() {
  for (const workerOptions of [
    { chromeRuntimeId: '' },
    { chromeRuntimeId: 'safari-web-extension', browserRuntimeId: 'safari-web-extension' },
  ]) {
    const worker = createServiceWorker({ ...workerOptions, fetchHandler: async (url, options = {}) => {
      if (url.endsWith('/api/youtube-summary/extension-auth')) {
        assert.equal(options.headers['X-YouTube-Summary-Extension-Id'], 'lbbncpgjnoffnhihjnomphmabaieaaoo');
        return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' });
      }
      if (url.endsWith('/api/youtube-summary/jobs')) return jsonResponse({ ok: true, id: 'job-1', status: 'queued' }, true, 202);
      if (url.endsWith('/api/youtube-summary/jobs/job-1')) return jsonResponse({ ok: true, id: 'job-1', status: 'succeeded', result: { ok: true, markdown: '# Local Summary', path: '/tmp/local.md' } });
      throw new Error('unexpected fetch ' + url);
    } });
    const result = await worker.send({ type: 'SUMMARIZE_AND_SAVE', video: { videoId: 'abc123', title: 'Example', transcript: 'Long transcript '.repeat(20) } });
    assert.equal(result.ok, true);
  }
}

async function testSummarizeReturnsFailedLocalJobAsMessageResponse() {
  const worker = createServiceWorker({ fetchHandler: async (url, options = {}) => { if (url.endsWith('/api/youtube-summary/extension-auth')) return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' }); if (url.endsWith('/api/youtube-summary/jobs')) { assertLocalAuthHeader(options); return jsonResponse({ ok: true, id: 'job-2', status: 'queued' }, true, 202); } if (url.endsWith('/api/youtube-summary/jobs/job-2')) return jsonResponse({ ok: true, id: 'job-2', status: 'failed', error: 'No transcript provided.' }); throw new Error('unexpected fetch ' + url); } });
  const result = await worker.send({ type: 'SUMMARIZE_AND_SAVE', video: { videoId: 'abc123', title: 'Example', transcript: '' } }); assert.equal(result.ok, false); assert.equal(result.error, 'No transcript provided.');
}

async function testFindExistingRoutesThroughLocalService() {
  const worker = createServiceWorker({ fetchHandler: async (url, options = {}) => { assert.equal(options.method, 'GET'); assert.equal(url, 'http://127.0.0.1:4789/api/youtube-summary/existing?videoId=abc123'); return jsonResponse({ ok: true, found: true, markdown: '# Existing', path: '/tmp/existing.md', category: 'General' }); } });
  const result = await worker.send({ type: 'FIND_EXISTING_SUMMARY', videoId: 'abc123' }); assert.equal(result.ok, true); assert.equal(result.found, true); assert.equal(result.markdown, '# Existing'); assert.equal(worker.fetchCalls.length, 1);
}

async function testSaveMarkdownRoutesThroughLocalService() {
  const worker = createServiceWorker({ fetchHandler: async (url, options = {}) => { if (url.endsWith('/api/youtube-summary/extension-auth')) return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' }); assert.equal(url, 'http://127.0.0.1:4789/api/youtube-summary/save'); assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'application/json'); assertLocalAuthHeader(options); const body = JSON.parse(options.body); assert.equal(body.markdown, '# Saved'); assert.equal(body.category, 'Coding'); assert.equal(body.previousPath, '/tmp/old.md'); return jsonResponse({ ok: true, markdown: '# Saved', path: '/tmp/saved.md', category: 'Coding' }); } });
  const result = await worker.send({ type: 'SAVE_MARKDOWN', video: { videoId: 'abc123', title: 'Example' }, markdown: '# Saved', category: 'Coding', previousPath: '/tmp/old.md' }); assert.equal(result.ok, true); assert.equal(result.path, '/tmp/saved.md'); assert.equal(worker.fetchCalls.length, 2);
}

async function testLocalServiceHttpErrorsBecomeMessageErrors() { const worker = createServiceWorker({ fetchHandler: async () => jsonResponse({ error: 'local service unavailable' }, false, 503) }); const result = await worker.send({ type: 'FIND_EXISTING_SUMMARY', videoId: 'abc123' }); assert.equal(result.ok, false); assert.equal(result.error, 'local service unavailable'); }

async function testLocalServiceNetworkErrorsBecomeUnavailableMessage() { const worker = createServiceWorker({ fetchHandler: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:4789'); } }); const result = await worker.send({ type: 'FIND_EXISTING_SUMMARY', videoId: 'abc123' }); assert.equal(result.ok, false); assert.match(result.error, /^local-service-unavailable:/); }

async function testMutatingLocalAuthErrorsBecomeClearMessage() { let authBootstraps = 0; let jobAttempts = 0; const worker = createServiceWorker({ fetchHandler: async (url) => { if (url.endsWith('/api/youtube-summary/extension-auth')) { authBootstraps += 1; return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' }); } if (url.endsWith('/api/youtube-summary/jobs')) { jobAttempts += 1; return jsonResponse({ ok: false, code: 'local-auth-error' }, false, 401); } throw new Error('unexpected fetch ' + url); } }); const result = await worker.send({ type: 'SUMMARIZE_AND_SAVE', video: { videoId: 'abc123', title: 'Example', transcript: 'Long transcript '.repeat(20) } }); assert.equal(result.ok, false); assert.match(result.error, /^local-auth-error:/); assert.doesNotMatch(result.error, /macos-multitool/); assert.equal(authBootstraps, 2); assert.equal(jobAttempts, 2); }

async function testMutatingRequestRetriesOnceAfterStaleLocalAuth() { let jobAttempts = 0; const worker = createServiceWorker({ initialStorage: { localYouTubeSummaryToken: 'stale-token' }, fetchHandler: async (url, options = {}) => { if (url.endsWith('/api/youtube-summary/extension-auth')) return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' }); if (url.endsWith('/api/youtube-summary/jobs')) { jobAttempts += 1; assert.equal(options.method, 'POST'); assert.equal(options.headers['X-YouTube-Summary-Token'], jobAttempts === 1 ? 'stale-token' : 'test-local-token'); if (jobAttempts === 1) return jsonResponse({ ok: false, code: 'local-auth-error', error: 'local-auth-error: stale token' }, false, 401); return jsonResponse({ ok: true, id: 'job-retry', status: 'queued' }, true, 202); } if (url.endsWith('/api/youtube-summary/jobs/job-retry')) return jsonResponse({ ok: true, id: 'job-retry', status: 'succeeded', result: { ok: true, markdown: '# Retried', path: '/tmp/retried.md' } }); throw new Error('unexpected fetch ' + url); } }); const result = await worker.send({ type: 'SUMMARIZE_AND_SAVE', video: { videoId: 'abc123', title: 'Example', transcript: 'Long transcript '.repeat(20) } }); assert.equal(result.ok, true); assert.equal(result.markdown, '# Retried'); assert.equal(jobAttempts, 2); assert.deepEqual(worker.fetchCalls.map(([url]) => new URL(url).pathname), ['/api/youtube-summary/jobs', '/api/youtube-summary/extension-auth', '/api/youtube-summary/jobs', '/api/youtube-summary/jobs/job-retry']); }

async function testLegacyAuthEndpointStillWorksForOldLocalServices() { const worker = createServiceWorker({ fetchHandler: async (url, options = {}) => { if (url.endsWith('/api/youtube-summary/extension-auth')) return jsonResponse({ error: 'not found' }, false, 404); if (url.endsWith('/api/youtube-summary/auth')) { assert.equal(options.method, 'GET'); return jsonResponse({ ok: true, headerName: 'X-YouTube-Summary-Token', token: 'test-local-token' }); } if (url.endsWith('/api/youtube-summary/jobs')) { assertLocalAuthHeader(options); return jsonResponse({ ok: true, id: 'job-legacy', status: 'queued' }, true, 202); } if (url.endsWith('/api/youtube-summary/jobs/job-legacy')) return jsonResponse({ ok: true, id: 'job-legacy', status: 'succeeded', result: { ok: true, markdown: '# Legacy', path: '/tmp/legacy.md' } }); throw new Error('unexpected fetch ' + url); } }); const result = await worker.send({ type: 'SUMMARIZE_AND_SAVE', video: { videoId: 'abc123', title: 'Example', transcript: 'Long transcript '.repeat(20) } }); assert.equal(result.ok, true); assert.equal(result.markdown, '# Legacy'); }

async function testActionClickInjectsYoutubeContentScriptWhenMissing() {
  const worker = createServiceWorker({ activeTab: { id: 42, url: 'https://www.youtube.com/watch?v=abc123' }, firstTabMessageRejects: true, fetchHandler: async () => { throw new Error('fetch not expected for action click'); } });
  await worker.clickAction(); assert.equal(worker.tabMessageCount, 2); assert.equal(JSON.stringify(worker.executedScripts), JSON.stringify([{ target: { tabId: 42 }, files: ['content/youtube-transcript.js'] }]));
}

function testContentTimeoutExceedsBackgroundLocalJobTimeout() { const summaryTimeout = Number(contentScriptSource.match(/SUMMARY_RESPONSE_TIMEOUT_MS\s*=\s*(\d+)/)?.[1] || 0); const localJobTimeout = Number(scriptSource.match(/LOCAL_SUMMARY_JOB_TIMEOUT_MS\s*=\s*(\d+)/)?.[1] || 0); assert.ok(summaryTimeout >= localJobTimeout + 30000, 'content timeout ' + summaryTimeout + 'ms must leave room for local job timeout ' + localJobTimeout + 'ms plus extraction/overhead'); }

(async () => { await testSummarizeRoutesThroughLocalJobApi(); await testLocalAuthBootstrapUsesAllowlistedIdWhenRuntimeIdIsMissingOrSafariScoped(); await testSummarizeReturnsFailedLocalJobAsMessageResponse(); await testFindExistingRoutesThroughLocalService(); await testSaveMarkdownRoutesThroughLocalService(); await testLocalServiceHttpErrorsBecomeMessageErrors(); await testLocalServiceNetworkErrorsBecomeUnavailableMessage(); await testMutatingLocalAuthErrorsBecomeClearMessage(); await testMutatingRequestRetriesOnceAfterStaleLocalAuth(); await testLegacyAuthEndpointStillWorksForOldLocalServices(); await testActionClickInjectsYoutubeContentScriptWhenMissing(); testContentTimeoutExceedsBackgroundLocalJobTimeout(); console.log('service-worker-contract.test.js passed'); })().catch((error) => { console.error(error); process.exit(1); });
