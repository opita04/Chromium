# YouTube Transcript AI Analyzer

Extracts YouTube video transcripts, formats them, and sends them to various AI platforms for analysis and summarization. Provides a floating icon bar UI for quick access to ChatGPT, Claude, Gemini, Mistral, Grok, and Qwen.

## Architecture Overview

- **Frontend:**
  - Chrome Extension content scripts inject UI and logic into YouTube and AI platform pages.
  - Floating icon bar for user interaction.
  - Handles transcript extraction, formatting, and prompt generation.
- **Backend:**
  - No backend server. All logic runs client-side in the browser extension.
- **Services/Data Layer:**
  - Uses `chrome.storage.local` for template and prompt storage.
  - Clipboard API for prompt transfer when needed.

## Technologies Used

- JavaScript (ES6+)
- Chrome Extension APIs (Manifest V3)
- HTML/CSS (injected via JS)
- SVG/PNG icons

## Setup Instructions

1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd YoutubeTranscribe
   ```
2. **Install dependencies:**
   - No build dependencies; all code is vanilla JS and static assets.
3. **Load the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `YoutubeTranscribe` folder
4. **Usage:**
   - Open a YouTube video
   - Wait for the transcript panel to load (auto-opens if possible)
   - Use the floating icon bar to send the transcript to your preferred AI platform

## Testing

- Manual testing: Interact with the extension on YouTube and supported AI platforms.
- Check the browser console for logs and errors.

## Deployment/Build Instructions

- No build step required. To deploy, zip the `YoutubeTranscribe` folder and upload to the Chrome Web Store or distribute as an unpacked extension. 