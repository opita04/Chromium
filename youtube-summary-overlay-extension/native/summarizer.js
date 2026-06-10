const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_MODEL = 'mistralai/mistral-small-24b-instruct-2501';
const FALLBACK_MODEL = 'mistralai/mistral-small-24b-instruct-2501';
const FALLBACK_SOURCE_MODELS = new Set(['nvidia/nemotron-3-ultra-550b-a55b:free']);
const OPENROUTER_TIMEOUT_MS = Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS || '8000', 10);
const DEFAULT_OUTPUT_DIR = '/Users/opita/Documents/Obsidian/youtube-summaries';
const CATEGORIES = [
  'Political',
  'Coding',
  'Educational',
  'General',
  'Business',
  'AI',
  'Finance',
  'Health',
  'Science',
  'Others',
];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function keychainLookup(service) {
  try {
    return execFileSync('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function getOpenRouterApiKey() {
  const env = {
    ...loadDotEnv(path.join(os.homedir(), '.hermes', '.env')),
    ...process.env,
  };
  return env.OPENROUTER_API_KEY || env.OPENROUTER_APIKEY || keychainLookup('OPENROUTER_API_KEY') || keychainLookup('openrouter') || keychainLookup('openrouter-api-key');
}

function logNative(message, details = {}) {
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.error(`[youtube-summary] ${new Date().toISOString()} ${message}${suffix}`);
}

function sanitizeFilePart(value, fallback = 'untitled') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[\\/:*?"<>|#\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback;
}

function isoDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreCategory(text, terms) {
  const haystack = ` ${String(text || '').toLowerCase()} `;
  return terms.reduce((score, term) => {
    const value = String(term).toLowerCase().trim();
    if (!value) return score;
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(value)}([^a-z0-9]|$)`, 'g');
    const matches = haystack.match(pattern);
    return score + (matches ? matches.length : 0);
  }, 0);
}

function classifyCategory(video, summaryMarkdown = '') {
  const source = normalizeSource(video);
  const title = `${source.title || ''}\n${source.byline || ''}`;
  const body = `${summaryMarkdown || ''}\n${source.text || ''}`;
  const fullText = `${title}\n${body}`;
  const politicalTerms = ['election', 'president', 'congress', 'senate', 'government', 'policy', 'political', 'politics', 'democrat', 'republican', 'trump', 'biden', 'parliament', 'minister', 'sanctions', 'immigration', 'campaign', 'legislation', 'lawmakers'];
  const geopoliticalTerms = ['war', 'ukraine', 'israel', 'gaza', 'china', 'russia'];
  const politicalScore = scoreCategory(fullText, politicalTerms) + scoreCategory(title, geopoliticalTerms) + Math.floor(scoreCategory(body, geopoliticalTerms) / 2);
  const categoryRules = [
    ['Coding', ['coding', 'code', 'software', 'programming', 'developer', 'javascript', 'python', 'typescript', 'app', 'api', 'github', 'terminal', 'bug', 'debug', 'framework', 'react', 'node.js', 'database', 'frontend', 'backend']],
    ['Educational', ['learn', 'course', 'lesson', 'tutorial', 'school', 'university', 'student', 'teach', 'education', 'educational', 'explain', 'guide', 'how to', 'walkthrough', 'beginner']],
    ['AI', ['ai', 'artificial intelligence', 'llm', 'openai', 'anthropic', 'gemini', 'deepseek', 'qwen', 'model', 'neural', 'agent', 'prompt', 'machine learning']],
    ['Finance', ['market', 'stocks', 'investing', 'crypto', 'bitcoin', 'inflation', 'interest rate', 'fed', 'recession', 'trading', 'portfolio', 'mortgage']],
    ['Business', ['startup', 'business', 'sales', 'marketing', 'revenue', 'customer', 'founder', 'product', 'pricing', 'company', 'acquisition']],
    ['Health', ['health', 'medical', 'doctor', 'disease', 'medicine', 'diet', 'exercise', 'sleep', 'mental health', 'therapy', 'nutrition']],
    ['Science', ['science', 'physics', 'biology', 'chemistry', 'climate', 'space', 'research', 'study', 'experiment', 'energy']],
    ['General', ['movie', 'film', 'music', 'celebrity', 'culture', 'art', 'anime', 'manga', 'manhwa', 'game', 'story', 'media', 'life', 'productivity', 'opinion', 'commentary']],
  ];

  let best = ['General', 0];
  for (const [category, words] of categoryRules) {
    const score = scoreCategory(fullText, words);
    if (score > best[1]) best = [category, score];
  }

  if (politicalScore >= 2 && politicalScore >= best[1]) return 'Political';
  return best[1] > 0 ? best[0] : 'General';
}

function normalizeSource(video = {}) {
  const sourceType = video.sourceType === 'webpage' ? 'webpage' : 'youtube';
  const text = String(video.text || video.transcript || '').trim();
  const siteName = String(video.siteName || '').trim();
  const author = String(video.author || '').trim();
  const channel = String(video.channel || '').trim();
  const byline = sourceType === 'webpage' ? (author || siteName || 'Web Page') : (channel || 'YouTube Channel');
  const sourceId = sourceType === 'webpage' ? (video.sourceId || video.url || '') : (video.videoId || '');
  return {
    ...video,
    sourceType,
    sourceLabel: sourceType === 'webpage' ? 'webpage' : 'youtube',
    title: String(video.title || (sourceType === 'webpage' ? 'Untitled Page' : 'Untitled Video')).trim(),
    byline,
    channel: sourceType === 'youtube' ? byline : '',
    siteName,
    author,
    url: String(video.url || '').trim(),
    sourceId: String(sourceId || '').trim(),
    videoId: sourceType === 'youtube' ? String(video.videoId || '').trim() : '',
    text,
    transcript: sourceType === 'youtube' ? text : '',
  };
}

function buildPrompt(video) {
  const source = normalizeSource(video);
  if (source.sourceType === 'webpage') return buildWebpagePrompt(source);
  return buildYouTubePrompt(source);
}

function systemPromptFor(video) {
  const source = normalizeSource(video);
  if (source.sourceType === 'webpage') {
    return 'You write accurate, concrete webpage/article analysis in Markdown for private research notes. Prioritize specificity, argument structure, and practical implications. For sensitive topics, summarize neutrally instead of refusing.';
  }
  return 'You write accurate, concrete YouTube transcript analysis in Markdown for private research notes. Prioritize specificity, argument structure, and practical implications. For sensitive topics, summarize neutrally instead of refusing.';
}

function buildYouTubePrompt(video) {
  return `You are turning a YouTube transcript into Jaime's Obsidian research notes.

Write a clear, structured analysis in the style of a concise analyst brief. The note should be easy to scan later: short sections, labeled bullets, concrete facts, and no bloated commentary.

Return clean Markdown only. Use this exact structure and headings:

# ${video.title}

## Takeaways
- 6-8 high-signal bullets.
- Start each bullet with a short bold label, then a colon, then the actual takeaway.
- Each bullet should make a specific claim from the video, not a generic topic label.
- Include concrete names, numbers, dates, tools, examples, causal claims, or quoted phrases when they matter.

## Key Points
- Group the main argument into 3-6 logical subheadings using "### A. ...", "### B. ...", etc.
- Under each subheading, use labeled bullets in the same "Label: explanation" style.
- Merge repeated transcript fragments, but preserve the important sequence of the argument.
- Capture the speaker's reasoning, evidence, examples, tensions, warnings, recommendations, and counterintuitive points.
- Preserve enough context that the note is useful without reopening the video.

### Final Observation
- End with one short paragraph synthesizing the broader implication or unresolved question.

Skip sponsor chatter, filler, repeated intros/outros, and generic motivational language.
Do not invent details that are not in the transcript. If the transcript is thin or noisy, say so briefly.
Summarize sensitive or political material neutrally and factually rather than refusing.

Video metadata:
Title: ${video.title}
Channel: ${video.channel || 'Unknown'}
URL: ${video.url}

Transcript:
${video.transcript}`;
}

function buildWebpagePrompt(source) {
  return `You are turning extracted webpage/article text into Jaime's Obsidian research notes.

Write a clear, structured analysis in the style of a concise analyst brief. The note should be easy to scan later: short sections, labeled bullets, concrete facts, and no bloated commentary.

Return clean Markdown only. Use this exact structure and headings:

# ${source.title}

## Takeaways
- 6-8 high-signal bullets.
- Start each bullet with a short bold label, then a colon, then the actual takeaway.
- Each bullet should make a specific claim from the page, not a generic topic label.
- Include concrete names, numbers, dates, tools, examples, causal claims, or quoted phrases when they matter.

## Key Points
- Group the main argument into 3-6 logical subheadings using "### A. ...", "### B. ...", etc.
- Under each subheading, use labeled bullets in the same "Label: explanation" style.
- Preserve the important sequence of the article or page argument.
- Capture the author's reasoning, evidence, examples, tensions, warnings, recommendations, and counterintuitive points.
- Preserve enough context that the note is useful without reopening the page.

### Final Observation
- End with one short paragraph synthesizing the broader implication or unresolved question.

Skip navigation text, ads, related links, cookie prompts, newsletter prompts, comments, and other page chrome if any slipped into the extraction.
Do not invent details that are not in the source text. If the source text is thin or noisy, say so briefly.
Summarize sensitive or political material neutrally and factually rather than refusing.

Page metadata:
Title: ${source.title}
Author/Site: ${source.byline}
URL: ${source.url}

Extracted page text:
${source.text}`;
}

async function requestOpenRouter({ video, model }) {
  const source = normalizeSource(video);
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY. Add it to ~/.hermes/.env or macOS Keychain service openrouter.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(OPENROUTER_TIMEOUT_MS) ? OPENROUTER_TIMEOUT_MS : 45000);
  const startedAt = Date.now();
  logNative('openrouter request start', { model, timeoutMs: OPENROUTER_TIMEOUT_MS });
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': source.url || 'https://www.youtube.com/',
      'X-Title': source.sourceType === 'webpage' ? 'Webpage Summary Overlay' : 'YouTube Summary Overlay',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPromptFor(source) },
        { role: 'user', content: buildPrompt(source) },
      ],
      temperature: 0.2,
      max_tokens: 2600,
    }),
  }).finally(() => clearTimeout(timeout));
  logNative('openrouter response received', { model, status: response.status, ms: Date.now() - startedAt });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.metadata?.raw || data?.error?.message || data?.message || response.statusText;
    throw new Error(`OpenRouter ${response.status}: ${message}`);
  }

  const markdown = data?.choices?.[0]?.message?.content?.trim();
  if (!markdown) throw new Error('OpenRouter returned an empty summary.');
  return { markdown, model, usage: data.usage || null };
}

async function callOpenRouter({ video, model = DEFAULT_MODEL }) {
  try {
    return await requestOpenRouter({ video, model });
  } catch (error) {
    if (FALLBACK_SOURCE_MODELS.has(model) && error?.name === 'AbortError') {
      logNative('openrouter model timed out, falling back', { model, fallbackModel: FALLBACK_MODEL, timeoutMs: OPENROUTER_TIMEOUT_MS });
      return requestOpenRouter({ video, model: FALLBACK_MODEL });
    }
    if (error?.name === 'AbortError') {
      throw new Error(`OpenRouter timed out after ${OPENROUTER_TIMEOUT_MS}ms for ${model}.`);
    }
    throw error;
  }
}

function buildMarkdown({ video, summaryMarkdown, model, usage, category }) {
  const source = normalizeSource(video);
  const generatedAt = new Date().toISOString();
  const body = summaryMarkdown.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const safeCategory = CATEGORIES.includes(category) ? category : classifyCategory(source, body);
  const idLine = source.sourceType === 'youtube' ? `video_id: ${JSON.stringify(source.videoId || '')}\n` : `source_id: ${JSON.stringify(source.sourceId || '')}\n`;
  const bylineKey = source.sourceType === 'youtube' ? 'channel' : 'byline';
  const sourceTextSection = buildSourceTextSection(source);
  return `---\nsource: ${source.sourceLabel}\ntitle: ${JSON.stringify(source.title)}\n${bylineKey}: ${JSON.stringify(source.byline)}\nurl: ${JSON.stringify(source.url)}\n${idLine}category: ${JSON.stringify(safeCategory)}\nmodel: ${JSON.stringify(model || DEFAULT_MODEL)}\ngenerated_at: ${JSON.stringify(generatedAt)}\nusage: ${JSON.stringify(usage || {})}\n---\n\n${body}\n\n## Source\n\n- ${source.sourceType === 'youtube' ? 'Channel' : 'Author/Site'}: ${source.byline}\n- URL: ${source.url}\n- Category: ${safeCategory}\n- Saved: ${generatedAt}${sourceTextSection}\n`;
}

function buildTranscriptSection(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return '';
  return `\n\n## Transcript\n\n${text}\n`;
}

function buildSourceTextSection(video) {
  const source = normalizeSource(video);
  if (source.sourceType === 'youtube') return buildTranscriptSection(source.text);
  if (!source.text) return '';
  return `\n\n## Source Text\n\n${source.text}\n`;
}

function ensureSourceTextSection(markdown, video) {
  const text = String(markdown || '');
  const source = normalizeSource(video);
  if (!source.text) return text;
  if (source.sourceType === 'youtube' && /^## Transcript\s*$/im.test(text)) return text;
  if (source.sourceType === 'webpage' && /^## Source Text\s*$/im.test(text)) return text;
  return `${text.replace(/\s*$/, '')}${buildSourceTextSection(source)}`;
}

function outputPathFor(video, outputDir = DEFAULT_OUTPUT_DIR, category = 'General') {
  const source = normalizeSource(video);
  const date = isoDate();
  const title = sanitizeFilePart(source.title, source.sourceType === 'webpage' ? 'webpage-summary' : 'youtube-summary');
  const byline = sanitizeFilePart(source.byline, source.sourceType === 'webpage' ? 'webpage' : 'youtube-channel');
  const folder = CATEGORIES.includes(category) ? category : 'Others';
  return path.join(outputDir, folder, `${date} - ${byline} - ${title}.md`);
}

function updateMarkdownCategory(markdown, category) {
  const safeCategory = CATEGORIES.includes(category) ? category : 'Others';
  const categoryLine = `category: ${JSON.stringify(safeCategory)}`;
  const text = String(markdown || '');

  if (/^---\n[\s\S]*?\n---\n?/.test(text)) {
    const end = text.indexOf('\n---', 4);
    const frontmatter = text.slice(4, end);
    const body = text.slice(end);
    const updatedFrontmatter = /^category:\s*.*$/m.test(frontmatter)
      ? frontmatter.replace(/^category:\s*.*$/m, categoryLine)
      : `${frontmatter.replace(/\n?$/, '\n')}${categoryLine}`;
    return `---\n${updatedFrontmatter}${body}`;
  }

  return `---\ncategory: ${JSON.stringify(safeCategory)}\n---\n\n${text}`;
}

function isSafePreviousPath(previousPath, outputDir) {
  if (!previousPath) return false;
  const resolvedOutput = path.resolve(outputDir);
  const resolvedPrevious = path.resolve(previousPath);
  return resolvedPrevious.startsWith(`${resolvedOutput}${path.sep}`) && resolvedPrevious.endsWith('.md');
}

function saveMarkdown({ video, markdown, outputDir = DEFAULT_OUTPUT_DIR, category, previousPath }) {
  const safeCategory = CATEGORIES.includes(category) ? category : classifyCategory(video, markdown);
  const markdownWithCategory = ensureSourceTextSection(updateMarkdownCategory(markdown, safeCategory), video);
  const targetPath = outputPathFor(video, outputDir, safeCategory);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, markdownWithCategory.endsWith('\n') ? markdownWithCategory : `${markdownWithCategory}\n`, 'utf8');

  if (isSafePreviousPath(previousPath, outputDir) && path.resolve(previousPath) !== path.resolve(targetPath) && fs.existsSync(previousPath)) {
    fs.unlinkSync(previousPath);
  }

  return { ok: true, path: targetPath, category: safeCategory, markdown: markdownWithCategory };
}

async function summarizeAndSave({ video, model = DEFAULT_MODEL, outputDir = DEFAULT_OUTPUT_DIR }) {
  const source = normalizeSource(video);
  if (!source.text) throw new Error(source.sourceType === 'webpage' ? 'No webpage text provided.' : 'No transcript provided.');
  const result = await callOpenRouter({ video: source, model });
  const category = classifyCategory(source, result.markdown);
  const markdown = buildMarkdown({ video: source, summaryMarkdown: result.markdown, model: result.model, usage: result.usage, category });
  const saved = saveMarkdown({ video: source, markdown, outputDir, category });
  return { ok: true, markdown, path: saved.path, category: saved.category, model: result.model, usage: result.usage };
}

module.exports = {
  CATEGORIES,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  DEFAULT_OUTPUT_DIR,
  buildMarkdown,
  buildPrompt,
  callOpenRouter,
  classifyCategory,
  getOpenRouterApiKey,
  normalizeSource,
  outputPathFor,
  saveMarkdown,
  summarizeAndSave,
  systemPromptFor,
  updateMarkdownCategory,
};
