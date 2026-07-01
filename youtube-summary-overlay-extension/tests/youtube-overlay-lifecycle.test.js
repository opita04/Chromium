const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'content/youtube-transcript.js'), 'utf8');

class FakeTextNode {
  constructor(text) {
    this.textContent = text;
    this.parentNode = null;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.eventListeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.type = '';
    this._textContent = '';
  }

  set id(value) {
    this.attributes.set('id', value);
  }

  get id() {
    return this.attributes.get('id') || '';
  }

  set innerText(value) {
    this.textContent = value;
  }

  get innerText() {
    return this.textContent;
  }

  set textContent(value) {
    this._textContent = String(value || '');
  }

  get textContent() {
    return [
      this._textContent,
      ...this.children.map((child) => child.textContent || ''),
    ].join('');
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = value;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || '';
  }

  append(...nodes) {
    nodes.flat().forEach((node) => this.appendChild(node));
  }

  appendChild(node) {
    if (typeof node === 'string') node = new FakeTextNode(node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this._textContent = '';
    this.append(...nodes);
  }

  addEventListener(type, listener) {
    this.eventListeners[type] ||= [];
    this.eventListeners[type].push(listener);
  }

  dispatchEvent(event) {
    event.target ||= this;
    for (const listener of this.eventListeners[event.type] || []) listener.call(this, event);
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      preventDefault() {},
      stopPropagation() {},
    });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map((part) => part.trim()).filter(Boolean);
    const out = [];
    const visit = (node) => {
      if (!(node instanceof FakeElement)) return;
      for (const part of selectors) {
        if (matchesSelector(node, part)) {
          out.push(node);
          break;
        }
      }
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return out;
  }

  closest() {
    return null;
  }

  scrollIntoView() {}

  getBoundingClientRect() {
    return { width: 46, height: 46, left: 0, right: 46, top: 0, bottom: 46 };
  }

  get classList() {
    return {
      add: (name) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        names.add(name);
        this.className = Array.from(names).join(' ');
      },
      remove: (name) => {
        this.className = this.className.split(/\s+/).filter((item) => item && item !== name).join(' ');
      },
      toggle: (name, force) => {
        if (force) this.classList.add(name);
        else this.classList.remove(name);
      },
    };
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.body);
    this.title = 'Lifecycle test - YouTube';
    this.scripts = [];
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    return new FakeTextNode(text);
  }

  getElementById(id) {
    return findElement(this.documentElement, (node) => node.id === id);
  }

  querySelector(selector) {
    if (selector === 'meta[name="title"]') return { content: 'Lifecycle test' };
    if (selector.includes('channel')) return null;
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }
}

function matchesSelector(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector === node.tagName.toLowerCase()) return true;
  if (selector === 'button' || selector === 'input' || selector === 'select' || selector === 'style') {
    return node.tagName.toLowerCase() === selector;
  }
  const dataRole = selector.match(/^\[data-role="([^"]+)"\]$/);
  if (dataRole) return node.dataset.role === dataRole[1];
  if (selector === '[data-model-preset]') return Boolean(node.dataset.modelPreset);
  return false;
}

