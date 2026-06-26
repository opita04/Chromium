const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'content/youtube-transcript.js'), 'utf8');

const playerResponse = {
  videoDetails: {
    author: 'Example Channel',
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=es',
          languageCode: 'es',
          name: { simpleText: 'Spanish' },
        },
        {
          baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr',
          languageCode: 'en',
          kind: 'asr',
          name: { simpleText: 'English (auto-generated)' },
        },
        {
          baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
          languageCode: 'en',
          name: { simpleText: 'English' },
        },
      ],
    },
  },
};

let messageListener = null;
const fetchCalls = [];
const location = {
  href: 'https://www.youtube.com/feed/subscriptions',
  pathname: '/feed',
};

const sandbox = {
  URL,
  console,
  clearTimeout,
  setTimeout,
  setInterval: () => 0,
  fetch: async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        events: [
          { segs: [{ utf8: 'This is the caption-track transcript. ' }] },
          { segs: [{ utf8: 'It loads without opening the visible transcript drawer. ' }] },
          { segs: [{ utf8: 'That keeps summary extraction working when YouTube UI hydration is flaky.' }] },
        ],
      }),
    };
  },
  chrome: {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
    },
  },
  document: {
    scripts: [
      { textContent: `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};` },
    ],
    title: 'Caption fallback test - YouTube',
    getElementById: () => null,
    querySelector: (selector) => {
      if (selector === 'meta[name="title"]') return { content: 'Caption fallback test' };
      return null;
    },
    querySelectorAll: () => [],
  },
  location,
  window: {},
};

vm.runInNewContext(scriptSource, sandbox, {
  filename: path.join(root, 'content/youtube-transcript.js'),
});

assert.equal(typeof messageListener, 'function');

location.href = 'https://www.youtube.com/watch?v=abc123';
location.pathname = '/watch';

new Promise((resolve) => {
  const keepChannelOpen = messageListener({ type: 'EXTRACT_YOUTUBE_TRANSCRIPT' }, {}, resolve);
  assert.equal(keepChannelOpen, true);
}).then((result) => {
  assert.equal(result.ok, true);
  assert.equal(result.video.videoId, 'abc123');
  assert.equal(result.video.title, 'Caption fallback test');
  assert.equal(result.video.channel, 'Example Channel');
  assert.match(result.video.transcript, /caption-track transcript/);
  assert.match(result.video.transcript, /YouTube UI hydration is flaky/);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /lang=en/);
  assert.doesNotMatch(fetchCalls[0].url, /kind=asr/);
  assert.match(fetchCalls[0].url, /fmt=json3/);
  assert.equal(fetchCalls[0].options.credentials, 'include');
  console.log('youtube-transcript-content.test.js passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
