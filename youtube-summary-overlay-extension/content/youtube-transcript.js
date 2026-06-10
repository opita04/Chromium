(() => {
  'use strict';

  const DEFAULT_MODEL = 'mistralai/mistral-small-24b-instruct-2501';
  const CATEGORIES = ['Political', 'Coding', 'Educational', 'General', 'Business', 'AI', 'Finance', 'Health', 'Science', 'Others'];
  const MODEL_PRESETS = [
    ['DeepSeek', 'deepseek/deepseek-v4-flash', 'assets/model-icons/deepseek-color.svg'],
    ['Qwen', 'qwen/qwen3.6-flash', 'assets/model-icons/qwen-color.png'],
    ['Gemini', 'google/gemini-2.5-flash-lite', 'assets/model-icons/gemini-color.svg'],
    ['Mistral', 'mistralai/mistral-small-24b-instruct-2501', 'assets/model-icons/mistral-color.svg'],
    ['Nemotron', 'nvidia/nemotron-3-ultra-550b-a55b:free', null],
    ['GPT-5', 'openai/gpt-5-nano', 'assets/model-icons/icons8-chatgpt.svg'],
  ];
  const AI_PLATFORMS = [
    ['chatgpt', 'ChatGPT'],
    ['claude', 'Claude'],
    ['gemini', 'Gemini'],
    ['mistral', 'Mistral'],
    ['grok', 'Grok'],
    ['deepseek', 'DeepSeek'],
  ];
  const OVERLAY_ID = 'opita-youtube-summary-overlay';
  const BUTTON_ID = 'opita-youtube-summary-button';

  const SELECTORS = {
    panels: [
      '[target-id="engagement-panel-searchable-transcript"]',
      '[target-id="PAmodern_transcript_view"]',
      '[target-id*="transcript" i]',
      'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]',
      'ytd-macro-markers-list-renderer',
      '#panels ytd-engagement-panel-section-list-renderer[target-id*="macro-markers" i]',
    ],
    rows: [
      'ytd-transcript-segment-view-model',
      'transcript-segment-view-model',
      'ytd-transcript-segment-renderer',
      '.segment-text',
      '.segment-title',
      '[role="listitem"]',
      'ytd-transcript-segment-list-renderer > *',
    ],
    title: [
      'h1.ytd-watch-metadata yt-formatted-string',
      'h1.title.ytd-video-primary-info-renderer',
      'meta[name="title"]',
      'meta[property="og:title"]',
    ],
    channel: [
      'ytd-watch-metadata #owner ytd-channel-name a',
      'ytd-watch-metadata #upload-info #channel-name a',
      '#owner ytd-channel-name a',
      'ytd-video-owner-renderer ytd-channel-name a',
      'ytd-channel-name a[href^="/@"]',
      'ytd-channel-name a[href^="/channel/"]',
      'span[itemprop="author"] link[itemprop="name"]',
      'link[itemprop="name"]',
      'meta[itemprop="author"]',
    ],
  };

  let state = {
    video: null,
    markdown: '',
    path: '',
    category: 'General',
    model: DEFAULT_MODEL,
    busy: false,
  };
  let lastObservedVideoId = '';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function visible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
  }

  function getVisibleTranscriptPanel() {
    const panels = Array.from(document.querySelectorAll(SELECTORS.panels.join(',')));
    const rowNodes = document.querySelectorAll('ytd-transcript-segment-renderer, ytd-transcript-segment-view-model, transcript-segment-view-model');
    rowNodes.forEach((node) => {
      const panel = node.closest('ytd-engagement-panel-section-list-renderer, tp-yt-app-drawer, div#panel');
      if (panel && !panels.includes(panel)) panels.push(panel);
    });
    return panels.find(visible) || null;
  }

  function readFirst(selectors, fallback = '') {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const value = (el.content || el.innerText || el.textContent || '').trim();
      if (value) return value;
    }
    return fallback;
  }

  function cleanChannelName(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/^by\s+/i, '')
      .replace(/ - YouTube$/i, '')
      .trim();
  }

  function uniqueNames(names) {
    const seen = new Set();
    return names
      .map(cleanChannelName)
      .filter((name) => name && !/^youtube$/i.test(name) && !/^unknown channel$/i.test(name))
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function channelFromScripts() {
    const scripts = Array.from(document.scripts).map((script) => script.textContent || '').join('\n');
    const patterns = [
      /"ownerChannelName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /"author"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
      /"shortBylineText"\s*:\s*\{[^}]*"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
    ];
    for (const pattern of patterns) {
      const match = scripts.match(pattern);
      if (!match) continue;
      try {
        const parsed = JSON.parse(`"${match[1]}"`);
        if (cleanChannelName(parsed)) return cleanChannelName(parsed);
      } catch {
        if (cleanChannelName(match[1])) return cleanChannelName(match[1]);
      }
    }
    return '';
  }

  function readChannelName() {
    const names = [];
    for (const selector of SELECTORS.channel) {
      document.querySelectorAll(selector).forEach((el) => {
        const value = el.content || el.getAttribute('content') || el.getAttribute('title') || el.innerText || el.textContent || '';
        if (value) names.push(value);
      });
    }

    const metadata = document.querySelector('ytd-watch-metadata');
    if (metadata) {
      metadata.querySelectorAll('a[href^="/@"], a[href^="/channel/"]').forEach((el) => {
        if (visible(el)) names.push(el.innerText || el.textContent || el.getAttribute('title') || '');
      });
    }

    const scriptName = channelFromScripts();
    if (scriptName) names.push(scriptName);

    const unique = uniqueNames(names);
    if (unique.length) return unique.slice(0, 3).join(' + ');
    return 'YouTube Channel';
  }

  async function openTranscriptPanel() {
    if (getVisibleTranscriptPanel()) return true;

    const expandBtn = document.querySelector('ytd-text-inline-expander[is-collapsed] #expand, ytd-watch-metadata #description-inline-expander, #description-inline-expander, #description #expand');
    if (visible(expandBtn)) {
      expandBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await sleep(300);
      expandBtn.click();
      await sleep(800);
    }

    const isPanelButton = (el) => el.closest && el.closest('ytd-engagement-panel-section-list-renderer, tp-yt-app-drawer');
    const direct = document.querySelector('ytd-video-description-transcript-section-renderer button, button[aria-label="Show transcript" i]');
    let transcriptButton = direct && !isPanelButton(direct) ? direct : null;

    if (!transcriptButton) {
      transcriptButton = Array.from(document.querySelectorAll('button, [role="button"], ytd-button-renderer')).find((el) => {
        if (!visible(el) || isPanelButton(el)) return false;
        const text = (el.innerText || el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return text === 'show transcript' || text === 'transcript' || aria.includes('show transcript');
      });
    }

    if (!transcriptButton) return false;
    transcriptButton.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(300);
    transcriptButton.click();

    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      if (getVisibleTranscriptPanel()) return true;
    }
    return false;
  }

  function cleanTranscriptSegment(value) {
    return String(value || '')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
      .replace(/^\s*(?:(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(?:hours?|minutes?|seconds?)\b[\s,]*(?:and\s*)?)+/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readTranscriptSegment(row) {
    const textNode = row.querySelector([
      '.segment-text',
      '[id*="segment-text" i]',
      '[class*="segment-text" i]',
      'yt-formatted-string.segment-text',
    ].join(','));
    if (textNode) return cleanTranscriptSegment(textNode.textContent);

    const clone = row.cloneNode(true);
    clone.querySelectorAll([
      '.segment-timestamp',
      '[id*="timestamp" i]',
      '[class*="timestamp" i]',
      '[id*="time" i]',
      '[class*="time" i]',
    ].join(',')).forEach((node) => node.remove());
    return cleanTranscriptSegment(clone.textContent);
  }

  async function getTranscriptText() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const panel = getVisibleTranscriptPanel();
      if (!panel) {
        await sleep(1000);
        continue;
      }

      let rows = [];
      for (const selector of SELECTORS.rows) {
        rows = Array.from(panel.querySelectorAll(selector));
        if (rows.length) break;
      }
      if (!rows.length) {
        for (const selector of SELECTORS.rows) {
          rows = Array.from(document.querySelectorAll(selector));
          if (rows.length) break;
        }
      }

      const text = rows
        .map(readTranscriptSegment)
        .filter(Boolean)
        .join(' ');

      if (text.length >= 50) return text;
      await sleep(1000);
    }
    return '';
  }

  function currentVideoId() {
    try {
      return new URL(location.href).searchParams.get('v') || location.href;
    } catch {
      return location.href;
    }
  }

  function cacheKey(videoId = currentVideoId()) {
    return `youtubeSummaryOverlay:${videoId}`;
  }

  function storageLocal() {
    return globalThis.chrome?.storage?.local || null;
  }

  async function readCachedSummary(videoId = currentVideoId()) {
    const storage = storageLocal();
    if (!storage) return null;
    const data = await storage.get(cacheKey(videoId));
    return data[cacheKey(videoId)] || null;
  }

  async function writeCachedSummary(result) {
    const storage = storageLocal();
    if (!storage) return;
    const videoId = result?.video?.videoId || currentVideoId();
    await storage.set({
      [cacheKey(videoId)]: {
        ...result,
        cachedAt: new Date().toISOString(),
      },
    });
  }

  async function extractVideo() {
    if (location.pathname !== '/watch') throw new Error('This only works on YouTube watch pages.');
    const opened = await openTranscriptPanel();
    if (!opened) throw new Error('Could not find/open the YouTube transcript panel.');
    const transcript = await getTranscriptText();
    if (!transcript) throw new Error('Transcript was empty or unavailable.');

    const url = location.href;
    const videoId = new URL(location.href).searchParams.get('v') || '';
    const title = readFirst(SELECTORS.title, document.title.replace(/ - YouTube$/, '') || 'Untitled Video');
    const channel = readChannelName();

    return { ok: true, video: { title, channel, url, videoId, transcript } };
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'No response.' });
      });
    });
  }

  function ensureButtonStyles() {
    if (document.getElementById(`${BUTTON_ID}-style`)) return;
    const style = document.createElement('style');
    style.id = `${BUTTON_ID}-style`;
    style.textContent = `
      #${BUTTON_ID} {
        align-items: center;
        background:
          radial-gradient(circle at 32% 24%, rgba(255,255,255,0.92) 0 9%, transparent 10%),
          linear-gradient(145deg, #0f766e 0%, #0d9488 48%, #f59e0b 100%);
        border: 1px solid rgba(255,255,255,0.34);
        border-radius: 999px;
        box-shadow: 0 10px 26px rgba(2,6,23,0.34), 0 0 0 5px rgba(13,148,136,0.14);
        color: #fff;
        cursor: pointer;
        display: flex;
        font: 900 14px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", Segoe UI, sans-serif;
        height: 46px;
        justify-content: center;
        letter-spacing: 0;
        padding: 0;
        position: fixed;
        right: 18px;
        text-shadow: 0 1px 8px rgba(2,6,23,0.35);
        top: 42%;
        transition: box-shadow 120ms ease, transform 120ms ease, filter 120ms ease;
        width: 46px;
        z-index: 2147483646;
      }
      #${BUTTON_ID}::after {
        background: rgba(2,6,23,0.38);
        border: 1px solid rgba(255,255,255,0.26);
        border-radius: inherit;
        content: "";
        inset: 5px;
        position: absolute;
        z-index: -1;
      }
      #${BUTTON_ID}:hover { box-shadow: 0 13px 30px rgba(2,6,23,0.42), 0 0 0 6px rgba(245,158,11,0.18); filter: saturate(1.08); transform: translateY(-1px); }
      #${BUTTON_ID}:focus-visible { outline: 3px solid rgba(245,158,11,0.72); outline-offset: 3px; }
      #${BUTTON_ID}[disabled] { cursor: wait; opacity: 0.92; }
      #${BUTTON_ID}.is-done { background: linear-gradient(145deg, #047857, #22c55e); box-shadow: 0 10px 26px rgba(2,6,23,0.34), 0 0 0 5px rgba(34,197,94,0.16); }
      #${BUTTON_ID}.is-error { background: linear-gradient(145deg, #b91c1c, #f97316); box-shadow: 0 10px 26px rgba(2,6,23,0.34), 0 0 0 5px rgba(249,115,22,0.17); }
    `;
    document.documentElement.appendChild(style);
  }

  function setActionButton(text, stateClass = '') {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    const compactText = text === 'Error' ? '!' : text === 'Summarize' || text === 'Open Summary' ? 'S' : text;
    button.textContent = compactText;
    button.title = text;
    button.setAttribute('aria-label', text);
    button.className = stateClass;
    button.disabled = state.busy;
  }

  function setProgress(percent, message = '') {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    setActionButton(`${clamped}%`, '');
    if (message) setStatus(message);
  }

  function ensureActionButton() {
    if (location.pathname !== '/watch') return null;
    ensureButtonStyles();
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'S';
    button.title = 'Summarize video';
    button.setAttribute('aria-label', 'Summarize video');
    button.addEventListener('click', () => {
      showOverlay().catch((error) => {
        console.error('YouTube summary overlay failed:', error);
        setActionButton('Error', 'is-error');
      });
    });
    document.documentElement.appendChild(button);
    return button;
  }

  function applyStyles(root) {
    if (root.querySelector('style')) return;
    const style = document.createElement('style');
    style.textContent = `
      #${OVERLAY_ID} { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(3, 7, 18, 0.72); backdrop-filter: blur(6px); color: #f8fafc; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", Segoe UI, sans-serif; }
      #${OVERLAY_ID}[hidden] { display: none !important; }
      #${OVERLAY_ID} .ytso-modal { width: min(1120px, calc(100vw - 48px)); height: min(820px, calc(100vh - 48px)); background: #0f172a; border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.55); display: grid; grid-template-rows: auto auto 1fr auto; overflow: hidden; }
      #${OVERLAY_ID} .ytso-header, #${OVERLAY_ID} .ytso-controls, #${OVERLAY_ID} .ytso-footer { padding: 12px 18px; border-bottom: 1px solid rgba(148, 163, 184, 0.18); }
      #${OVERLAY_ID} .ytso-header { display: flex; align-items: start; justify-content: space-between; gap: 14px; }
      #${OVERLAY_ID} .ytso-eyebrow { color: #22c55e; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 3px; }
      #${OVERLAY_ID} .ytso-title { font-size: 18px; font-weight: 800; margin: 0; color: #f8fafc; }
      #${OVERLAY_ID} .ytso-meta, #${OVERLAY_ID} .ytso-path, #${OVERLAY_ID} .ytso-status { color: #94a3b8; font-size: 12px; margin: 4px 0 0; overflow-wrap: anywhere; }
      #${OVERLAY_ID} .ytso-close { background: rgba(148, 163, 184, 0.16); border: 0; border-radius: 999px; color: #f8fafc; cursor: pointer; font-weight: 800; padding: 8px 11px; }
      #${OVERLAY_ID} .ytso-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
      #${OVERLAY_ID} .ytso-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; min-width: 0; }
      #${OVERLAY_ID} .ytso-controls-row { flex: 1 1 100%; }
      #${OVERLAY_ID} .ytso-model-icons { display: inline-flex; gap: 6px; }
      #${OVERLAY_ID} .ytso-spacer { flex: 1 1 auto; min-width: 12px; }
      #${OVERLAY_ID} label { color: #94a3b8; display: grid; gap: 3px; font-size: 11px; }
      #${OVERLAY_ID} input, #${OVERLAY_ID} select { background: #020617; border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 9px; color: #f8fafc; font: inherit; font-size: 12px; height: 34px; padding: 6px 9px; }
      #${OVERLAY_ID} input { width: min(230px, 40vw); }
      #${OVERLAY_ID} select { max-width: 145px; }
      #${OVERLAY_ID} button { background: linear-gradient(135deg, #8b5cf6, #6366f1); border: 0; border-radius: 999px; color: white; cursor: pointer; font-weight: 800; min-height: 34px; padding: 7px 11px; }
      #${OVERLAY_ID} button.secondary { background: rgba(148, 163, 184, 0.16); color: #f8fafc; }
      #${OVERLAY_ID} button:disabled { cursor: wait; filter: grayscale(0.7); opacity: 0.7; }
      #${OVERLAY_ID} .ytso-icon-button { align-items: center; display: inline-flex; height: 34px; justify-content: center; min-height: 34px; padding: 0; width: 34px; }
      #${OVERLAY_ID} .ytso-icon-button img { display: block; height: 19px; object-fit: contain; width: 19px; }
      #${OVERLAY_ID} .ytso-model-badge { color: #d1fae5; font-size: 11px; font-weight: 900; line-height: 1; }
      #${OVERLAY_ID} .ytso-icon-button[data-active="true"] { background: rgba(34, 197, 94, 0.2); box-shadow: inset 0 0 0 2px rgba(34, 197, 94, 0.72), 0 0 0 3px rgba(34, 197, 94, 0.12); }
      #${OVERLAY_ID} .ytso-redo { padding-inline: 13px; }
      #${OVERLAY_ID} .ytso-body { min-height: 0; overflow: auto; padding: 22px 28px; }
      #${OVERLAY_ID} .ytso-summary { color: #e5e7eb; font-size: 15px; line-height: 1.65; width: 100%; }
      #${OVERLAY_ID} .ytso-summary h1 { color: #f8fafc; font-size: 26px; line-height: 1.2; margin: 0 0 18px; }
      #${OVERLAY_ID} .ytso-summary h2 { border-bottom: 1px solid rgba(148, 163, 184, 0.18); color: #f8fafc; font-size: 20px; margin: 24px 0 12px; padding-bottom: 7px; }
      #${OVERLAY_ID} .ytso-summary h3 { color: #c4b5fd; font-size: 16px; line-height: 1.35; margin: 20px 0 8px; }
      #${OVERLAY_ID} .ytso-summary p { margin: 0 0 12px; }
      #${OVERLAY_ID} .ytso-summary ul { margin: 0 0 14px; padding-left: 22px; }
      #${OVERLAY_ID} .ytso-summary li { margin: 7px 0; }
      #${OVERLAY_ID} .ytso-summary strong { color: #f8fafc; font-weight: 800; }
      #${OVERLAY_ID} .ytso-summary code { background: rgba(148, 163, 184, 0.14); border-radius: 6px; padding: 1px 5px; }
      #${OVERLAY_ID} .ytso-summary hr { border: 0; border-top: 1px solid rgba(148, 163, 184, 0.18); margin: 18px 0; }
      #${OVERLAY_ID} .ytso-footer { border-bottom: 0; border-top: 1px solid rgba(148, 163, 184, 0.18); display: flex; justify-content: space-between; gap: 10px; align-items: center; }
      #${OVERLAY_ID} .ytso-progress { height: 4px; width: 160px; }
      @media (max-width: 760px) {
        #${OVERLAY_ID} .ytso-modal { width: calc(100vw - 20px); height: calc(100vh - 20px); }
        #${OVERLAY_ID} .ytso-header, #${OVERLAY_ID} .ytso-controls, #${OVERLAY_ID} .ytso-footer { padding-inline: 12px; }
        #${OVERLAY_ID} .ytso-spacer { display: none; }
        #${OVERLAY_ID} input { width: 150px; }
      }
    `;
    root.appendChild(style);
  }

  function buildOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    applyStyles(overlay);

    const modal = document.createElement('section');
    modal.className = 'ytso-modal';

    const header = document.createElement('header');
    header.className = 'ytso-header';
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'ytso-eyebrow';
    eyebrow.textContent = 'YouTube → Obsidian';
    const title = document.createElement('h2');
    title.className = 'ytso-title';
    title.dataset.role = 'title';
    title.textContent = 'Summary overlay';
    const meta = document.createElement('p');
    meta.className = 'ytso-meta';
    meta.dataset.role = 'meta';
    titleWrap.append(eyebrow, title, meta);
    const close = document.createElement('button');
    close.className = 'ytso-close';
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      overlay.hidden = true;
    });
    header.append(titleWrap, close);

    const controls = document.createElement('div');
    controls.className = 'ytso-controls';
    const row = document.createElement('div');
    row.className = 'ytso-row ytso-controls-row';

    const modelInput = document.createElement('input');
    modelInput.type = 'hidden';
    modelInput.dataset.role = 'model';
    modelInput.value = DEFAULT_MODEL;

    const modelIcons = document.createElement('div');
    modelIcons.className = 'ytso-model-icons';
    modelIcons.appendChild(modelInput);

    for (const [label, model, iconPath] of MODEL_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary ytso-icon-button';
      button.title = `Redo with ${label}`;
      button.setAttribute('aria-label', `Redo with ${label}`);
      button.dataset.modelPreset = model;
      if (iconPath) {
        const icon = document.createElement('img');
        icon.alt = '';
        icon.src = chrome.runtime.getURL(iconPath);
        button.appendChild(icon);
      } else {
        const badge = document.createElement('span');
        badge.className = 'ytso-model-badge';
        badge.textContent = label.slice(0, 2).toUpperCase();
        button.appendChild(badge);
      }
      button.addEventListener('click', () => runSummary({ force: true, model }));
      modelIcons.appendChild(button);
    }
    row.appendChild(modelIcons);

    const spacer = document.createElement('span');
    spacer.className = 'ytso-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    row.appendChild(spacer);

    const categoryLabel = document.createElement('label');
    categoryLabel.textContent = 'Save folder';
    const categorySelect = document.createElement('select');
    categorySelect.dataset.role = 'category';
    for (const category of CATEGORIES) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    }
    categoryLabel.appendChild(categorySelect);
    row.appendChild(categoryLabel);

    const moveButton = document.createElement('button');
    moveButton.type = 'button';
    moveButton.className = 'secondary';
    moveButton.textContent = 'Move to folder';
    moveButton.addEventListener('click', moveToSelectedCategory);
    row.appendChild(moveButton);

    const aiLabel = document.createElement('label');
    aiLabel.textContent = 'Send transcript to';
    const aiSelect = document.createElement('select');
    aiSelect.dataset.role = 'ai-platform';
    for (const [id, name] of AI_PLATFORMS) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      aiSelect.appendChild(option);
    }
    aiLabel.appendChild(aiSelect);
    row.appendChild(aiLabel);

    const sendTranscriptButton = document.createElement('button');
    sendTranscriptButton.type = 'button';
    sendTranscriptButton.className = 'secondary';
    sendTranscriptButton.textContent = 'Send transcript';
    sendTranscriptButton.addEventListener('click', sendTranscriptToSelectedAi);
    row.appendChild(sendTranscriptButton);

    const rerunButton = document.createElement('button');
    rerunButton.type = 'button';
    rerunButton.className = 'ytso-redo';
    rerunButton.textContent = 'Redo summary';
    rerunButton.addEventListener('click', () => runSummary({ force: true, model: modelInput.value.trim() || DEFAULT_MODEL }));
    row.appendChild(rerunButton);
    controls.append(row);

    const body = document.createElement('div');
    body.className = 'ytso-body';
    const summary = document.createElement('article');
    summary.className = 'ytso-summary';
    summary.dataset.role = 'summary';
    body.appendChild(summary);

    const footer = document.createElement('footer');
    footer.className = 'ytso-footer';
    const statusWrap = document.createElement('div');
    const status = document.createElement('p');
    status.className = 'ytso-status';
    status.dataset.role = 'status';
    const pathLine = document.createElement('p');
    pathLine.className = 'ytso-path';
    pathLine.dataset.role = 'path';
    statusWrap.append(status, pathLine);
    const progress = document.createElement('progress');
    progress.className = 'ytso-progress';
    progress.dataset.role = 'progress';
    progress.hidden = true;
    footer.append(statusWrap, progress);

    modal.append(header, controls, body, footer);
    overlay.appendChild(modal);
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function overlayPart(role) {
    return document.getElementById(OVERLAY_ID)?.querySelector(`[data-role="${role}"]`) || null;
  }

  function setBusy(isBusy, message = '') {
    state.busy = isBusy;
    const overlay = document.getElementById(OVERLAY_ID);
    overlay?.querySelectorAll('button, input, select').forEach((el) => {
      el.disabled = isBusy;
    });
    const actionButton = ensureActionButton();
    if (actionButton) actionButton.disabled = isBusy;
    const progress = overlayPart('progress');
    if (progress) progress.hidden = !isBusy;
    if (message) setStatus(message);
  }

  function setStatus(message) {
    const status = overlayPart('status');
    if (status) status.textContent = message;
  }

  function stripFrontmatter(markdown) {
    return String(markdown || '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  }

  function stripTranscriptSection(markdown) {
    return String(markdown || '').replace(/\n?## Transcript\s*\n[\s\S]*$/i, '').trim();
  }

  function appendInlineText(parent, text) {
    const parts = String(text || '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('`') && part.endsWith('`')) {
        const code = document.createElement('code');
        code.textContent = part.slice(1, -1);
        parent.appendChild(code);
      } else if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        parent.appendChild(strong);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    }
  }

  function renderMarkdown(markdown, container) {
    container.replaceChildren();
    const lines = stripTranscriptSection(stripFrontmatter(markdown)).split(/\r?\n/);
    let list = null;

    const closeList = () => { list = null; };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeList();
        continue;
      }
      if (line.startsWith('# ')) {
        closeList();
        const h1 = document.createElement('h1');
        appendInlineText(h1, line.slice(2).trim());
        container.appendChild(h1);
        continue;
      }
      if (line.startsWith('## ')) {
        closeList();
        const h2 = document.createElement('h2');
        appendInlineText(h2, line.slice(3).trim());
        container.appendChild(h2);
        continue;
      }
      if (line.startsWith('### ')) {
        closeList();
        const h3 = document.createElement('h3');
        appendInlineText(h3, line.slice(4).trim());
        container.appendChild(h3);
        continue;
      }
      if (/^(?:-{3,}|\* \* \*)$/.test(line)) {
        closeList();
        container.appendChild(document.createElement('hr'));
        continue;
      }
      if (line.startsWith('- ')) {
        if (!list) {
          list = document.createElement('ul');
          container.appendChild(list);
        }
        const li = document.createElement('li');
        appendInlineText(li, line.slice(2).trim());
        list.appendChild(li);
        continue;
      }
      closeList();
      const p = document.createElement('p');
      appendInlineText(p, line);
      container.appendChild(p);
    }
  }

  function renderState(fromCache = false) {
    const title = overlayPart('title');
    const meta = overlayPart('meta');
    const model = overlayPart('model');
    const category = overlayPart('category');
    const summary = overlayPart('summary');
    const pathLine = overlayPart('path');
    if (title) {
      title.textContent = state.video
        ? `${state.video.title || 'Untitled Video'} - ${state.video.channel || 'Unknown Channel'}`
        : 'Summary overlay';
    }
    if (meta) meta.textContent = '';
    if (model) model.value = state.model || DEFAULT_MODEL;
    document.getElementById(OVERLAY_ID)?.querySelectorAll('[data-model-preset]').forEach((button) => {
      button.dataset.active = button.dataset.modelPreset === (state.model || DEFAULT_MODEL) ? 'true' : 'false';
    });
    if (category) category.value = CATEGORIES.includes(state.category) ? state.category : 'General';
    if (summary) renderMarkdown(state.markdown || '', summary);
    if (pathLine) pathLine.textContent = state.path ? `Saved: ${state.path}` : '';
    if (state.markdown) {
      setStatus(fromCache ? 'Loaded cached summary. It did not rerun.' : `Done. Category: ${state.category}`);
      setActionButton('Open Summary', 'is-done');
    }
  }

  async function showOverlay() {
    if (state.busy) return;

    const cached = await readCachedSummary();
    if (cached?.markdown) {
      state = { ...state, ...cached, busy: false };
      buildOverlay().hidden = false;
      renderState(true);
      return;
    }

    state = { ...state, video: null, markdown: '', path: '', category: 'General', busy: false };
    await runSummary({ force: false, model: state.model || DEFAULT_MODEL, openWhenReady: true });
  }

  async function runSummary({ force, model, openWhenReady = false }) {
    if (state.busy) return;

    if (!force) {
      const cached = await readCachedSummary();
      if (cached?.markdown) {
        state = { ...state, ...cached, busy: false };
        buildOverlay().hidden = false;
        renderState(true);
        return;
      }
    }

    if (!openWhenReady) buildOverlay().hidden = false;
    setBusy(true, 'Opening transcript and summarizing…');
    setProgress(5, 'Opening transcript…');
    try {
      setProgress(10, 'Extracting transcript…');
      const extracted = await extractVideo();
      state.video = extracted.video;
      if (!openWhenReady) renderState(false);
      const selectedModel = model || overlayPart('model')?.value.trim() || DEFAULT_MODEL;
      setProgress(35, `Transcript ready. Sending to ${selectedModel}…`);
      const waitTimers = [
        setTimeout(() => setProgress(50, `Still waiting on ${selectedModel}…`), 5000),
        setTimeout(() => setProgress(65, selectedModel === DEFAULT_MODEL ? 'Mistral is still thinking…' : `Still waiting on ${selectedModel}…`), 8500),
        setTimeout(() => setProgress(78, 'Finishing summary request…'), 12000),
      ];
      let result;
      try {
        result = await sendMessage({ type: 'SUMMARIZE_AND_SAVE', video: state.video, model: selectedModel });
      } finally {
        waitTimers.forEach((timer) => clearTimeout(timer));
      }
      setProgress(90, 'Saving Markdown note…');
      if (!result.ok) throw new Error(result.error || 'Summarize failed.');
      state = {
        ...state,
        video: state.video,
        markdown: result.markdown || '',
        path: result.path || '',
        category: result.category || 'General',
        model: result.model || selectedModel,
        busy: false,
      };
      await writeCachedSummary(state);
      setProgress(100, 'Summary ready.');
      buildOverlay().hidden = false;
      renderState(false);
    } catch (error) {
      setActionButton('Error', 'is-error');
      if (!openWhenReady) {
        setStatus(`Error: ${error.message}`);
      } else {
        console.error('YouTube summary failed:', error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function moveToSelectedCategory() {
    if (!state.markdown || !state.video || state.busy) return;
    const category = overlayPart('category')?.value || state.category || 'General';
    const markdown = state.markdown;
    setBusy(true, `Moving note to ${category}/…`);
    try {
      const result = await sendMessage({
        type: 'SAVE_MARKDOWN',
        video: state.video,
        markdown,
        category,
        previousPath: state.path,
      });
      if (!result.ok) throw new Error(result.error || 'Save failed.');
      state = {
        ...state,
        markdown: result.markdown || markdown,
        path: result.path || state.path,
        category: result.category || category,
        busy: false,
      };
      await writeCachedSummary(state);
      buildOverlay().hidden = false;
      renderState(false);
      setStatus(`Moved to ${state.category}/`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function buildTranscriptPrompt(video) {
    return [
      'Please analyze this YouTube transcript in a concise structured-analysis style.',
      '',
      'Use this exact Markdown shape:',
      `# ${video.title || 'Untitled Video'}`,
      '',
      '## Takeaways',
      '- 6-8 bullets. Start each bullet with a short bold label, then a colon, then the specific takeaway.',
      '',
      '## Key Points',
      '- Group the main argument into 3-6 logical subheadings using "### A. ...", "### B. ...", etc.',
      '- Under each subheading, use labeled bullets in the same "Label: explanation" style.',
      '',
      '### Final Observation',
      '- End with one short synthesis paragraph.',
      '',
      `Title: ${video.title || 'Untitled Video'}`,
      `Channel: ${video.channel || 'Unknown Channel'}`,
      `URL: ${video.url || location.href}`,
      '',
      'Transcript:',
      video.transcript,
    ].join('\n');
  }

  async function ensureTranscriptVideo() {
    if (state.video?.transcript) return state.video;
    const extracted = await extractVideo();
    state.video = extracted.video;
    return state.video;
  }

  async function sendTranscriptToSelectedAi() {
    if (state.busy) return;
    const platformId = overlayPart('ai-platform')?.value || 'chatgpt';
    const platformName = AI_PLATFORMS.find(([id]) => id === platformId)?.[1] || 'AI chat';
    setBusy(true, `Preparing transcript for ${platformName}…`);
    try {
      const video = await ensureTranscriptVideo();
      const result = await sendMessage({
        type: 'OPEN_AI_PLATFORM',
        platformId,
        analysisPrompt: buildTranscriptPrompt(video),
      });
      if (!result.ok) throw new Error(result.error || 'Could not open AI chat.');
      setStatus(`Opened ${result.platform || platformName} and sent the transcript.`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function syncActionButtonToPage() {
    if (location.pathname === '/watch') {
      const videoId = currentVideoId();
      if (videoId !== lastObservedVideoId) {
        lastObservedVideoId = videoId;
        state = { ...state, video: null, markdown: '', path: '', category: 'General', busy: false };
        document.getElementById(OVERLAY_ID)?.remove();
      }
      ensureActionButton();
      if (!state.markdown && !state.busy) setActionButton('Summarize', '');
      return;
    }
    document.getElementById(BUTTON_ID)?.remove();
  }

  syncActionButtonToPage();
  setInterval(syncActionButtonToPage, 1500);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'EXTRACT_YOUTUBE_TRANSCRIPT') {
      extractVideo()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === 'OPEN_SUMMARY_OVERLAY') {
      showOverlay().catch((error) => {
        console.error('YouTube summary overlay failed:', error);
      });
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
})();
