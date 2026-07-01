const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_MODEL = 'openrouter/free';
const FALLBACK_MODEL = 'mistralai/mistral-small-24b-instruct-2501';
const CONTEXT_LENGTH_FALLBACK_MODEL = 'google/gemini-2.5-flash-lite';
const PREVIOUS_DEFAULT_MODELS = new Set(['nvidia/nemotron-3-ultra-550b-a55b:free', 'mistralai/mistral-nemo']);
const FALLBACK_SOURCE_MODELS = new Set(['openrouter/free', 'nvidia/nemotron-3-ultra-550b-a55b:free']);
const OPENROUTER_TIMEOUT_MS = Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS || '120000', 10);
const OPENROUTER_MAX_TOKENS = Number.parseInt(process.env.OPENROUTER_MAX_TOKENS || '2600', 10);
const YTDLP_TRANSCRIPT_TIMEOUT_MS = Number.parseInt(process.env.YTDLP_TRANSCRIPT_TIMEOUT_MS || '90000', 10);
const YTDLP_TRANSCRIPT_LANGS = process.env.YTDLP_TRANSCRIPT_LANGS || 'en,en-orig,en-en,en-US,en-GB';
const YTDLP_TRANSCRIPT_FORMAT = process.env.YTDLP_TRANSCRIPT_FORMAT || 'json3';
const DEFAULT_OUTPUT_DIR = '/Users/opita/Documents/Obsidian/youtube-summaries';
const SUMMARY_INDEX_FILE = '.summary-index.json';
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

function securityKeychainLookup(service, account = 'opita') {
  try {
    return execFileSync('/usr/bin/security', [
      'find-generic-password',
      '-a', account,
      '-s', service,
      '-w',
      '/Users/opita/Library/Keychains/login.keychain-db',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function getYoutubeBwsAccessToken() {
  return process.env.YOUTUBE_BWS_ACCESS_TOKEN || securityKeychainLookup(process.env.YOUTUBE_BWS_KEYCHAIN_SERVICE || 'youtube-bws-access-token');
}

function bwsSecretMap() {
  const token = getYoutubeBwsAccessToken();
  if (!token) return {};
  try {
    const env = { ...process.env, BWS_ACCESS_TOKEN: token };
    const listRaw = execFileSync('/Users/opita/.hermes/bin/bws', ['secret', 'list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env,
    });
    const wanted = new Set(['OPENROUTER_API_KEY', 'OPENROUTER_KEY_YOUTUBE']);
    const out = {};
    for (const item of JSON.parse(listRaw || '[]')) {
      const key = item.key || item.name;
      if (!wanted.has(key) || !item.id) continue;
      const gotRaw = execFileSync('/Users/opita/.hermes/bin/bws', ['secret', 'get', item.id], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env,
      });
      const value = String(JSON.parse(gotRaw || '{}').value || '').trim();
      if (value) out[key] = value;
    }
    if (!out.OPENROUTER_API_KEY && out.OPENROUTER_KEY_YOUTUBE) out.OPENROUTER_API_KEY = out.OPENROUTER_KEY_YOUTUBE;
    return out;
  } catch {
    return {};
  }
}

function getOpenRouterApiKey() {
  const env = {
    ...loadDotEnv(path.join(os.homedir(), '.hermes', '.env')),
    ...process.env,
  };
  const bws = bwsSecretMap();
  return env.OPENROUTER_API_KEY || env.OPENROUTER_APIKEY || bws.OPENROUTER_API_KEY || '';
}

function logNative(message, details = {}) {
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.error(`[youtube-summary] ${new Date().toISOString()} ${message}${suffix}`);
}

function effectiveModel(model) {
  return model && !PREVIOUS_DEFAULT_MODELS.has(model) ? model : DEFAULT_MODEL;
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

function parseFrontmatter(markdown) {
  const text = String(markdown || '');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    }
    data[key] = value;
  }
  return data;
}

function indexPathFor(outputDir = DEFAULT_OUTPUT_DIR) {
  return path.join(outputDir, SUMMARY_INDEX_FILE);
}

function readSummaryIndex(outputDir = DEFAULT_OUTPUT_DIR) {
  const indexPath = indexPathFor(outputDir);
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8')) || {};
  } catch (error) {
    if (isPermissionError(error)) throw obsidianAccessError(error, outputDir);
    return {};
  }
}
function writeSummaryIndex(index, outputDir = DEFAULT_OUTPUT_DIR) {
  ensureOutputDirAccessible(outputDir);
  const indexPath = indexPathFor(outputDir);
  try {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  } catch (error) {
    if (isPermissionError(error)) throw obsidianAccessError(error, outputDir);
    throw error;
  }
}
function relativeSummaryPath(filePath, outputDir = DEFAULT_OUTPUT_DIR) {
  return path.relative(outputDir, filePath).split(path.sep).join('/');
}

function absoluteSummaryPath(indexEntryPath, outputDir = DEFAULT_OUTPUT_DIR) {
  if (!indexEntryPath) return '';
  return path.isAbsolute(indexEntryPath) ? indexEntryPath : path.join(outputDir, indexEntryPath);
}

function isPermissionError(error) {
  return ['EACCES', 'EPERM'].includes(error?.code);
}

function obsidianAccessError(error, outputDir = DEFAULT_OUTPUT_DIR) {
  const message = [
    'Cannot access the Obsidian summary folder: ' + outputDir,
    (error.code || 'Error') + ': ' + error.message,
    'macOS privacy permissions are blocking the native host from reading/writing this folder.',
    'Fix: grant Full Disk Access / Files and Folders access to the browser that launched the extension (Safari/Brave/Chrome) and Terminal/Node if you run tests manually, then reload the browser extension.',
  ].join(' ');
  const friendly = new Error(message);
  friendly.code = error.code;
  friendly.cause = error;
  return friendly;
}

function ensureOutputDirAccessible(outputDir = DEFAULT_OUTPUT_DIR) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.accessSync(outputDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    if (isPermissionError(error)) throw obsidianAccessError(error, outputDir);
    throw error;
  }
}

function listMarkdownFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        listMarkdownFiles(fullPath, results);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath);
      }
    }
    return results;
  } catch (error) {
    if (isPermissionError(error)) throw obsidianAccessError(error, dir);
    throw error;
  }
}
function summaryPayloadFromFile(filePath, outputDir = DEFAULT_OUTPUT_DIR) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(markdown);
  const videoId = String(frontmatter.video_id || '').trim();
  if (!videoId) return null;
  const category = CATEGORIES.includes(frontmatter.category) ? frontmatter.category : 'General';
  const video = {
    title: String(frontmatter.title || 'Untitled Video'),
    channel: String(frontmatter.channel || 'YouTube Channel'),
    url: String(frontmatter.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '')),
    videoId,
    transcript: '',
  };
  return {
    ok: true,
    found: true,
    markdown: stripSourceTextSection(markdown, video),
    path: filePath,
    relativePath: relativeSummaryPath(filePath, outputDir),
    category,
    model: String(frontmatter.model || DEFAULT_MODEL),
    generatedAt: String(frontmatter.generated_at || ''),
    video,
  };
}

function updateSummaryIndexForFile(filePath, outputDir = DEFAULT_OUTPUT_DIR) {
  const payload = summaryPayloadFromFile(filePath, outputDir);
  if (!payload?.video?.videoId) return;
  const index = readSummaryIndex(outputDir);
  index[payload.video.videoId] = {
    path: payload.relativePath,
    title: payload.video.title,
    channel: payload.video.channel,
    url: payload.video.url,
    category: payload.category,
    model: payload.model,
    generated_at: payload.generatedAt,
    indexed_at: new Date().toISOString(),
  };
  writeSummaryIndex(index, outputDir);
}

