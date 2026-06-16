const HOST_NAME = 'com.opita.youtube_summary_sidepanel';
const DEFAULT_MODEL = 'mistralai/mistral-small-24b-instruct-2501';
const PREVIOUS_DEFAULT_MODELS = new Set(['nvidia/nemotron-3-ultra-550b-a55b:free']);
const NATIVE_MESSAGE_TIMEOUT_MS = 45000;
const OPENROUTER_TIMEOUT_MS = 45000;
const OPENROUTER_MAX_TOKENS = 2600;
const STORAGE_OPERATION_TIMEOUT_MS = 1500;
const OPENROUTER_API_KEY_STORAGE_KEYS = ['openRouterApiKey', 'OPENROUTER_API_KEY'];

const AI_PLATFORMS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?model=gpt-4o-mini&quicktube' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/chats' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app?quicktube=' },
  { id: 'mistral', name: 'Mistral', url: 'https://chat.mistral.ai/chat?quicktube' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/?quicktube' },
];

const CATEGORIES = ['Political', 'Coding', 'Educational', 'General', 'Business', 'AI', 'Finance', 'Health', 'Science', 'Others'];

function effectiveModel(model) {
  return model && !PREVIOUS_DEFAULT_MODELS.has(model) ? model : DEFAULT_MODEL;
}

function storageGet(storage, key, timeoutMs = STORAGE_OPERATION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!storage?.get) {
      resolve({});
      return;
    }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('storage.get timed out')), timeoutMs);
    try {
      const maybePromise = storage.get(key, (data) => finish(resolve, data || {}));
      if (maybePromise?.then) {
        maybePromise.then(
          (data) => finish(resolve, data || {}),
          (error) => finish(reject, error)
        );
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function getDirectOpenRouterApiKey() {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage?.get) return '';
  const data = await storageGet(storage, OPENROUTER_API_KEY_STORAGE_KEYS);
  for (const key of OPENROUTER_API_KEY_STORAGE_KEYS) {
    const value = String(data?.[key] || '').trim();
    if (value.startsWith('sk-')) return value;
  }
  return '';
}

async function hasDirectOpenRouterKey() {
  return Boolean(await getDirectOpenRouterApiKey());
}

function redactUrlForExternal(input) {
  try {
    const url = new URL(input);
    const videoId = url.hostname.endsWith('youtube.com') && url.pathname === '/watch'
      ? url.searchParams.get('v')
      : '';
    url.search = '';
    url.hash = '';
    if (videoId) url.searchParams.set('v', videoId);
    return url.toString();
  } catch {
    return '';
  }
}

async function getActiveYouTubeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/www\.youtube\.com\/watch\b/.test(tab.url || '')) {
    throw new Error('Open a YouTube watch page first.');
  }
  return tab;
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error(`Native host timed out after ${NATIVE_MESSAGE_TIMEOUT_MS / 1000}s.`));
    }, NATIVE_MESSAGE_TIMEOUT_MS);

    chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('Native host returned no response.'));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error || 'Native host failed.'));
        return;
      }
      resolve(response);
    });
  });
}

function normalizeSource(video = {}) {
  const sourceType = video.sourceType === 'webpage' ? 'webpage' : 'youtube';
  const text = String(video.text || video.transcript || '').trim();
  const siteName = String(video.siteName || '').trim();
  const author = String(video.author || '').trim();
  const channel = String(video.channel || '').trim();
  const byline = sourceType === 'webpage' ? (author || siteName || 'Web Page') : (channel || 'YouTube Channel');
  return {
    ...video,
    sourceType,
    sourceLabel: sourceType,
    title: String(video.title || (sourceType === 'webpage' ? 'Untitled Page' : 'Untitled Video')).trim(),
    byline,
    channel: sourceType === 'youtube' ? byline : '',
    url: redactUrlForExternal(String(video.url || '').trim()),
    videoId: sourceType === 'youtube' ? String(video.videoId || '').trim() : '',
    text,
    transcript: sourceType === 'youtube' ? text : '',
  };
}

function systemPromptFor(video) {
  const source = normalizeSource(video);
  if (source.sourceType === 'webpage') {
    return 'You write accurate, concrete webpage/article analysis in Markdown for private research notes. Prioritize specificity, argument structure, and practical implications. For sensitive topics, summarize neutrally instead of refusing.';
  }
  return 'You write accurate, concrete YouTube transcript analysis in Markdown for private research notes. Prioritize specificity, argument structure, and practical implications. For sensitive topics, summarize neutrally instead of refusing.';
}

