// ai_content_script.js
console.log("[AI CONTENT SCRIPT] Script loaded for platform:", window.location.hostname);

console.log("[AI CONTENT SCRIPT] Loaded on", window.location.hostname);

// Platform selectors (verify and update as needed)
const PLATFORM_SELECTORS = {
  "chat.openai.com": {
    input: 'textarea#prompt-textarea, div[contenteditable="true"], textarea, input[type="text"], [contenteditable="true"]',
    send: 'button[data-testid="send-button"], button[type="submit"], button[aria-label*="send" i], button'
  },
  "chatgpt.com": {
    input: 'textarea#prompt-textarea, div[contenteditable="true"], textarea, input[type="text"], [contenteditable="true"]',
    send: 'button[data-testid="send-button"], button[type="submit"], button[aria-label*="send" i], button'
  },
  "claude.ai": {
    input: 'div[contenteditable="true"], textarea, input[type="text"], [contenteditable="true"]',
    send: 'button[aria-label*="send" i], button[type="submit"], button'
  },
  "gemini.google.com": {
    input: 'textarea[aria-label*="chat" i], div[contenteditable="true"], textarea, [contenteditable="true"]',
    send: 'button[aria-label*="send" i], button[type="submit"], button'
  },
  "chat.mistral.ai": {
    input: 'textarea[placeholder*="message" i], div[contenteditable="true"], textarea, input[type="text"], [contenteditable="true"]',
    send: 'button[type="submit"], button[aria-label*="send" i], button'
  },
  "grok.com": {
    input: 'textarea, div[contenteditable="true"], input[type="text"], [contenteditable="true"]',
    send: 'button[type="submit"], button'
  },
  "chat.deepseek.com": {
    input: 'textarea#chat-input, textarea[placeholder*="message" i], textarea, div[contenteditable="true"], [contenteditable="true"]',
    send: 'button.ds-icon-button:has(svg), button[type="submit"], button[aria-label*="send" i], .ds-icon-button, button'
  }
};

function getPlatformId() {
  const host = window.location.hostname;
  if (host.includes('openai.com') || host.includes('chatgpt.com')) return 'chatgpt';
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('gemini.google.com')) return 'gemini';
  if (host.includes('chat.mistral.ai')) return 'mistral';
  if (host.includes('grok.com')) return 'grok';
  if (host.includes('chat.deepseek.com')) return 'deepseek';
  return null;
}

// Wait for element utility
function waitForElement(selector, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error("Element not found: " + selector));
    }, timeout);
  });
}

  // Paste and send logic
