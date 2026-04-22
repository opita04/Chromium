// Background script for Mark Watched YouTube Videos extension
// Handles messaging from content scripts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_AI_PLATFORM') {
    // Handle AI platform opening requests
    const { platformId, analysisPrompt } = message;

    // AI platform URLs
    const platformUrls = {
      'chatgpt': 'https://chat.openai.com/',
      'claude': 'https://claude.ai/chats',
      'gemini': 'https://gemini.google.com/app?quicktube=',
      'mistral': 'https://chat.mistral.ai/chat?quicktube',
      'grok': 'https://grok.com/',
      'qwen': 'https://chat.qwen.ai'
    };

    const url = platformUrls[platformId];
    if (url) {
      // Open the AI platform in a new tab
      chrome.tabs.create({ url: url }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('Error opening tab:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, tabId: tab.id });
        }
      });
    } else {
      sendResponse({ success: false, error: 'Unknown platform' });
    }

    // Return true to indicate we'll send a response asynchronously
    return true;
  }

  // Handle other message types if needed
  return false;
});

// Extension initialization
console.log('Mark Watched YouTube Videos background script loaded');