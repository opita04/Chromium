# YouTube Summary Overlay

Chromium extension for Jaime's daily YouTube and readable web-page summary workflow.

## What it does

- Adds a compact circular **S** button on the right side of YouTube watch pages, so you do not have to use only the browser extension icon.
- Clicking the YouTube-page button or extension button starts the summary run in the background.
- Clicking the extension button on a normal `http` or `https` article page extracts readable page text, summarizes it, and saves it with the same native OpenRouter/Obsidian pipeline.
- The button changes to progress text like `5%`, `10%`, `35%`, etc. while it works.
- The large overlay/modal opens only after the summary is ready, so you do not see a half-loaded panel.
- The overlay shows normally formatted headings and bullets, not raw Markdown or the transcript.
- Closing and reopening the overlay reloads the cached result for that video from extension storage; it does not rerun the LLM unless you click a redo model button or “Redo summary”.
- Extracts the YouTube transcript and uses a more robust channel-name fallback for modern YouTube/collaboration pages.
- Extracts readable article/page text by removing common navigation, ads, comments, related links, sidebars, forms, and other page chrome before summarizing.
- Sends transcript or webpage text to OpenRouter via the native host.
- Adds an optional overlay dropdown to send the full transcript prompt to ChatGPT, Claude, Gemini, Mistral, Grok, or DeepSeek.
- Uses the default model: `mistralai/mistral-nemo`. A Free Route option (using `openrouter/free`) is available as a preset, with a timeout fallback to Mistral Nemo if OpenRouter queues it too long.
- Adds overlay redo buttons for DeepSeek Flash, Qwen Flash, Gemini Lite, Mistral Nemo, Free Route, and GPT-5 Nano.
- Lets you override the detected save folder after a summary is generated and move the Markdown note into a different category folder.
- Saves Markdown notes under category folders inside:

```text
/Users/opita/Documents/Obsidian/youtube-summaries
```

## Markdown shape

```md
---
source: youtube # or webpage
category: "Educational"
...
---

# Video Title

## Takeaways
- ...

## Main Points
- ...

## Source
- Channel: ... # or Author/Site: ...
- URL: ...
```

Notes are routed into no more than 10 folders:

```text
Political, Coding, Educational, General, Business, AI, Finance, Health, Science, Others
```

Political content is always routed to `Political/` when the title, transcript, or summary has political signals. If the category is wrong, use the overlay “Save folder” dropdown and click “Move to folder”; it updates the Markdown frontmatter and removes the previous saved copy from the old category folder.

Web-page extraction is best effort. It works best on text-heavy article pages with real paragraph content. Browser internal pages, paywalled previews, and heavily client-rendered pages may expose too little readable text to summarize.

## Install / reload

```sh
node /Users/opita/Projects/Chromium/youtube-summary-overlay-extension/scripts/install-native-host.js
```

Then open `chrome://extensions`, enable Developer Mode, and Load Unpacked:

```text
/Users/opita/Projects/Chromium/youtube-summary-overlay-extension
```

The manifest pins a dedicated extension ID so the native host allowlist remains stable:

```text
lbbncpgjnoffnhihjnomphmabaieaaoo
```

## API key

The native host looks for the OpenRouter API key in this order:

1. `~/.hermes/.env` as `OPENROUTER_API_KEY` or `OPENROUTER_APIKEY`
2. Process environment
3. macOS Keychain generic password service names:
   - `OPENROUTER_API_KEY`
   - `openrouter`
   - `openrouter-api-key`

Recommended macOS Keychain setup:

```sh
security add-generic-password -a "$USER" -s openrouter -w 'YOUR_OPENROUTER_KEY' -U
```

Then reload the extension/native host.

Safari/browser-direct fallback does not use the native host. If native messaging
is unavailable, either set a private extension-storage key named
`openRouterApiKey` / `OPENROUTER_API_KEY`, or create an ignored local file at
`background/local-secrets.js` containing:

```js
self.OPENROUTER_API_KEY = 'YOUR_OPENROUTER_KEY';
```

Do not paste provider keys into checked-in JavaScript.

## Test

```sh
node /Users/opita/Projects/Chromium/youtube-summary-overlay-extension/tests/summarizer.test.js
node --check /Users/opita/Projects/Chromium/youtube-summary-overlay-extension/**/*.js
```
