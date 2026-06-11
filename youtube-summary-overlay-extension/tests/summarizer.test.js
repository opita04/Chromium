const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CATEGORIES, CONTEXT_LENGTH_FALLBACK_MODEL, DEFAULT_MODEL, FALLBACK_MODEL, DEFAULT_OUTPUT_DIR, buildMarkdown, buildPrompt, callOpenRouter, classifyCategory, normalizeSource, outputPathFor, saveMarkdown, systemPromptFor, updateMarkdownCategory } = require('../native/summarizer');

assert.equal(DEFAULT_MODEL, 'mistralai/mistral-small-24b-instruct-2501');
assert.equal(FALLBACK_MODEL, 'mistralai/mistral-small-24b-instruct-2501');
assert.equal(CONTEXT_LENGTH_FALLBACK_MODEL, 'google/gemini-2.5-flash-lite');
assert.equal(DEFAULT_OUTPUT_DIR, '/Users/opita/Documents/Obsidian/youtube-summaries');
assert.equal(CATEGORIES.length, 10);

const video = {
  title: 'Test / Video: Summary?',
  channel: 'Example Channel',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  videoId: 'dQw4w9WgXcQ',
  transcript: 'This is a transcript about testing. It has a main point and a takeaway.',
};

const markdown = buildMarkdown({
  video,
  model: 'test/model',
  usage: { prompt_tokens: 10, completion_tokens: 5 },
  category: 'Educational',
  summaryMarkdown: '# Test / Video: Summary?\n\n## Takeaways\n- Testing works.\n\n## Main Points\n- Markdown is saved.',
});