function findExistingSummary({ videoId, outputDir = DEFAULT_OUTPUT_DIR }) {
  const id = String(videoId || '').trim();
  if (!id) return { ok: true, found: false };
  ensureOutputDirAccessible(outputDir);

  const index = readSummaryIndex(outputDir);
  const indexedPath = absoluteSummaryPath(index[id]?.path, outputDir);
  if (indexedPath && fs.existsSync(indexedPath)) {
    const payload = summaryPayloadFromFile(indexedPath, outputDir);
    if (payload?.video?.videoId === id) return payload;
  }

  for (const filePath of listMarkdownFiles(outputDir)) {
    let payload = null;
    try {
      payload = summaryPayloadFromFile(filePath, outputDir);
    } catch {
      continue;
    }
    if (payload?.video?.videoId === id) {
      updateSummaryIndexForFile(filePath, outputDir);
      return payload;
    }
  }

  if (index[id]) {
    delete index[id];
    writeSummaryIndex(index, outputDir);
  }
  return { ok: true, found: false };
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

function youtubeVideoUrl({ videoId, url } = {}) {
  const explicitId = String(videoId || '').trim();
  if (/^[A-Za-z0-9_-]{6,}$/.test(explicitId)) return `https://www.youtube.com/watch?v=${explicitId}`;
  try {
    const parsed = new URL(String(url || '').trim());
    const fromWatch = parsed.hostname.endsWith('youtube.com') ? parsed.searchParams.get('v') : '';
    const fromShort = parsed.hostname === 'youtu.be' ? parsed.pathname.split('/').filter(Boolean)[0] : '';
    const found = fromWatch || fromShort;
    if (/^[A-Za-z0-9_-]{6,}$/.test(found || '')) return `https://www.youtube.com/watch?v=${found}`;
  } catch {}
  throw new Error('Missing YouTube video id for transcript fallback.');
}

function cleanTranscriptSegment(value) {
  return String(value || '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/^\s*(?:(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(?:hours?|minutes?|seconds?)\b[\s,]*(?:and\s*)?)+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function transcriptFromJson3(data) {
  return (data?.events || [])
    .map((event) => (event.segs || []).map((seg) => seg.utf8 || '').join(''))
    .map(cleanTranscriptSegment)
    .filter(Boolean)
    .join(' ');
}

function transcriptFromXml(text) {
  return Array.from(String(text || '').matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi))
    .map((match) => cleanTranscriptSegment(decodeXmlEntities(match[1].replace(/<[^>]+>/g, ' '))))
    .filter(Boolean)
    .join(' ');
}

function transcriptFromVtt(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^WEBVTT\b/i.test(line))
    .filter((line) => !/^NOTE\b|^STYLE\b|^REGION\b/i.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/-->|align:|position:|line:/i.test(line))
    .map((line) => cleanTranscriptSegment(line.replace(/<[^>]+>/g, ' ')))
    .filter(Boolean)
    .join(' ');
}

function transcriptFromSubtitleText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) return transcriptFromJson3(JSON.parse(trimmed));
  if (/^WEBVTT\b/i.test(trimmed) || /-->/m.test(trimmed)) return transcriptFromVtt(trimmed);
  return transcriptFromXml(trimmed);
}

function ytdlpCandidates() {
  return [
    process.env.YTDLP_BIN,
    '/Users/opita/.local/bin/yt-dlp',
    'yt-dlp',
  ].filter(Boolean).filter((candidate, index, list) => list.indexOf(candidate) === index);
}

function readSubtitleCandidates(dir) {
  return fs.readdirSync(dir)
    .filter((file) => /\.(?:json3|vtt|srv3|xml|ttml|srt)$/i.test(file))
    .map((file) => {
      const filePath = path.join(dir, file);
      try {
        const transcript = transcriptFromSubtitleText(fs.readFileSync(filePath, 'utf8'));
        return { file, transcript, chars: transcript.length };
      } catch (error) {
        return { file, transcript: '', chars: 0, error: error.message };
      }
    })
    .filter((candidate) => candidate.chars >= 50)
    .sort((left, right) => right.chars - left.chars);
}