function findElement(node, predicate) {
  if (node instanceof FakeElement && predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSandbox({ cached = null, existingSummary = null, summaryResult = null, runtimePromiseMode = false, storageGetStalls = false, storageSetRejects = false } = {}) {
  const document = new FakeDocument();
  const playerResponse = {
    videoDetails: { author: 'Lifecycle Channel' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
            languageCode: 'en',
            name: { simpleText: 'English' },
          },
        ],
      },
    },
  };
  document.scripts = [{ textContent: `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};` }];

  const location = {
    href: 'https://www.youtube.com/watch?v=abc123',
    pathname: '/watch',
  };
  let messageListener = null;
  const summarizeDeferred = deferred();
  const runtimeMessages = [];
  const storageData = {};
  if (cached) storageData['youtubeSummaryOverlay:abc123'] = cached;

  const runtimeSendMessage = (message, callback) => {
    runtimeMessages.push(message);
    const responsePromise = (() => {
      if (message.type === 'FIND_EXISTING_SUMMARY') {
        return Promise.resolve(existingSummary || { ok: true, found: false, saveMode: 'browser-direct' });
      }
      if (message.type === 'SUMMARIZE_AND_SAVE') {
        return summarizeDeferred.promise;
      }
      return Promise.resolve({ ok: false, error: `Unexpected message ${message.type}` });
    })();
    if (runtimePromiseMode && callback === undefined) {
      return responsePromise;
    }
    if (message.type === 'FIND_EXISTING_SUMMARY') {
      callback(existingSummary || { ok: true, found: false, saveMode: 'browser-direct' });
      return undefined;
    }
    if (message.type === 'SUMMARIZE_AND_SAVE') {
      summarizeDeferred.promise.then((result) => callback(result));
      return undefined;
    }
    callback({ ok: false, error: `Unexpected message ${message.type}` });
    return undefined;
  };

  const sandbox = {
    URL,
    console,
    clearTimeout,
    setTimeout,
    setInterval: () => 0,
    DOMParser: class {
      parseFromString() {
        return { querySelectorAll: () => [] };
      }
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        events: [
          { segs: [{ utf8: 'This transcript is long enough for the lifecycle overlay test. ' }] },
          { segs: [{ utf8: 'It proves generation can start while the modal remains hidden. ' }] },
        ],
      }),
    }),
    browser: runtimePromiseMode ? {
      runtime: {
        sendMessage: runtimeSendMessage,
      },
    } : undefined,
    chrome: {
      runtime: {
        getURL: (assetPath) => `chrome-extension://test/${assetPath}`,
        lastError: null,
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
        sendMessage: runtimeSendMessage,
      },
      storage: {
        local: {
          get(key, callback) {
            if (storageGetStalls && String(key).startsWith('youtubeSummaryOverlay:')) {
              return new Promise(() => {});
            }
            const result = typeof key === 'string' ? { [key]: storageData[key] } : {};
            if (callback) callback(result);
            return Promise.resolve(result);
          },
          set(data, callback) {
            if (storageSetRejects) return Promise.reject(new Error('storage quota exceeded'));
            Object.assign(storageData, data);
            if (callback) callback();
            return Promise.resolve();
          },
        },
      },
    },
    document,
    location,
    window: {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  };

  vm.runInNewContext(scriptSource, sandbox, {
    filename: path.join(root, 'content/youtube-transcript.js'),
  });

  return {
    document,
    location,
    get messageListener() {
      return messageListener;
    },
    resolveSummary(result = summaryResult || {
      ok: true,
      markdown: '# Ready Summary\n\n- Done',
      path: '',
      category: 'General',
      model: 'openrouter/free',
      video: { videoId: 'abc123', title: 'Lifecycle test', channel: 'Lifecycle Channel' },
    }) {
      summarizeDeferred.resolve(result);
    },
    runtimeMessages,
  };
}

async function openFromToolbar(env) {
  assert.equal(typeof env.messageListener, 'function');
  env.messageListener({ type: 'OPEN_SUMMARY_OVERLAY' }, {}, () => {});
  await tick();
}

async function openFromPageButton(env) {
  const button = env.document.getElementById('opita-youtube-summary-button');
  assert.ok(button, 'summary page button exists');
  button.click();
  await tick();
}

function messageTypes(env) {
  return env.runtimeMessages.map((message) => message.type);
}

async function testFullMissStaysHiddenUntilSummaryReady() {
  const env = createSandbox();
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.ok(overlay, 'overlay can be built without being shown');
  assert.equal(overlay.hidden, true, 'full miss keeps overlay hidden before summary resolves');

  env.resolveSummary();
  await tick();
  await tick();
  assert.equal(overlay.hidden, false, 'overlay opens after summary resolves');
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Ready Summary/);
}

