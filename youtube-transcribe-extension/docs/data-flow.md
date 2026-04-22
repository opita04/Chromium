# Data Flow

## 1. Transcript Extraction
- The content script waits for the YouTube transcript panel to appear.
- It queries the DOM for all transcript segment elements and extracts their text.

## 2. Template Application
- The extracted transcript and video title are inserted into a user-editable template (from `chrome.storage.local`).
- The result is a formatted prompt ready for AI analysis.

## 3. Sending the Prompt to AI Platforms
- **ChatGPT, Gemini, Mistral, Qwen:**
  - If the prompt is short, it is sent via a URL parameter (`quicktube`).
  - If too long, it is copied to the clipboard and the user is prompted to paste it into the AI chat.
- **Claude, Grok:**
  - The prompt is stored in `chrome.storage.local` with a unique key.
  - The AI platform is opened in a new tab, where a content script can retrieve and use the prompt.

## 4. State Management
- **chrome.storage.local:**
  - Stores the analysis template and, for some platforms, the generated prompt.
- **Clipboard:**
  - Used for transferring long prompts to AI platforms that support pasting.

## 5. User Interaction
- The user interacts with the floating icon bar to trigger transcript extraction and prompt sending.
- Notifications inform the user of success, errors, or required manual actions (e.g., "Paste the prompt"). 