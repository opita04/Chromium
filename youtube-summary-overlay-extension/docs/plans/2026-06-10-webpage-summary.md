---
title: Webpage Summary Extraction
date: 2026-06-10
status: ready
execution: code
origin: user request in Codex thread
---

# Webpage Summary Extraction Plan

## Problem Frame

The extension summarizes YouTube transcripts well, but the user also wants to summarize average news and text-heavy web pages, such as an Android Police article, without carrying unnecessary page formatting, nav, ads, sidebars, comments, or related-post clutter into the note. The implementation should reuse the existing OpenRouter/native-host/Obsidian save pipeline where possible.

## Scope Boundaries

- Add a web-page/article summary path for normal HTTPS pages using the active tab.
- Keep the current YouTube transcript workflow intact.
- Do not build a crawler, paywall bypass, archive reader, RSS reader, or multi-page collector.
- Do not require broad all-site host permissions if `activeTab` and `scripting` are enough for user-initiated extraction.
- Do not replace the existing sidepanel workflow unless small wording updates are needed.
- Preserve existing model-default migration behavior in `content/youtube-transcript.js`.

## Requirements Trace

- User request: "In addition to the youtube sumarry, is there a way for it to grab average news/text based web pages and do the same. Without grabbing unnecesarry formatting..."
- Example source: `https://www.androidpolice.com/gemini-for-home-update-4-18/`
- The action should work on non-YouTube text pages and produce the same kind of saved Markdown summary.
- Extracted source text should be clean, readable article/body text, not raw HTML or page chrome.
- Existing YouTube summaries, cached overlay behavior, category moves, and native save behavior should keep working.

## Existing Patterns To Follow

- `background/service-worker.js` already owns active-tab routing, native-host calls, and action-click behavior.
- `content/youtube-transcript.js` owns the YouTube page overlay, extraction, cache, rendered Markdown preview, and progress/status UI.
- `native/summarizer.js` owns prompt construction, OpenRouter calls, frontmatter, categorization, output paths, and Markdown saving.
- `tests/summarizer.test.js` is the current lightweight regression suite for native prompt and Markdown behavior.

## Technical Decisions

- Use a dedicated non-YouTube content script, `content/webpage-summary.js`, for article extraction and article overlay behavior. This keeps YouTube-specific DOM handling out of the generic page path.
- Use a local, dependency-free readability-style extractor first: remove known non-content elements, prefer semantic article/main selectors, collect headings and paragraphs, and fall back to the best text-dense container. This avoids adding a build/bundling step for `@mozilla/readability` in this simple extension.
- Reuse the native host by changing the native data model from YouTube-only `video.transcript` assumptions to a source object that can carry `sourceType`, `title`, `author`, `siteName`, `url`, `sourceId`, and `text`. Continue accepting legacy `video.transcript` so existing messages do not break.
- Keep cache keys source-specific: YouTube by video ID, webpages by normalized URL.
- For action clicks, route YouTube watch pages to the existing content script and supported web pages to `content/webpage-summary.js` via `chrome.scripting.executeScript`.

## Implementation Units

### U1: Generalize Native Summarizer For Source Text

Files:
- Modify: `native/summarizer.js`
- Modify: `native/host.js`
- Modify: `tests/summarizer.test.js`

Approach:
- Introduce source-normalization helpers that accept both the existing YouTube-shaped object and a generic page-shaped object.
- Add a source-aware prompt builder that uses YouTube wording for transcripts and article/webpage wording for extracted page text.
- Update Markdown frontmatter and `## Source` output to include `source`, `title`, `url`, category, model, generated time, and usage for all sources, while keeping YouTube channel/video ID metadata for YouTube notes.
- Update output filename generation to use the page site/author where channel is not available.
- Keep `summarizeAndSave({ video, model })` as the message contract, but allow `video.sourceType === "webpage"` and `video.text`.

Test Scenarios:
- YouTube fixture still produces `source: youtube`, transcript section, channel, and video ID.
- Webpage fixture produces `source: webpage`, clean source text section, URL, no `Unknown Channel`, and a stable filename.
- Webpage prompt asks for article/webpage analysis and does not mention YouTube transcript.
- Category classification uses webpage text as well as title.
- Legacy save/move behavior still avoids duplicate transcript/source sections.

Verification:
- `node tests/summarizer.test.js`
- `node --check native/summarizer.js`
- `node --check native/host.js`

### U2: Add Generic Webpage Extraction Content Script

Files:
- Create: `content/webpage-summary.js`
- Modify: `background/service-worker.js`
- Modify: `manifest.json`

Approach:
- Add a generic extractor that clones the DOM, removes scripts/styles/nav/footer/aside/forms/dialogs/comments and common ad/share/related selectors, then chooses article/main/high-density content.
- Return a source object with `sourceType: "webpage"`, title, author, site name, URL, source ID, and cleaned plain text.
- Add a compact overlay/status UI for web pages that mirrors the YouTube flow enough to show progress, render saved Markdown, and cache by URL.
- Inject the script on demand from the action click for non-YouTube `http` and `https` tabs.
- Keep the content script self-contained so it can run on arbitrary active tabs without external dependencies.

Test Scenarios:
- Action click on a YouTube watch URL still sends `OPEN_SUMMARY_OVERLAY` to the existing script.
- Action click on a normal HTTPS page injects `content/webpage-summary.js` and sends `OPEN_WEBPAGE_SUMMARY_OVERLAY`.
- Unsupported tabs such as browser internal pages fail with a clear error rather than trying to inject.
- Extractor drops common non-article elements and returns readable text from an article/main body.

Verification:
- `node --check background/service-worker.js`
- `node --check content/webpage-summary.js`
- Manual extension smoke path when possible on a public article page.

### U3: Refresh User-Facing Copy And Docs

Files:
- Modify: `manifest.json`
- Modify: `README.md`
- Optionally modify: `sidepanel/panel.html`

Approach:
- Rename extension/action copy from YouTube-only wording to video/webpage summary wording where appropriate.
- Document the new webpage workflow, limits, and expected extraction behavior.
- Leave sidepanel YouTube-specific copy in place if the sidepanel still only loads transcripts.

Test Scenarios:
- Manifest remains valid JSON.
- README tells the user that average article pages can be summarized via the extension action and that extraction is best-effort.

Verification:
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"`

## Dependencies And Sequencing

1. Complete U1 first so webpage summaries can use the existing native save path.
2. Complete U2 after the native path accepts generic source text.
3. Complete U3 after behavior is stable, so documentation matches the implemented surface.

## Risks

- Readability heuristics are best-effort. Some sites with heavy client rendering or paywalls may expose too little article text.
- Generic injection can fail on Chrome internal pages, extension pages, or sites that restrict content scripts.
- The existing content script has uncommitted default-model edits; implementation must preserve those changes while adding the new path.

## Verification Plan

- Run syntax checks for changed JavaScript files.
- Run `node tests/summarizer.test.js`.
- Exercise the background/action routing logic enough to confirm YouTube and generic page paths are distinct.
- If the extension is loaded locally during verification, test a real article page and confirm the saved Markdown is clean, source-labeled, and readable.
