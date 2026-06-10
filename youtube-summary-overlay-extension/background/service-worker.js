const HOST_NAME = 'com.opita.youtube_summary_sidepanel';
const NATIVE_MESSAGE_TIMEOUT_MS = 30000;
const AI_PLATFORMS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?model=gpt-4o-mini&quicktube' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/chats' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app?quicktube=' },
  { id: 'mistral', name: 'Mistral', url: 'https://chat.mistral.ai/chat?quicktube' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/?quicktube' },
];

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
      const result = await sendNativeMessage({
        type: 'summarizeAndSave',
        video: message.video,
        model: message.model,
      });
      sendResponse(result);
      return;
    }

    if (message?.type === 'SAVE_MARKDOWN') {
      const result = await sendNativeMessage({
        type: 'saveMarkdown',
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