function fetchTranscript({ videoId, url } = {}) {
  const watchUrl = youtubeVideoUrl({ videoId, url });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-summary-transcript-'));
  const args = [
    '--skip-download',
    '--no-playlist',
    '--no-warnings',
    '--write-auto-subs',
    '--write-subs',
    '--sub-langs', YTDLP_TRANSCRIPT_LANGS,
    '--sub-format', YTDLP_TRANSCRIPT_FORMAT,
    '--output', path.join(tmpDir, '%(id)s.%(ext)s'),
    watchUrl,
  ];
  let lastError = null;
  try {
    for (const candidate of ytdlpCandidates()) {
      try {
        execFileSync(candidate, args, {
          encoding: 'utf8',
          timeout: YTDLP_TRANSCRIPT_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (readSubtitleCandidates(tmpDir).length) break;
      }
    }

    const subtitles = readSubtitleCandidates(tmpDir);
    if (!subtitles.length) {
      const detail = lastError?.stderr || lastError?.message || 'yt-dlp did not produce a usable English subtitle file.';
      throw new Error(`Transcript fallback failed: ${String(detail).trim().slice(0, 500)}`);
    }
    const best = subtitles[0];
    return { ok: true, transcript: best.transcript, source: 'yt-dlp', file: best.file, chars: best.chars };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
  let response;
  let data;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: Number.isFinite(OPENROUTER_MAX_TOKENS) ? OPENROUTER_MAX_TOKENS : 2600,
      }),
    });
    logNative('openrouter response received', { model, status: response.status, ms: Date.now() - startedAt });
    data = await readOpenRouterJson(response);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const message = data?.error?.metadata?.raw || data?.error?.message || data?.message || response.statusText;
    throw new Error(`OpenRouter ${response.status}: ${message}`);
  }

  const choice = data?.choices?.[0] || {};
  const markdown = extractSummaryContent(choice.message);
  if (!markdown) {
    logNative('openrouter returned empty summary', {
      model,
      finishReason: choice.finish_reason || '',
      choiceCount: Array.isArray(data?.choices) ? data.choices.length : 0,
    });
    throw emptySummaryError({ model, data });
  }
  return { markdown, model, usage: data.usage || null };
}

async function readOpenRouterJson(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`OpenRouter returned an unreadable response body: ${error?.message || String(error)}`);
  }
}

function isContextLengthError(error) {
  return /maximum context length|context length|requested about \d+ tokens/i.test(String(error?.message || ''));
}