async function pasteAndSend(platformId, analysisPrompt) {
  console.log("[AI CONTENT SCRIPT] pasteAndSend called for platform:", platformId, "on host:", window.location.hostname, "with prompt length:", analysisPrompt.length);
  const host = window.location.hostname;
  let selectors = PLATFORM_SELECTORS[host];
  if (!selectors && host.endsWith("claude.ai")) selectors = PLATFORM_SELECTORS["claude.ai"];
  if (!selectors && host.endsWith("chat.openai.com")) selectors = PLATFORM_SELECTORS["chat.openai.com"];
  if (!selectors && host.endsWith("chatgpt.com")) selectors = PLATFORM_SELECTORS["chatgpt.com"];
  if (!selectors && host.endsWith("gemini.google.com")) selectors = PLATFORM_SELECTORS["gemini.google.com"];
  if (!selectors && host.endsWith("chat.mistral.ai")) selectors = PLATFORM_SELECTORS["chat.mistral.ai"];
  if (!selectors && host.endsWith("grok.com")) selectors = PLATFORM_SELECTORS["grok.com"];
  if (!selectors && host.endsWith("chat.deepseek.com")) selectors = PLATFORM_SELECTORS["chat.deepseek.com"];
  if (!selectors) {
    console.error("[AI CONTENT SCRIPT] ERROR: No selectors defined for this platform:", host);
    return;
  }
  
  // Special handling for Mistral - try multiple selector combinations
  if (host.includes('mistral.ai')) {
    console.log("[AI CONTENT SCRIPT] Using special Mistral handling");
  }
  console.log("[AI CONTENT SCRIPT] Using selectors for", host, ":", selectors);

  // Find input
  let inputEl;
  for (const sel of selectors.input.split(',')) {
    try {
      inputEl = await waitForElement(sel.trim());
      if (inputEl) {
        console.log("[AI CONTENT SCRIPT] Found input element with selector:", sel.trim(), "Element:", inputEl, "TagName:", inputEl.tagName);
        break;
      }
    } catch (e) {
      console.log("[AI CONTENT SCRIPT] Selector failed:", sel.trim(), "Error:", e.message);
    }
  }
  if (!inputEl) {
    console.error("[AI CONTENT SCRIPT] CRITICAL ERROR: Input field not found for", host, ". Please check selectors.");
    // Debugging: log all possible input fields
    console.log("All textareas found:", document.querySelectorAll('textarea'));
    console.log("All inputs found:", document.querySelectorAll('input'));
    console.log("All contenteditables found:", document.querySelectorAll('div[contenteditable="true"]'));
    return;
  }

  // Set value (handle contenteditable or textarea)
  console.log("[AI CONTENT SCRIPT] Attempting to inject text into:", inputEl.tagName);
  inputEl.focus();
  
  let injectionSuccess = false;
  try {
    // Standard approach for modern frameworks: focus -> selectAll -> insertText
    // This often triggers the internal state updates (React/Vue/etc) better than direct assignment
    document.execCommand('selectAll', false, null);
    injectionSuccess = document.execCommand('insertText', false, analysisPrompt);
    console.log("[AI CONTENT SCRIPT] execCommand('insertText') result:", injectionSuccess);
  } catch (e) {
    console.warn("[AI CONTENT SCRIPT] execCommand failed:", e.message);
  }

  if (!injectionSuccess) {
    console.log("[AI CONTENT SCRIPT] Falling back to direct value/innerText assignment");
    if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
      inputEl.value = analysisPrompt;
    } else {
      inputEl.innerText = analysisPrompt;
    }
  }

  // Trigger events to notify the page of the change
  const events = ['input', 'change', 'keyup', 'keydown'];
  events.forEach(type => {
    inputEl.dispatchEvent(new Event(type, { bubbles: true }));
  });

  // Give the SPA a moment to process the input and enable the send button
  await new Promise(r => setTimeout(r, 500));

  // Find send button
  let sendBtn;
  for (const sel of selectors.send.split(',')) {
    try {
      sendBtn = await waitForElement(sel.trim());
      if (sendBtn && !sendBtn.disabled) {
        console.log("[AI CONTENT SCRIPT] Found send button with selector:", sel.trim(), "Element:", sendBtn);
        break;
      }
    } catch (e) {
      console.log("[AI CONTENT SCRIPT] Send button selector failed:", sel.trim(), "Error:", e.message);
    }
  }
  if (!sendBtn) {
    console.error("[AI CONTENT SCRIPT] CRITICAL ERROR: Send button not found for", host, ". Please check selectors.");
    // Debugging: log all possible send buttons
    console.log("All buttons found:", document.querySelectorAll('button'));
    console.log("All submit buttons found:", document.querySelectorAll('button[type="submit"]'));
    console.log("All div[role=button] found:", document.querySelectorAll('div[role="button"]'));
    return;
  }

  // Click send
  console.log("[AI CONTENT SCRIPT] Clicking send button.");
  sendBtn.click();
}

// Listen for messages from the background script
let lastProcessedPrompt = null;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    console.log("[AI CONTENT SCRIPT] Received PING message");
    sendResponse({ status: "ready" });
    return;
  }
  
  if (message.type === "INJECT_ANALYSIS_PROMPT") {
    if (lastProcessedPrompt === message.analysisPrompt) {
      console.log("[AI CONTENT SCRIPT] Ignoring duplicate message");
      return;
    }
    lastProcessedPrompt = message.analysisPrompt;
    const { platformId, analysisPrompt } = message;
    console.log("[AI CONTENT SCRIPT] Received INJECT_ANALYSIS_PROMPT message:", analysisPrompt);
    pasteAndSend(platformId, analysisPrompt);
  }
});