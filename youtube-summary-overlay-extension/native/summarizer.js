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
  const title = `${video?.title || ''}\n${video?.channel || ''}`;
  const body = `${summaryMarkdown || ''}\n${video?.transcript || ''}`;
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

function buildPrompt(video) {
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

async function requestOpenRouter({ video, model }) {
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
      'HTTP-Referer': 'https://www.youtube.com/',
      'X-Title': 'YouTube Summary Overlay',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You write accurate, concrete YouTube transcript analysis in Markdown for private research notes. Prioritize specificity, argument structure, and practical implications. For sensitive topics, summarize neutrally instead of refusing.' },
        { role: 'user', content: buildPrompt(video) },
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
  const generatedAt = new Date().toISOString();
  const body = summaryMarkdown.replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const safeCategory = CATEGORIES.includes(category) ? category : classifyCategory(video, body);
  const transcriptSection = buildTranscriptSection(video?.transcript);
  return `---\nsource: youtube\ntitle: ${JSON.stringify(video.title)}\nchannel: ${JSON.stringify(video.channel || 'YouTube Channel')}\nurl: ${JSON.stringify(video.url)}\nvideo_id: ${JSON.stringify(video.videoId || '')}\ncategory: ${JSON.stringify(safeCategory)}\nmodel: ${JSON.stringify(model || DEFAULT_MODEL)}\ngenerated_at: ${JSON.stringify(generatedAt)}\nusage: ${JSON.stringify(usage || {})}\n---\n\n${body}\n\n## Source\n\n- Channel: ${video.channel || 'YouTube Channel'}\n- URL: ${video.url}\n- Category: ${safeCategory}\n- Saved: ${generatedAt}${transcriptSection}\n`;
}

function buildTranscriptSection(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return '';
  return `\n\n## Transcript\n\n${text}\n`;
}

function ensureTranscriptSection(markdown, video) {
  const text = String(markdown || '');
  if (!String(video?.transcript || '').trim() || /^## Transcript\s*$/im.test(text)) return text;
  return `${text.replace(/\s*$/, '')}${buildTranscriptSection(video.transcript)}`;
}

function outputPathFor(video, outputDir = DEFAULT_OUTPUT_DIR, category = 'General') {
  const date = isoDate();
  const title = sanitizeFilePart(video.title, 'youtube-summary');
  const channel = sanitizeFilePart(video.channel, 'youtube-channel');
  const folder = CATEGORIES.includes(category) ? category : 'Others';
  return path.join(outputDir, folder, `${date} - ${channel} - ${title}.md`);
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
  const markdownWithCategory = ensureTranscriptSection(updateMarkdownCategory(markdown, safeCategory), video);
  const targetPath = outputPathFor(video, outputDir, safeCategory);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, markdownWithCategory.endsWith('\n') ? markdownWithCategory : `${markdownWithCategory}\n`, 'utf8');

  if (isSafePreviousPath(previousPath, outputDir) && path.resolve(previousPath) !== path.resolve(targetPath) && fs.existsSync(previousPath)) {
    fs.unlinkSync(previousPath);
  }

  return { ok: true, path: targetPath, category: safeCategory, markdown: markdownWithCategory };
}

async function summarizeAndSave({ video, model = DEFAULT_MODEL, outputDir = DEFAULT_OUTPUT_DIR }) {
  if (!video?.transcript) throw new Error('No transcript provided.');
  const result = await callOpenRouter({ video, model });
  const category = classifyCategory(video, result.markdown);
  const markdown = buildMarkdown({ video, summaryMarkdown: result.markdown, model: result.model, usage: result.usage, category });
  const saved = saveMarkdown({ video, markdown, outputDir, category });
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
  outputPathFor,
  saveMarkdown,
  summarizeAndSave,
  updateMarkdownCategory,
};
