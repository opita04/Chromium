# Architecture Overview

## High-Level Structure

- **Manifest (manifest.json):**
  - Declares permissions, content scripts, and extension metadata.
- **Content Scripts:**
  - `youtube_content_script.js`: Injected into YouTube video pages. Handles transcript extraction, UI, and AI integration.
  - `ai_content_script.js`: Injected into AI platform pages (ChatGPT, Claude, Gemini, Mistral, Grok, Qwen) to facilitate prompt transfer if needed.
- **Assets:**
  - SVG/PNG icons in `/images` for the floating icon bar.

## UI Injection & Logic

- On YouTube video pages, the extension injects a floating icon bar UI (vertical stack, right side).
- The icon bar provides one-click access to send the transcript to various AI platforms.
- Clicking an icon triggers transcript extraction, prompt formatting, and platform-specific logic (URL param, clipboard, or storage).

## Transcript Extraction & AI Integration

- The script waits for the transcript panel to appear, then extracts all transcript segments.
- The transcript is formatted using a customizable template (stored in `chrome.storage.local`).
- For each AI platform:
  - **ChatGPT, Gemini, Mistral, Qwen:**
    - If the prompt is short, it is sent via a URL parameter (`quicktube`).
    - If too long, it is copied to the clipboard and the user is prompted to paste it.
  - **Claude, Grok:**
    - The prompt is stored in `chrome.storage.local` and the platform is opened in a new tab.

## State Management & Data Flow

- **chrome.storage.local:**
  - Stores the analysis template and, for some platforms, the generated prompt.
- **Clipboard API:**
  - Used for transferring long prompts to AI platforms that support pasting.
- **No backend server:**
  - All logic and state are managed client-side in the browser.

## Site Interaction

- **YouTube:**
  - The script interacts with the DOM to find and open the transcript panel, extract text, and inject UI.
- **AI Platforms:**
  - The script opens the appropriate AI site in a new tab, passing the prompt via URL, clipboard, or storage as needed. 