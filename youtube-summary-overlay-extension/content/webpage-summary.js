(() => {
  'use strict';

  if (window.__opitaWebpageSummaryLoaded) return;
  window.__opitaWebpageSummaryLoaded = true;

  const DEFAULT_MODEL = 'mistralai/mistral-small-24b-instruct-2501';
  const SUMMARY_RESPONSE_TIMEOUT_MS = 35000;
  const OVERLAY_ID = 'opita-webpage-summary-overlay';
  const BUTTON_ID = 'opita-webpage-summary-button';
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

  let state = {
    source: null,
    markdown: '',
    path: '',
    category: 'General',
    model: DEFAULT_MODEL,
    busy: false,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function storageLocal() {
    return globalThis.chrome?.storage?.local || null;
  }

  function cacheKey(url = location.href) {
    return `webpageSummary:${url.split('#')[0]}`;
  }

  async function readCachedSummary() {
    const storage = storageLocal();
    if (!storage) return null;
    const data = await storage.get(cacheKey());
    return data[cacheKey()] || null;
  }

  async function writeCachedSummary(result) {
    const storage = storageLocal();
    if (!storage) return;
    await storage.set({
      [cacheKey()]: {
        ...result,
        cachedAt: new Date().toISOString(),
      },
    });
  }

  function sendMessage(message, timeoutMs = 0) {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = timeoutMs > 0 ? setTimeout(() => {
        settled = true;
        resolve({ ok: false, error: `No extension response after ${Math.round(timeoutMs / 1000)}s.` });
      }, timeoutMs) : null;

      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: 'No response.' });
      });
    });
  }

  function readMeta(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = el?.content || el?.getAttribute?.('content') || el?.textContent || '';
      if (String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function isJunkText(text) {
    const value = cleanText(text);
    if (!value) return true;
    if (/^(advertisement|sponsored|related|read more|share this|comments|sign in)$/i.test(value)) return true;
    if (/sign in.*submenu.*privacy policy/i.test(value)) return true;
    if ((value.match(/\b(submenu|sign in|close|newsletter|cookie)\b/gi) || []).length >= 4) return true;
    return false;
  }

  function uniqueBlocks(blocks) {
    const unique = [];
    const seen = new Set();
    for (const block of blocks.map(cleanText).filter((text) => text.length >= 30 && !isJunkText(text))) {
      const key = block.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(block);
    }
    return unique;
  }

  function removeClutter(root) {
    root.querySelectorAll([
      'script',
      'style',
      'noscript',
      'svg',
      'canvas',
      'iframe',
      'form',
      'button',
      'input',
      'select',
      'textarea',
      'nav',
      'footer',
      'aside',
      'dialog',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[aria-modal="true"]',
      '[class*="ad-" i]',
      '[class*="ads" i]',
      '[class*="advert" i]',
      '[class*="breadcrumb" i]',
      '[class*="comment" i]',
      '[class*="cookie" i]',
      '[class*="newsletter" i]',
      '[class*="promo" i]',
      '[class*="related" i]',
      '[class*="share" i]',
      '[class*="sidebar" i]',
      '[id*="ad-" i]',
      '[id*="ads" i]',
      '[id*="comment" i]',
      '[id*="newsletter" i]',
      '[id*="related" i]',
      '[id*="share" i]',
      '[id*="sidebar" i]',
    ].join(',')).forEach((node) => node.remove());
  }

  function scoreContainer(node) {
    const paragraphs = Array.from(node.querySelectorAll('p, li, blockquote'));
    const paragraphText = paragraphs.map((el) => cleanText(el.textContent)).filter((text) => text.length > 40);
    const textLength = paragraphText.join(' ').length;
    const linkLength = Array.from(node.querySelectorAll('a')).map((el) => cleanText(el.textContent)).join(' ').length;
    const headingBonus = node.querySelectorAll('h1, h2, h3').length * 120;
    return textLength - Math.floor(linkLength * 0.7) + headingBonus;
  }

  function bestContentNode(root) {
    const preferred = Array.from(root.querySelectorAll([
      'article',
      'main',
      '[role="main"]',
      '[itemprop="articleBody"]',
      '[class*="article" i]',
      '[class*="content" i]',
      '[class*="post" i]',
      '[class*="story" i]',
    ].join(','))).filter((node) => cleanText(node.textContent).length > 400);

    const candidates = preferred.length ? preferred : Array.from(root.querySelectorAll('section, div, body'))
      .filter((node) => cleanText(node.textContent).length > 400);

    return candidates
      .map((node) => [node, scoreContainer(node)])
      .sort((a, b) => b[1] - a[1])[0]?.[0] || root.body || root;
  }

  function extractTextFrom(node) {
    const accepted = 'h1, h2, h3, p, li, blockquote';
    const blocks = Array.from(node.querySelectorAll(accepted)).map((el) => {
      const text = cleanText(el.textContent);
      if (text.length < 30 && !/^H[1-3]$/.test(el.tagName)) return '';
      return text;
    });

    return cleanText(uniqueBlocks(blocks).join('\n\n'));
  }

  function extractFallbackText() {
    const selectorGroups = [
      'article h1, article h2, article h3, article p, article li, article blockquote',
      'main h1, main h2, main h3, main p, main li, main blockquote',
      '[role="main"] h1, [role="main"] h2, [role="main"] h3, [role="main"] p, [role="main"] li, [role="main"] blockquote',
      '[itemprop="articleBody"] h1, [itemprop="articleBody"] h2, [itemprop="articleBody"] h3, [itemprop="articleBody"] p, [itemprop="articleBody"] li, [itemprop="articleBody"] blockquote',
      '[class*="article" i] h1, [class*="article" i] h2, [class*="article" i] h3, [class*="article" i] p, [class*="article" i] li, [class*="article" i] blockquote',
      '[class*="content" i] h1, [class*="content" i] h2, [class*="content" i] h3, [class*="content" i] p, [class*="content" i] li, [class*="content" i] blockquote',
      'h1, h2, h3, p, blockquote',
    ];

    for (const selectors of selectorGroups) {
      const blocks = uniqueBlocks(Array.from(document.querySelectorAll(selectors)).map((el) => el.textContent || ''));
      const text = cleanText(blocks.join('\n\n'));
      if (text.length >= 400) return text;
    }
    return '';
  }

  function extractWebpage() {
    const clone = document.cloneNode(true);
    removeClutter(clone);
    const content = bestContentNode(clone);
    const text = extractTextFrom(content) || extractFallbackText();
    if (text.length < 400) {
      throw new Error('Could not find enough readable article text on this page.');
    }

    const title = readMeta([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
      'h1',
    ]) || document.title.replace(/\s*[|-]\s*[^|-]+$/, '').trim() || 'Untitled Page';
    const author = readMeta([
      'meta[name="author"]',
      'meta[property="article:author"]',
      '[rel="author"]',
      '[class*="author" i]',
      '[itemprop="author"]',
    ]);
    const siteName = readMeta([
      'meta[property="og:site_name"]',
      'meta[name="application-name"]',
    ]) || location.hostname.replace(/^www\./, '');

    return {
      ok: true,
      video: {
        sourceType: 'webpage',
        title,
        author,
        siteName,
        url: location.href,
        sourceId: location.href.split('#')[0],
        text,
      },
    };
  }

  async function extractWebpageWithRetry() {
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return extractWebpage();
      } catch (error) {
        lastError = error;
        await sleep(500);
      }
    }
    throw lastError || new Error('Could not find enough readable article text on this page.');
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
          linear-gradient(145deg, #0f766e 0%, #2563eb 52%, #f59e0b 100%);
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
    const compactText = text === 'Error' ? '!' : text === 'Summarize page' || text === 'Open Summary' ? 'S' : text;
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
    if (!/^https?:$/i.test(location.protocol)) return null;
    ensureButtonStyles();
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'S';
    button.title = 'Summarize page';
    button.setAttribute('aria-label', 'Summarize page');
    button.addEventListener('click', () => {
      showOverlay().catch((error) => {
        console.error('Webpage summary failed:', error);
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
      #${OVERLAY_ID} .wpso-modal { background: #111827; border: 1px solid rgba(148, 163, 184, 0.32); border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,0.55); display: grid; grid-template-rows: auto auto 1fr auto; height: min(820px, calc(100vh - 48px)); overflow: hidden; width: min(1040px, calc(100vw - 48px)); }
      #${OVERLAY_ID} header, #${OVERLAY_ID} .wpso-controls, #${OVERLAY_ID} footer { border-bottom: 1px solid rgba(148, 163, 184, 0.18); padding: 12px 18px; }
      #${OVERLAY_ID} header { align-items: start; display: flex; gap: 14px; justify-content: space-between; }
      #${OVERLAY_ID} .wpso-eyebrow { color: #22c55e; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; margin: 0 0 3px; text-transform: uppercase; }
      #${OVERLAY_ID} h2 { color: #f8fafc; font-size: 18px; line-height: 1.25; margin: 0; }
      #${OVERLAY_ID} .wpso-meta, #${OVERLAY_ID} .wpso-status, #${OVERLAY_ID} .wpso-path { color: #94a3b8; font-size: 12px; margin: 4px 0 0; overflow-wrap: anywhere; }
      #${OVERLAY_ID} button { background: linear-gradient(135deg, #0f766e, #2563eb); border: 0; border-radius: 999px; color: white; cursor: pointer; font-weight: 800; min-height: 34px; padding: 7px 12px; }
      #${OVERLAY_ID} button.secondary { background: rgba(148, 163, 184, 0.16); color: #f8fafc; }
      #${OVERLAY_ID} button:disabled { cursor: wait; filter: grayscale(0.7); opacity: 0.7; }
      #${OVERLAY_ID} .wpso-controls { align-items: end; display: flex; flex-wrap: wrap; gap: 8px; }
      #${OVERLAY_ID} .wpso-row { align-items: end; display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; width: 100%; }
      #${OVERLAY_ID} .wpso-model-icons { display: inline-flex; gap: 6px; }
      #${OVERLAY_ID} .wpso-spacer { flex: 1 1 auto; min-width: 12px; }
      #${OVERLAY_ID} label { color: #94a3b8; display: grid; gap: 3px; font-size: 11px; }
      #${OVERLAY_ID} input, #${OVERLAY_ID} select { background: #020617; border: 1px solid rgba(148, 163, 184, 0.28); border-radius: 9px; color: #f8fafc; font: inherit; font-size: 12px; height: 34px; padding: 6px 9px; }
      #${OVERLAY_ID} input { width: min(360px, 54vw); }
      #${OVERLAY_ID} input[type="hidden"] { display: none; width: auto; }
      #${OVERLAY_ID} select { max-width: 145px; }
      #${OVERLAY_ID} .wpso-icon-button { align-items: center; display: inline-flex; height: 34px; justify-content: center; min-height: 34px; padding: 0; width: 34px; }
      #${OVERLAY_ID} .wpso-icon-button img { display: block; height: 19px; object-fit: contain; width: 19px; }
      #${OVERLAY_ID} .wpso-model-badge { color: #d1fae5; font-size: 11px; font-weight: 900; line-height: 1; }
      #${OVERLAY_ID} .wpso-icon-button[data-active="true"] { background: rgba(34, 197, 94, 0.2); box-shadow: inset 0 0 0 2px rgba(34, 197, 94, 0.72), 0 0 0 3px rgba(34, 197, 94, 0.12); }
      #${OVERLAY_ID} .wpso-redo { padding-inline: 13px; }
      #${OVERLAY_ID} .wpso-body { min-height: 0; overflow: auto; padding: 22px 28px; }
      #${OVERLAY_ID} .wpso-summary { color: #e5e7eb; font-size: 15px; line-height: 1.65; }
      #${OVERLAY_ID} .wpso-summary h1 { color: #f8fafc; font-size: 26px; line-height: 1.2; margin: 0 0 18px; }
      #${OVERLAY_ID} .wpso-summary h2 { border-bottom: 1px solid rgba(148, 163, 184, 0.18); color: #f8fafc; font-size: 20px; margin: 24px 0 12px; padding-bottom: 7px; }
      #${OVERLAY_ID} .wpso-summary h3 { color: #99f6e4; font-size: 16px; line-height: 1.35; margin: 20px 0 8px; }
      #${OVERLAY_ID} .wpso-summary p { margin: 0 0 12px; }
      #${OVERLAY_ID} .wpso-summary ul { margin: 0 0 14px; padding-left: 22px; }
      #${OVERLAY_ID} .wpso-summary li { margin: 7px 0; }
      #${OVERLAY_ID} .wpso-summary strong { color: #f8fafc; font-weight: 800; }
      #${OVERLAY_ID} footer { border-bottom: 0; border-top: 1px solid rgba(148, 163, 184, 0.18); display: flex; gap: 10px; justify-content: space-between; }
      #${OVERLAY_ID} progress { width: 160px; }
      @media (max-width: 760px) {
        #${OVERLAY_ID} .wpso-modal { height: calc(100vh - 20px); width: calc(100vw - 20px); }
        #${OVERLAY_ID} header, #${OVERLAY_ID} .wpso-controls, #${OVERLAY_ID} footer { padding-inline: 12px; }
        #${OVERLAY_ID} .wpso-spacer { display: none; }
        #${OVERLAY_ID} input { width: 180px; }
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
    modal.className = 'wpso-modal';

    const header = document.createElement('header');
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'wpso-eyebrow';
    eyebrow.textContent = 'Web Page -> Obsidian';
    const title = document.createElement('h2');
    title.dataset.role = 'title';
    title.textContent = 'Webpage summary';
    const meta = document.createElement('p');
    meta.className = 'wpso-meta';
    meta.dataset.role = 'meta';
    titleWrap.append(eyebrow, title, meta);
    const close = document.createElement('button');
    close.className = 'secondary';
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => { overlay.hidden = true; });
    header.append(titleWrap, close);

    const controls = document.createElement('div');
    controls.className = 'wpso-controls';
    const row = document.createElement('div');
    row.className = 'wpso-row';

    const model = document.createElement('input');
    model.type = 'hidden';
    model.dataset.role = 'model';
    model.value = DEFAULT_MODEL;
    const modelIcons = document.createElement('div');
    modelIcons.className = 'wpso-model-icons';
    modelIcons.appendChild(model);

    for (const [label, modelValue, iconPath] of MODEL_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary wpso-icon-button';
      button.title = `Redo with ${label}`;
      button.setAttribute('aria-label', `Redo with ${label}`);
      button.dataset.modelPreset = modelValue;
      if (iconPath) {
        const icon = document.createElement('img');
        icon.alt = '';
        icon.src = chrome.runtime.getURL(iconPath);
        button.appendChild(icon);
      } else {
        const badge = document.createElement('span');
        badge.className = 'wpso-model-badge';
        badge.textContent = label.slice(0, 2).toUpperCase();
        button.appendChild(badge);
      }
      button.addEventListener('click', () => runSummary({ force: true, model: modelValue }));
      modelIcons.appendChild(button);
    }
    row.appendChild(modelIcons);

    const spacer = document.createElement('span');
    spacer.className = 'wpso-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    row.appendChild(spacer);

    const categoryLabel = document.createElement('label');
    categoryLabel.textContent = 'Save folder';
    const category = document.createElement('select');
    category.dataset.role = 'category';
    for (const value of CATEGORIES) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      category.appendChild(option);
    }
    categoryLabel.appendChild(category);
    row.appendChild(categoryLabel);

    const move = document.createElement('button');
    move.type = 'button';
    move.className = 'secondary';
    move.textContent = 'Move to folder';
    move.addEventListener('click', moveToSelectedCategory);
    row.appendChild(move);

    const aiLabel = document.createElement('label');
    aiLabel.textContent = 'Send page text to';
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

    const sendPageButton = document.createElement('button');
    sendPageButton.type = 'button';
    sendPageButton.className = 'secondary';
    sendPageButton.textContent = 'Send page text';
    sendPageButton.addEventListener('click', sendPageToSelectedAi);
    row.appendChild(sendPageButton);

    const redo = document.createElement('button');
    redo.type = 'button';
    redo.className = 'wpso-redo';
    redo.textContent = 'Redo summary';
    redo.addEventListener('click', () => runSummary({ force: true, model: model.value.trim() || DEFAULT_MODEL }));
    row.appendChild(redo);

    controls.append(row);

    const body = document.createElement('div');
    body.className = 'wpso-body';
    const summary = document.createElement('article');
    summary.className = 'wpso-summary';
    summary.dataset.role = 'summary';
    body.appendChild(summary);

    const footer = document.createElement('footer');
    const statusWrap = document.createElement('div');
    const status = document.createElement('p');
    status.className = 'wpso-status';
    status.dataset.role = 'status';
    const path = document.createElement('p');
    path.className = 'wpso-path';
    path.dataset.role = 'path';
    statusWrap.append(status, path);
    const progress = document.createElement('progress');
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
    document.getElementById(OVERLAY_ID)?.querySelectorAll('button, input, select').forEach((el) => {
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

  function stripSourceTextSection(markdown) {
    return String(markdown || '').replace(/\n?## Source Text\s*\n[\s\S]*$/i, '').trim();
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
    const lines = stripSourceTextSection(stripFrontmatter(markdown)).split(/\r?\n/);
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
    const path = overlayPart('path');
    if (title) title.textContent = state.source?.title || 'Webpage summary';
    if (meta) meta.textContent = state.source ? `${state.source.author || state.source.siteName || location.hostname} - ${state.source.url}` : '';
    const selectedModel = state.model || DEFAULT_MODEL;
    if (model) model.value = selectedModel;
    document.getElementById(OVERLAY_ID)?.querySelectorAll('[data-model-preset]').forEach((button) => {
      button.dataset.active = button.dataset.modelPreset === selectedModel ? 'true' : 'false';
    });
    if (category) category.value = CATEGORIES.includes(state.category) ? state.category : 'General';
    if (summary) renderMarkdown(state.markdown || '', summary);
    if (path) path.textContent = state.path ? `Saved: ${state.path}` : '';
    if (state.markdown) {
      setStatus(fromCache ? 'Loaded cached summary. It did not rerun.' : `Done. Category: ${state.category}`);
      setActionButton('Open Summary', 'is-done');
    }
  }

  async function showOverlay() {
    if (state.busy) return;
    const overlay = buildOverlay();
    overlay.hidden = false;
    const cached = await readCachedSummary();
    if (cached?.markdown) {
      state = { ...state, ...cached, busy: false };
      renderState(true);
      return;
    }
    await runSummary({ force: false });
  }

  async function runSummary({ force, model = null }) {
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

    buildOverlay().hidden = false;
    setBusy(true, 'Extracting readable page text...');
    setProgress(10, 'Extracting readable page text...');
    try {
      await sleep(50);
      const extracted = await extractWebpageWithRetry();
      state.source = extracted.video;
      renderState(false);
      const selectedModel = model || overlayPart('model')?.value.trim() || DEFAULT_MODEL;
      state.model = selectedModel;
      setProgress(35, `Page text ready. Sending to ${selectedModel}...`);
      setBusy(true, `Sending page text to ${selectedModel}...`);
      const result = await sendMessage({ type: 'SUMMARIZE_AND_SAVE', video: state.source, model: selectedModel }, SUMMARY_RESPONSE_TIMEOUT_MS);
      if (!result.ok) throw new Error(result.error || 'Summarize failed.');
      setProgress(90, 'Saving Markdown note...');
      state = {
        ...state,
        markdown: result.markdown || '',
        path: result.path || '',
        category: result.category || 'General',
        model: result.model || selectedModel,
        busy: false,
      };
      await writeCachedSummary(state);
      setProgress(100, 'Summary ready.');
      renderState(false);
    } catch (error) {
      setActionButton('Error', 'is-error');
      setStatus(`Error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function moveToSelectedCategory() {
    if (!state.markdown || !state.source || state.busy) return;
    const category = overlayPart('category')?.value || state.category || 'General';
    setBusy(true, `Moving note to ${category}/...`);
    try {
      const result = await sendMessage({
        type: 'SAVE_MARKDOWN',
        video: state.source,
        markdown: state.markdown,
        category,
        previousPath: state.path,
      });
      if (!result.ok) throw new Error(result.error || 'Save failed.');
      state = {
        ...state,
        markdown: result.markdown || state.markdown,
        path: result.path || state.path,
        category: result.category || category,
        busy: false,
      };
      await writeCachedSummary(state);
      renderState(false);
      setStatus(`Moved to ${state.category}/`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function buildPagePrompt(source) {
    return [
      'Please analyze this webpage/article text in a concise structured-analysis style.',
      '',
      'Use this exact Markdown shape:',
      `# ${source.title || 'Untitled Page'}`,
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
      `Title: ${source.title || 'Untitled Page'}`,
      `Author/Site: ${source.author || source.siteName || location.hostname}`,
      `URL: ${source.url || location.href}`,
      '',
      'Extracted page text:',
      source.text,
    ].join('\n');
  }

  async function ensurePageSource() {
    if (state.source?.text) return state.source;
    const extracted = await extractWebpageWithRetry();
    state.source = extracted.video;
    return state.source;
  }

  async function sendPageToSelectedAi() {
    if (state.busy) return;
    const platformId = overlayPart('ai-platform')?.value || 'chatgpt';
    const platformName = AI_PLATFORMS.find(([id]) => id === platformId)?.[1] || 'AI chat';
    setBusy(true, `Preparing page text for ${platformName}...`);
    try {
      const source = await ensurePageSource();
      const result = await sendMessage({
        type: 'OPEN_AI_PLATFORM',
        platformId,
        analysisPrompt: buildPagePrompt(source),
      });
      if (!result.ok) throw new Error(result.error || 'Could not open AI chat.');
      setStatus(`Opened ${result.platform || platformName} and sent the page text.`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  ensureActionButton();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'OPEN_WEBPAGE_SUMMARY_OVERLAY') {
      showOverlay().catch((error) => {
        buildOverlay().hidden = false;
        setStatus(`Error: ${error.message}`);
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === 'EXTRACT_WEBPAGE_TEXT') {
      try {
        sendResponse(extractWebpage());
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return false;
    }

    return false;
  });
})();