assert.match(markdown, /## Takeaways/);
assert.match(markdown, /## Main Points/);
assert.match(markdown, /source: youtube/);
assert.match(markdown, /category: "Educational"/);
assert.match(markdown, /## Transcript\n\nThis is a transcript about testing/);

const prompt = buildPrompt(video);
assert.match(prompt, /## Takeaways/);
assert.match(prompt, /## Key Points/);
assert.match(prompt, /### Final Observation/);
assert.match(prompt, /### A\./);
assert.doesNotMatch(prompt, /## Why It Matters/);
assert.doesNotMatch(prompt, /## Notable Details/);
assert.match(systemPromptFor(video), /YouTube transcript analysis/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-summary-test-'));
const result = saveMarkdown({ video, markdown, outputDir: tmp, category: 'Educational' });
assert.equal(result.ok, true);
assert.equal(result.category, 'Educational');
assert.equal(fs.existsSync(result.path), true);
assert.match(fs.readFileSync(result.path, 'utf8'), /Testing works/);
assert.match(fs.readFileSync(result.path, 'utf8'), /## Transcript\n\nThis is a transcript about testing/);
assert.equal(path.dirname(result.path), path.join(tmp, 'Educational'));
assert.doesNotMatch(path.basename(outputPathFor(video, tmp, 'Educational')), /[\\/:*?"<>|]/);

const moved = saveMarkdown({ video, markdown: result.markdown, outputDir: tmp, category: 'Coding', previousPath: result.path });
assert.equal(moved.category, 'Coding');
assert.equal(path.dirname(moved.path), path.join(tmp, 'Coding'));
assert.equal(fs.existsSync(moved.path), true);
assert.equal(fs.existsSync(result.path), false);
assert.match(moved.markdown, /category: "Coding"/);
assert.match(fs.readFileSync(moved.path, 'utf8'), /category: "Coding"/);
assert.equal((moved.markdown.match(/## Transcript/g) || []).length, 0);
assert.equal((fs.readFileSync(moved.path, 'utf8').match(/## Transcript/g) || []).length, 1);
assert.match(updateMarkdownCategory(markdown, 'General'), /category: "General"/);

const legacyMarkdown = buildMarkdown({
  video: { ...video, transcript: '' },
  model: 'test/model',
  usage: {},
  category: 'General',
  summaryMarkdown: '# Legacy\n\n## Takeaways\n- Existing note.',
});
const legacySaved = saveMarkdown({ video, markdown: legacyMarkdown, outputDir: tmp, category: 'General' });
assert.doesNotMatch(legacySaved.markdown, /## Transcript\n\nThis is a transcript about testing/);
assert.match(fs.readFileSync(legacySaved.path, 'utf8'), /## Transcript\n\nThis is a transcript about testing/);

const webpage = {
  sourceType: 'webpage',
  title: 'Gemini for Home update arrives',
  author: 'Android Police',
  siteName: 'Android Police',
  url: 'https://www.androidpolice.com/gemini-for-home-update-4-18/',
  sourceId: 'https://www.androidpolice.com/gemini-for-home-update-4-18/',
  text: 'Google is rolling out Gemini for Home features. The update adds smarter responses for home devices and improves assistant behavior.',
};
const normalizedPage = normalizeSource(webpage);
assert.equal(normalizedPage.sourceType, 'webpage');
assert.equal(normalizedPage.byline, 'Android Police');
assert.equal(normalizedPage.transcript, '');

const webpagePrompt = buildPrompt(webpage);
assert.match(webpagePrompt, /extracted webpage\/article text/);
assert.match(webpagePrompt, /Extracted page text:/);
assert.doesNotMatch(webpagePrompt, /YouTube transcript/);
assert.match(systemPromptFor(webpage), /webpage\/article analysis/);

const webpageMarkdown = buildMarkdown({
  video: webpage,
  model: 'test/model',
  usage: {},
  category: 'AI',
  summaryMarkdown: '# Gemini for Home update arrives\n\n## Takeaways\n- **Smart home**: Gemini improves assistant behavior.',
});
assert.match(webpageMarkdown, /source: webpage/);
assert.match(webpageMarkdown, /byline: "Android Police"/);
assert.match(webpageMarkdown, /source_id:/);
assert.match(webpageMarkdown, /## Source Text\n\nGoogle is rolling out Gemini for Home/);
assert.doesNotMatch(webpageMarkdown, /Unknown Channel/);

const webpageSaved = saveMarkdown({ video: webpage, markdown: webpageMarkdown, outputDir: tmp, category: 'AI' });
assert.equal(webpageSaved.category, 'AI');
assert.match(fs.readFileSync(webpageSaved.path, 'utf8'), /source: webpage/);
assert.equal((webpageSaved.markdown.match(/## Source Text/g) || []).length, 0);
assert.equal((fs.readFileSync(webpageSaved.path, 'utf8').match(/## Source Text/g) || []).length, 1);
assert.match(path.basename(outputPathFor(webpage, tmp, 'AI')), /Android Police - Gemini for Home update arrives/);

const politicalVideo = {
  ...video,
  title: 'Election policy debate',
  transcript: 'The president, senate, and government policy were discussed.',
};
assert.equal(classifyCategory(politicalVideo, markdown), 'Political');

const singleCountryMentionVideo = {
  ...video,
  title: 'React app localization for China users',
  transcript: 'This tutorial covers software, code, TypeScript, API handling, and deployment.',
};
assert.equal(classifyCategory(singleCountryMentionVideo, markdown), 'Coding');

const codingVideo = {
  ...video,
  title: 'Build a React app with TypeScript',
  transcript: 'This tutorial covers coding, debugging, and GitHub workflow for developers.',
};
assert.equal(classifyCategory(codingVideo, markdown), 'Coding');

const educationalVideo = {
  ...video,
  title: 'Complete beginner lesson',
  transcript: 'This course teaches students how to learn the topic step by step.',
};
assert.equal(classifyCategory(educationalVideo, markdown), 'Educational');

const generalVideo = {
  ...video,
  title: 'A story about life and productivity',
  transcript: 'The host shares general commentary and media examples.',
};
assert.equal(classifyCategory(generalVideo, markdown), 'General');

assert.equal(outputPathFor(video, tmp, 'NotARealCategory').includes(`${path.sep}Others${path.sep}`), true);
assert.doesNotMatch(buildMarkdown({ video: { ...video, channel: '' }, summaryMarkdown: '# Untitled', model: 'test/model', usage: {}, category: 'General' }), /Unknown Channel/);
assert.equal(CATEGORIES.includes(classifyCategory(video, markdown)), true);
assert.equal(classifyCategory(webpage, webpageMarkdown), 'AI');

async function testContextLengthFallback() {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const calls = [];
  process.env.OPENROUTER_API_KEY = 'test-key';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    if (calls.length === 1) {
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            metadata: {
              raw: "This endpoint's maximum context length is 32768 tokens. However, you requested about 37646 tokens (35046 of text input, 2600 in the output).",
            },
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '# Fallback summary' } }],
        usage: { prompt_tokens: 20, completion_tokens: 4 },
      }),
    };
  };

  try {
    const result = await callOpenRouter({ video, model: 'too-small/context-model' });
    assert.equal(result.model, CONTEXT_LENGTH_FALLBACK_MODEL);
    assert.equal(result.markdown, '# Fallback summary');
    assert.deepEqual(calls, ['too-small/context-model', CONTEXT_LENGTH_FALLBACK_MODEL]);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }
}

async function testPreviousDefaultNormalizesToMistral() {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const calls = [];
  process.env.OPENROUTER_API_KEY = 'test-key';
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.model);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '# Mistral summary' } }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
    };
  };

  try {
    const result = await callOpenRouter({ video, model: 'nvidia/nemotron-3-ultra-550b-a55b:free' });
    assert.equal(result.model, DEFAULT_MODEL);
    assert.deepEqual(calls, [DEFAULT_MODEL]);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }
}

(async () => {
  await testContextLengthFallback();
  await testPreviousDefaultNormalizesToMistral();
  console.log('summarizer.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
