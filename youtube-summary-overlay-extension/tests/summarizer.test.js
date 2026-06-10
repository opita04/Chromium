const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CATEGORIES, DEFAULT_MODEL, FALLBACK_MODEL, DEFAULT_OUTPUT_DIR, buildMarkdown, buildPrompt, classifyCategory, normalizeSource, outputPathFor, saveMarkdown, updateMarkdownCategory } = require('../native/summarizer');

assert.equal(DEFAULT_MODEL, 'mistralai/mistral-small-24b-instruct-2501');
assert.equal(FALLBACK_MODEL, 'mistralai/mistral-small-24b-instruct-2501');
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
assert.equal((moved.markdown.match(/## Transcript/g) || []).length, 1);
assert.match(updateMarkdownCategory(markdown, 'General'), /category: "General"/);

const legacyMarkdown = buildMarkdown({
  video: { ...video, transcript: '' },
  model: 'test/model',
  usage: {},
  category: 'General',
  summaryMarkdown: '# Legacy\n\n## Takeaways\n- Existing note.',
});
const legacySaved = saveMarkdown({ video, markdown: legacyMarkdown, outputDir: tmp, category: 'General' });
assert.match(legacySaved.markdown, /## Transcript\n\nThis is a transcript about testing/);

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
assert.equal((webpageSaved.markdown.match(/## Source Text/g) || []).length, 1);
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

console.log('summarizer.test.js passed');
