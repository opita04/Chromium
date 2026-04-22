# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Nyaa Auto Download is a Manifest V3 browser extension that automatically tracks and downloads anime episodes from Nyaa.si. The extension uses Chrome's service worker architecture with content scripts injected into Nyaa.si pages.

## Common Development Commands

### Building and Packaging
```bash
# Install dependencies
npm install

# Build extension for distribution (creates zip package)
npm run build
# or directly:
node build.js

# Development mode (no actual build needed - load unpacked)
npm run dev
```

### Loading Extension for Development
1. Open Chrome/Edge and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the extension folder
4. No build process required for development - extension files are used directly

## Architecture Overview

### Core Components

**Background Service Worker** (`background/service-worker.js`)
- Handles periodic episode checking via Chrome alarms (every 5 minutes)
- Manages extension settings and data persistence
- **Critical Constraint**: Cannot launch magnet links due to user gesture requirements
- Stores new episodes for manual download through popup interface
- Sends browser notifications for new episodes

**Content Script** (`content/content-script.js`)
- Injected into Nyaa.si pages to add "Track" buttons
- Extracts anime series names and episode information from torrent titles
- Communicates with background script to add anime to tracking list
- Handles episode parsing with multiple format support (S01E01, Ep 12, etc.)

**Popup Interface** (`popup/popup.js`)
- Primary user interface for managing tracked anime
- **Handles magnet link downloads synchronously** to comply with user gesture requirements
- Implements download queue for reliable handling of multiple episodes
- Provides manual download interface when auto-download fails

**Options Page** (`options/options.js`)
- Full settings management interface
- Data import/export functionality
- Advanced configuration options

### Data Flow

1. User clicks "Track" button on Nyaa.si → Content script extracts series info → Background script stores anime
2. Background service worker periodically checks tracked anime URLs for new episodes
3. New episodes are stored in local storage and notifications sent
4. User opens popup to manually download episodes (required due to Chrome security restrictions)

### Critical Chrome Extension Constraints

**User Gesture Requirements for Magnet Links:**
- Magnet links can only be opened synchronously within user-initiated events
- Background scripts cannot launch external protocols without user gestures
- All magnet link handling must be in popup.js with synchronous event handlers
- Never use async/await in the direct path from user click to magnet link opening

## Key Files and Their Purpose

- `manifest.json` - Extension configuration (Manifest V3)
- `background/service-worker.js` - Background processing and episode checking
- `content/content-script.js` - Nyaa.si page integration
- `popup/popup.js` - Main user interface and download handling
- `options/options.js` - Settings management
- `build.js` - Creates production zip package
- `knowledge.md` - Important development notes about magnet link handling

## Development Guidelines

### Episode Parsing
The extension supports multiple episode number formats:
- S01E01, S1E12 (season-episode)
- S4 - 08 (season-dash)
- Ep 01, Episode 12 (episode-only)
- (01) in parentheses (avoiding quality indicators)

### Storage Management
- `chrome.storage.sync` - User settings and preferences
- `chrome.storage.local` - Tracked anime list and new episodes data
- Settings include: checkInterval, notifications, qualityFilter, torrentClient, autoDownload

### Error Handling
- Extension context invalidation (after updates) - handled with page refresh prompts
- Network failures during episode checking - graceful degradation
- Malformed torrent titles - fallback parsing methods

### Testing Approach
- Load extension in Chrome developer mode
- Test on actual Nyaa.si pages for realistic parsing scenarios
- Verify magnet link handling works synchronously from popup interface
- Test periodic checking with Chrome alarm system

## Browser Compatibility

- Primary target: Chrome/Chromium-based browsers
- Uses Manifest V3 (required for modern Chrome extensions)
- Service worker architecture (not background pages)
- Permissions: storage, notifications, activeTab, scripting, alarms, downloads