function buildPrompt(video) {
  const source = normalizeSource(video);
  if (source.sourceType === 'webpage') {
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

  return `You are turning a YouTube transcript into Jaime's Obsidian research notes.

Write a clear, structured analysis in the style of a concise analyst brief. The note should be easy to scan later: short sections, labeled bullets, concrete facts, and no bloated commentary.

Return clean Markdown only. Use this exact structure and headings:

# ${source.title}

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
Title: ${source.title}
Channel: ${source.channel || 'Unknown'}
URL: ${source.url}

Transcript:
${source.transcript}`;
}

function scoreCategory(text, terms) {
  const haystack = ` ${String(text || '').toLowerCase()} `;
  return terms.reduce((score, term) => score + (haystack.includes(String(term).toLowerCase()) ? 1 : 0), 0);
}

function classifyCategory(video, summaryMarkdown = '') {
  const source = normalizeSource(video);
  const fullText = `${source.title}\n${source.byline}\n${summaryMarkdown}\n${source.text}`;
  const rules = [
    ['Political', ['election', 'president', 'congress', 'government', 'policy', 'politics', 'trump', 'biden', 'war', 'ukraine', 'israel', 'gaza', 'china', 'russia']],
    ['Coding', ['coding', 'code', 'software', 'programming', 'developer', 'javascript', 'python', 'typescript', 'api', 'github', 'terminal', 'debug', 'react', 'node']],
    ['Educational', ['learn', 'course', 'lesson', 'tutorial', 'school', 'university', 'explain', 'guide', 'how to']],
    ['AI', ['ai', 'artificial intelligence', 'llm', 'openai', 'anthropic', 'gemini', 'deepseek', 'qwen', 'model', 'agent']],
    ['Finance', ['market', 'stocks', 'investing', 'crypto', 'bitcoin', 'inflation', 'trading']],
    ['Business', ['startup', 'business', 'sales', 'marketing', 'revenue', 'customer', 'founder', 'product']],
    ['Health', ['health', 'medical', 'doctor', 'diet', 'exercise', 'sleep', 'nutrition']],
    ['Science', ['science', 'physics', 'biology', 'chemistry', 'climate', 'space', 'research']],
    ['General', ['movie', 'film', 'music', 'culture', 'anime', 'manga', 'manhwa', 'game', 'story', 'media']],
  ];
  let best = ['General', 0];
  for (const [category, terms] of rules) {
    const score = scoreCategory(fullText, terms);
    if (score > best[1]) best = [category, score];
  }
  return CATEGORIES.includes(best[0]) ? best[0] : 'General';
}

function extractSummaryContent(message = {}) {
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('\n').trim();
  }
  return '';
}

async function requestOpenRouterDirect({ video, model }) {
  const apiKey = await getDirectOpenRouterApiKey();
  if (!apiKey) throw new Error('Missing browser-direct OpenRouter API key in extension storage.');
  const source = normalizeSource(video);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
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
        model: effectiveModel(model),
        messages: [
          { role: 'system', content: systemPromptFor(source) },
          { role: 'user', content: buildPrompt(source) },
        ],
        temperature: 0.2,
        max_tokens: OPENROUTER_MAX_TOKENS,
      }),
    });
    data = await response.json().catch(() => ({}));
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const message = data?.error?.metadata?.raw || data?.error?.message || data?.message || response.statusText;
    throw new Error(`OpenRouter ${response.status}: ${message}`);
  }
  const markdown = extractSummaryContent(data?.choices?.[0]?.message || {});
  if (!markdown) throw new Error('OpenRouter returned an empty summary.');
  return { markdown, model: effectiveModel(model), usage: data.usage || null };
}

async function summarizeDirect({ video, model }) {
  const result = await requestOpenRouterDirect({ video, model });
  const category = classifyCategory(video, result.markdown);
  return {
    ok: true,
    markdown: result.markdown,
    path: '',
    relativePath: '',
    category,
    model: result.model,
    usage: result.usage,
    generatedAt: new Date().toISOString(),
    video,
    saveMode: 'browser-direct',
  };
}

