# Component Map

## Core Files & Modules

- **manifest.json**
  - Declares extension metadata, permissions, content scripts, and background service worker.

- **youtube_content_script.js**
  - Injected into YouTube video pages. Handles transcript extraction, floating icon bar UI, prompt formatting, and AI platform integration logic.

- **ai_content_script.js**
  - Injected into supported AI platform pages. Handles prompt transfer from storage to the AI chat input (if needed).

- **background.js**
  - Service worker for background tasks (minimal use in this extension; can be extended for future features).

- **/images**
  - Contains SVG and PNG icon assets for the floating icon bar (one per AI platform, plus settings/copy icons). 