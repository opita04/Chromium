const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(root, 'content/youtube-transcript.js'), 'utf8');

const basePlayerResponse = {
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

function createSandbox({
  playerResponse = basePlayerResponse,
  fetchHandler,
  runtimeResponse = { ok: false, error: 'unexpected runtime message' },
} = {}) {
  let messageListener = null;
  const fetchCalls = [];
  const runtimeMessages = [];
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
      return fetchHandler(url, options);
    },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
        sendMessage(message, callback) {
          runtimeMessages.push(message);
          callback(runtimeResponse);
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

  return {
    fetchCalls,
    runtimeMessages,
    extract() {
      return new Promise((resolve) => {
        const keepChannelOpen = messageListener({ type: 'EXTRACT_YOUTUBE_TRANSCRIPT' }, {}, resolve);
        assert.equal(keepChannelOpen, true);
      });
    },
  };
}

async function testPrefersManualEnglishCaptionTrack() {
  const env = createSandbox({
    fetchHandler: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        events: [
          { segs: [{ utf8: 'This is the caption-track transcript. ' }] },
          { segs: [{ utf8: 'It loads without opening the visible transcript drawer. ' }] },
          { segs: [{ utf8: 'That keeps summary extraction working when YouTube UI hydration is flaky.' }] },
        ],
      }),
    }),
  });

  const result = await env.extract();
  assert.equal(result.ok, true);
  assert.equal(result.video.videoId, 'abc123');
  assert.equal(result.video.title, 'Caption fallback test');
  assert.equal(result.video.channel, 'Example Channel');
  assert.match(result.video.transcript, /caption-track transcript/);
  assert.match(result.video.transcript, /YouTube UI hydration is flaky/);
  assert.equal(env.fetchCalls.length, 1);
  assert.match(env.fetchCalls[0].url, /lang=en/);
  assert.doesNotMatch(env.fetchCalls[0].url, /kind=asr/);
  assert.match(env.fetchCalls[0].url, /fmt=json3/);
  assert.equal(env.fetchCalls[0].options.credentials, 'include');
  assert.equal(env.runtimeMessages.length, 0);
}

async function testUsesLocalTranscriptFallbackWhenCaptionTrackAndDrawerAreEmpty() {
  const playerResponse = {
    ...basePlayerResponse,
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr',
            languageCode: 'en',
            kind: 'asr',
            name: { simpleText: 'English (auto-generated)' },
          },
        ],
      },
    },
  };
  const fallbackTranscript = 'Local service transcript fallback '.repeat(8);
  const env = createSandbox({
    playerResponse,
    fetchHandler: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ events: [] }),
    }),
    runtimeResponse: { ok: true, transcript: fallbackTranscript, source: 'yt-dlp' },
  });

  const result = await env.extract();
  assert.equal(result.ok, true);
  assert.equal(result.video.transcript, fallbackTranscript.trim());
  assert.equal(env.fetchCalls.length, 1);
  assert.equal(JSON.stringify(env.runtimeMessages), JSON.stringify([{
    type: 'FETCH_YOUTUBE_TRANSCRIPT',
    videoId: 'abc123',
    url: 'https://www.youtube.com/watch?v=abc123',
  }]));
}

(async () => {
  await testPrefersManualEnglishCaptionTrack();
  await testUsesLocalTranscriptFallbackWhenCaptionTrackAndDrawerAreEmpty();
  console.log('youtube-transcript-content.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