async function summarizeBestAvailable({ video, model }) {
  try {
    return await sendNativeMessage({ type: 'summarizeAndSave', video, model: effectiveModel(model) });
  } catch (nativeError) {
    if (await hasDirectOpenRouterKey()) {
      try {
        const result = await summarizeDirect({ video, model });
        return {
          ...result,
          nativeSaveUnavailable: true,
          nativeError: nativeError.message,
        };
      } catch (directError) {
        throw new Error(`Native host unavailable (${nativeError.message}); browser-direct fallback failed: ${directError.message}`);
      }
    }
    throw nativeError;
  }
}

async function findExistingSummaryBestAvailable({ videoId }) {
  try {
    return await sendNativeMessage({ type: 'findExistingSummary', videoId });
  } catch (error) {
    if (await hasDirectOpenRouterKey()) {
      return {
        ok: true,
        found: false,
        saveMode: 'browser-direct',
        nativeLookupUnavailable: true,
        nativeError: error.message,
      };
    }
    throw error;
  }
}

async function saveMarkdownBestAvailable({ markdown, video, category, previousPath }) {
  try {
    return await sendNativeMessage({
      type: 'saveMarkdown',
      markdown,
      video,
      category,
      previousPath,
    });
  } catch (error) {
    if (await hasDirectOpenRouterKey()) {
      return {
        ok: false,
        error: `Browser-direct mode can summarize, but cannot write directly to Obsidian. Use Brave/Chrome native host for exact-folder save, or copy/download the Markdown from the overlay. Native save unavailable: ${error.message}`,
      };
    }
    throw error;
  }
}

async function openOverlayInTab(tab) {
  if (!tab?.id) throw new Error('No active tab.');
  if (!/^https:\/\/www\.youtube\.com\/watch\b/.test(tab.url || '')) {
    throw new Error('Open a YouTube watch page first.');
  }
  return chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SUMMARY_OVERLAY' });
}

function isWebPageUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

async function openSummaryInTab(tab) {
  if (!tab?.id) throw new Error('No active tab.');
  if (/^https:\/\/www\.youtube\.com\/watch\b/.test(tab.url || '')) {
    return openOverlayInTab(tab);
  }
  if (!isWebPageUrl(tab.url)) {
    throw new Error('Open a YouTube video or regular web page first.');
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/webpage-summary.js'],
  });
  return chrome.tabs.sendMessage(tab.id, { type: 'OPEN_WEBPAGE_SUMMARY_OVERLAY' });
}

function openAiPlatform(platformId, analysisPrompt) {
  const platform = AI_PLATFORMS.find((candidate) => candidate.id === platformId);
  if (!platform) throw new Error('Unknown AI platform.');

  return new Promise((resolve) => {
    chrome.tabs.create({ url: platform.url, active: true }, (tab) => {
      const tabId = tab.id;
      const onUpdated = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        setTimeout(() => {
          let attempts = 0;
          const maxAttempts = 3;
          const retryDelay = 1000;
          const sendPrompt = () => {
            attempts += 1;
            chrome.tabs.sendMessage(tabId, {
              type: 'INJECT_ANALYSIS_PROMPT',
              platformId,
              analysisPrompt,
            }, () => {
              if (chrome.runtime.lastError && attempts < maxAttempts) {
                setTimeout(sendPrompt, retryDelay);
              }
            });
          };
          sendPrompt();
          resolve({ ok: true, platform: platform.name });
        }, 3000);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

chrome.action.onClicked.addListener((tab) => {
  openSummaryInTab(tab).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'GET_ACTIVE_VIDEO') {
      const tab = await getActiveYouTubeTab();
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_YOUTUBE_TRANSCRIPT' });
      sendResponse({ ok: true, tabId: tab.id, ...response });
      return;
    }

    if (message?.type === 'SUMMARIZE_AND_SAVE') {
      const result = await summarizeBestAvailable({
        video: message.video,
        model: effectiveModel(message.model),
      });
      sendResponse(result);
      return;
    }

    if (message?.type === 'FIND_EXISTING_SUMMARY') {
      const result = await findExistingSummaryBestAvailable({ videoId: message.videoId });
      sendResponse(result);
      return;
    }

    if (message?.type === 'SAVE_MARKDOWN') {
      const result = await saveMarkdownBestAvailable({
        markdown: message.markdown,
        video: message.video,
        category: message.category,
        previousPath: message.previousPath,
      });
      sendResponse(result);
      return;
    }

    if (message?.type === 'OPEN_AI_PLATFORM') {
      const result = await openAiPlatform(message.platformId, message.analysisPrompt);
      sendResponse(result);
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type.' });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
