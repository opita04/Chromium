# API Reference

This extension does **not** have a backend API. All logic runs client-side in the browser. However, it uses several internal APIs and browser extension APIs for data flow and communication.

## Internal APIs & Extension APIs

### 1. chrome.storage.local
- **Purpose:** Store and retrieve the analysis template and, for some platforms, the generated prompt.
- **Methods Used:**
  - `chrome.storage.local.get([key], callback)`
  - `chrome.storage.local.set({ key: value }, callback)`
- **Usage:**
  - Store the user's analysis template.
  - Temporarily store prompts for Claude and Grok before opening their sites.

### 2. Clipboard API
- **Purpose:** Transfer long prompts to AI platforms that support pasting.
- **Methods Used:**
  - `navigator.clipboard.writeText(text)`
- **Usage:**
  - Copy the formatted prompt to the clipboard when it is too long for a URL parameter.

### 3. Content Script Messaging (if extended)
- **Purpose:** Communicate between content scripts and background/service worker (not heavily used in current version).
- **Methods:**
  - `chrome.runtime.sendMessage`, `chrome.runtime.onMessage`
- **Usage:**
  - Can be extended for advanced features (e.g., background processing, cross-tab communication).

### 4. DOM Interaction
- **Purpose:** Extract transcript data and inject UI.
- **Methods:**
  - Standard DOM APIs (`querySelector`, `addEventListener`, etc.)
- **Usage:**
  - Find and extract transcript segments from YouTube.
  - Inject and manage the floating icon bar UI. 