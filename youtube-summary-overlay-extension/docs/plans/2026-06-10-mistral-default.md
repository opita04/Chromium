---
title: Mistral Default Model
date: 2026-06-10
origin: user request
execution: code
---

# Mistral Default Model

## Problem Frame

The extension currently defaults new summaries to Nemotron, while Mistral Small remains available as a fallback and preset. The requested change is to make Mistral the default model again and do a quick health check so the browser overlay, sidepanel, native host, docs, and tests agree.

## Scope Boundaries

- In scope: default model constants, visible default copy, preset active state behavior, native fallback semantics, tests, and README wording.
- Out of scope: changing prompt shape, saved Markdown format, native host registration, model provider APIs, or the existing OpenRouter timeout mechanism beyond adjusting it to avoid falling back from Mistral to itself.
- Existing unrelated parent-worktree changes outside this folder must be left untouched.

## Requirements Traceability

- User request: "change the default to mistral" means all default surfaces should select `mistralai/mistral-small-24b-instruct-2501` when no explicit model is provided.
- User request: "do a quick check to make sure everything is good" means run the local summarizer test and syntax checks for the changed JavaScript files.
- Prior repo pattern: model defaults are duplicated across UI, content script, native summarizer, tests, and docs, so the change must cover each copy together.

## Existing Patterns

- `content/youtube-transcript.js` owns the overlay default, model preset buttons, and waiting status text.
- `sidepanel/panel.html` and `sidepanel/panel.js` own the sidepanel input default, hint copy, active preset, and redo model buttons.
- `native/summarizer.js` owns the native default and timeout fallback behavior.
- `tests/summarizer.test.js` asserts default model constants and native output behavior.
- `README.md` documents the default model and timeout fallback.

## Implementation Units

### U1: Switch Runtime Defaults to Mistral

Files:
- Modify: `content/youtube-transcript.js`
- Modify: `sidepanel/panel.js`
- Modify: `native/summarizer.js`

Approach:
- Set each `DEFAULT_MODEL` constant to `mistralai/mistral-small-24b-instruct-2501`.
- Keep Nemotron selectable as a preset.
- Update the native fallback guard so Mistral defaults do not timeout and retry the same model. Preserve the fallback path for Nemotron when it is explicitly selected and times out.
- Update overlay waiting copy so default-specific text names Mistral rather than Nemotron.

Test scenarios:
- No explicit model uses Mistral in the overlay, sidepanel, and native summarizer.
- Explicit Nemotron selection remains available and can still use the timeout fallback.
- Explicit non-default models keep existing timeout behavior.

Verification:
- `node --check content/youtube-transcript.js`
- `node --check sidepanel/panel.js`
- `node --check native/summarizer.js`
- `node tests/summarizer.test.js`

### U2: Align Visible Defaults, Docs, and Assertions

Files:
- Modify: `sidepanel/panel.html`
- Modify: `tests/summarizer.test.js`
- Modify: `README.md`

Approach:
- Change the sidepanel input value and hint text to Mistral Small.
- Update the test assertion for `DEFAULT_MODEL`.
- Update README language to describe Mistral as the default and Nemotron as an optional preset with fallback behavior when selected.

Test scenarios:
- Sidepanel initial value displays the Mistral model id.
- Sidepanel hint text matches the default users will see.
- Tests assert the same default exported by the native summarizer.

Verification:
- `node --check sidepanel/panel.js`
- `node tests/summarizer.test.js`
- Search for stale Nemotron default copy with `rg`.

## Dependencies and Sequencing

U1 should land before U2 because docs and tests should describe the runtime behavior after constants are changed. Verification runs after both units.

## Risks

- Missing a duplicated default surface would make the extension appear inconsistent.
- If `FALLBACK_MODEL` remains the same as `DEFAULT_MODEL`, timeout fallback could become misleading or redundant.
- Parent git status is noisy, so validation and final reporting should distinguish this folder's changes from unrelated sibling changes.
