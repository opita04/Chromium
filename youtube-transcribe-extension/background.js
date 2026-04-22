// background.js (service worker)

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "OPEN_AI_PLATFORM") {
    const { platformId, analysisPrompt } = message;
    const platform = AI_PLATFORMS.find(p => p.id === platformId);
    if (!platform) return;

    console.log("[BG] Creating new tab for", platform.url);
    chrome.tabs.create({ url: platform.url, active: true }, (tab) => {
      const tabId = tab.id;
      const onUpdated = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);

          // Wait 3 seconds for content script to fully load, then send message
          setTimeout(() => {
            let attempts = 0;
            const maxAttempts = 3;
            const retryDelay = 1000; // 1 second

            const sendMessageWithRetry = () => {
              attempts++;
              console.log(`[BG] Attempt ${attempts} to send message to ai_content_script.js for tab ${tabId}`);
              
              chrome.tabs.sendMessage(tabId, {
                type: "INJECT_ANALYSIS_PROMPT",
                platformId,
                analysisPrompt
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn(`[BG] Error sending message (Attempt ${attempts}):`, chrome.runtime.lastError.message);
                  if (attempts < maxAttempts) {
                    setTimeout(sendMessageWithRetry, retryDelay);
                  } else {
                    console.warn(`[BG] Failed to send message after ${maxAttempts} attempts for tab ${tabId}. This is normal if the page is still loading.`);
                  }
                } else {
                  console.log("[BG] Analysis prompt successfully sent to ai_content_script.js.");
                }
              });
            };
            sendMessageWithRetry();
          }, 3000); // Wait 3 seconds before starting
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  }
});

// AI platforms config (must be duplicated here for background context)
const AI_PLATFORMS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?model=gpt-4o-mini&quicktube' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/chats' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app?quicktube=' },
  { id: 'mistral', name: 'Mistral', url: 'https://chat.mistral.ai/chat?quicktube' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/?quicktube' }
];