async function testPageButtonFullMissStaysHiddenUntilSummaryReady() {
  const env = createSandbox();
  await openFromPageButton(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.ok(overlay, 'overlay can be built without being shown');
  assert.equal(overlay.hidden, true, 'page-button full miss keeps overlay hidden before summary resolves');

  env.resolveSummary();
  await tick();
  await tick();
  assert.equal(overlay.hidden, false, 'page-button overlay opens after summary resolves');
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Ready Summary/);
}

async function testCacheHitOpensImmediately() {
  const env = createSandbox({
    cached: {
      markdown: '# Cached Summary',
      video: { videoId: 'abc123', title: 'Cached title', channel: 'Cached channel' },
      category: 'General',
      model: 'openrouter/free',
    },
  });
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, false);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Cached Summary/);
}

async function testSavedSummaryHitOpensImmediatelyWithoutGeneration() {
  const env = createSandbox({
    existingSummary: {
      ok: true,
      found: true,
      markdown: '# Existing Saved Summary',
      path: '/Users/opita/Obsidian/Existing.md',
      category: 'Coding',
      video: { videoId: 'abc123', title: 'Existing title', channel: 'Existing channel' },
    },
  });
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, false);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Existing Saved Summary/);
  assert.deepEqual(messageTypes(env), ['FIND_EXISTING_SUMMARY']);
}

async function testStalledCacheReadFallsThroughToGeneration() {
  const env = createSandbox({ storageGetStalls: true });
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, true);

  await sleep(1600);
  await tick();
  assert.deepEqual(messageTypes(env), ['FIND_EXISTING_SUMMARY', 'SUMMARIZE_AND_SAVE']);
  assert.equal(overlay.hidden, true, 'overlay remains hidden while generation is pending');

  env.resolveSummary();
  await tick();
  await tick();
  assert.equal(overlay.hidden, false);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Ready Summary/);
}

async function testSafariRuntimeWithChromeCallbackCompletesGeneration() {
  const env = createSandbox({ runtimePromiseMode: true });
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, true);

  env.resolveSummary();
  await tick();
  await tick();
  assert.equal(overlay.hidden, false);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Ready Summary/);
}

async function testCacheWriteFailureStillShowsReadySummary() {
  const env = createSandbox({ storageSetRejects: true });
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, true);

  env.resolveSummary();
  await tick();
  await tick();
  assert.equal(overlay.hidden, false);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Ready Summary/);
  assert.match(overlay.querySelector('[data-role="status"]').textContent, /cache save failed/i);
}

async function testGenerationErrorShowsExplicitErrorState() {
  const env = createSandbox();
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, true);

  env.resolveSummary({ ok: false, error: 'LLM unavailable' });
  await tick();
  await tick();
  assert.equal(overlay.hidden, false);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /Summary failed/);
  assert.match(overlay.querySelector('[data-role="summary"]').textContent, /LLM unavailable/);
  assert.match(overlay.querySelector('[data-role="status"]').textContent, /LLM unavailable/);
}

async function testStaleLaunchDoesNotOpenAfterVideoNavigation() {
  const env = createSandbox();
  await openFromToolbar(env);
  const overlay = env.document.getElementById('opita-youtube-summary-overlay');
  assert.equal(overlay.hidden, true);

  env.location.href = 'https://www.youtube.com/watch?v=changed456';
  env.resolveSummary();
  await tick();
  await tick();
  assert.equal(overlay.hidden, true, 'stale video result must not open overlay after navigation');
}

(async () => {
  await testFullMissStaysHiddenUntilSummaryReady();
  await testPageButtonFullMissStaysHiddenUntilSummaryReady();
  await testCacheHitOpensImmediately();
  await testSavedSummaryHitOpensImmediatelyWithoutGeneration();
  await testStalledCacheReadFallsThroughToGeneration();
  await testSafariRuntimeWithChromeCallbackCompletesGeneration();
  await testCacheWriteFailureStillShowsReadySummary();
  await testGenerationErrorShowsExplicitErrorState();
  await testStaleLaunchDoesNotOpenAfterVideoNavigation();
  console.log('youtube-overlay-lifecycle.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