function extractSummaryContent(message = {}) {
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

function emptySummaryError({ model, data }) {
  const choice = data?.choices?.[0] || {};
  const error = new Error('OpenRouter returned an empty summary.');
  error.name = 'EmptySummaryError';
  error.model = model;
  error.finishReason = choice.finish_reason || '';
  error.choiceCount = Array.isArray(data?.choices) ? data.choices.length : 0;
  return error;
}

function isEmptySummaryError(error) {
  return error?.name === 'EmptySummaryError';
}

async function callOpenRouter({ video, model = DEFAULT_MODEL }) {
  const selectedModel = effectiveModel(model);
  try {
    return await requestOpenRouter({ video, model: selectedModel });
  } catch (error) {
    if (selectedModel !== CONTEXT_LENGTH_FALLBACK_MODEL && isContextLengthError(error)) {
      logNative('openrouter context too long, falling back', { model: selectedModel, fallbackModel: CONTEXT_LENGTH_FALLBACK_MODEL });
      return requestOpenRouter({ video, model: CONTEXT_LENGTH_FALLBACK_MODEL });
    }
    if (isEmptySummaryError(error)) {
      logNative('openrouter empty summary, retrying model once', {
        model: selectedModel,
        finishReason: error.finishReason,
        choiceCount: error.choiceCount,
      });
      try {
        return await requestOpenRouter({ video, model: selectedModel });
      } catch (retryError) {
        if (isEmptySummaryError(retryError) && selectedModel !== CONTEXT_LENGTH_FALLBACK_MODEL) {
          logNative('openrouter empty summary retry failed, falling back', {
            model: selectedModel,
            fallbackModel: CONTEXT_LENGTH_FALLBACK_MODEL,
            finishReason: retryError.finishReason,
            choiceCount: retryError.choiceCount,
          });
          return requestOpenRouter({ video, model: CONTEXT_LENGTH_FALLBACK_MODEL });
        }
        throw retryError;
      }
    }
    if (FALLBACK_SOURCE_MODELS.has(selectedModel) && error?.name === 'AbortError') {
      logNative('openrouter model timed out, falling back', { model: selectedModel, fallbackModel: FALLBACK_MODEL, timeoutMs: OPENROUTER_TIMEOUT_MS });
      return requestOpenRouter({ video, model: FALLBACK_MODEL });
    }
    if (error?.name === 'AbortError') {
      throw new Error(`OpenRouter timed out after ${OPENROUTER_TIMEOUT_MS}ms for ${selectedModel}.`);
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

function stripSourceTextSection(markdown, video) {
  const source = normalizeSource(video);
  const heading = source.sourceType === 'youtube' ? 'Transcript' : 'Source Text';
  const pattern = new RegExp(`\\n\\n## ${escapeRegExp(heading)}\\n\\n[\\s\\S]*$`);
  return String(markdown || '').replace(pattern, '').trim();
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
  ensureOutputDirAccessible(outputDir);
  const safeCategory = CATEGORIES.includes(category) ? category : classifyCategory(video, markdown);
  const markdownWithCategory = ensureSourceTextSection(updateMarkdownCategory(markdown, safeCategory), video);
  const targetPath = outputPathFor(video, outputDir, safeCategory);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, markdownWithCategory.endsWith('\n') ? markdownWithCategory : `${markdownWithCategory}\n`, 'utf8');
  updateSummaryIndexForFile(targetPath, outputDir);

  if (isSafePreviousPath(previousPath, outputDir) && path.resolve(previousPath) !== path.resolve(targetPath) && fs.existsSync(previousPath)) {
    fs.unlinkSync(previousPath);
    const index = readSummaryIndex(outputDir);
    const source = normalizeSource(video);
    if (source.videoId && index[source.videoId]?.path === relativeSummaryPath(previousPath, outputDir)) {
      delete index[source.videoId];
      writeSummaryIndex(index, outputDir);
    }
  }

  return { ok: true, path: targetPath, category: safeCategory, markdown: stripSourceTextSection(markdownWithCategory, video) };
}

async function summarizeAndSave({ video, model = DEFAULT_MODEL, outputDir = DEFAULT_OUTPUT_DIR }) {
  const source = normalizeSource(video);
  if (!source.text) throw new Error(source.sourceType === 'webpage' ? 'No webpage text provided.' : 'No transcript provided.');
  const result = await callOpenRouter({ video: source, model: effectiveModel(model) });
  const category = classifyCategory(source, result.markdown);
  const markdown = buildMarkdown({ video: source, summaryMarkdown: result.markdown, model: result.model, usage: result.usage, category });
  const saved = saveMarkdown({ video: source, markdown, outputDir, category });
  return { ok: true, markdown: stripSourceTextSection(markdown, source), path: saved.path, category: saved.category, model: result.model, usage: result.usage };
}

module.exports = {
  CATEGORIES,
  CONTEXT_LENGTH_FALLBACK_MODEL,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  DEFAULT_OUTPUT_DIR,
  buildMarkdown,
  buildPrompt,
  callOpenRouter,
  classifyCategory,
  fetchTranscript,
  findExistingSummary,
  getOpenRouterApiKey,
  normalizeSource,
  outputPathFor,
  saveMarkdown,
  stripSourceTextSection,
  summarizeAndSave,
  systemPromptFor,
  transcriptFromSubtitleText,
  updateMarkdownCategory,
};
