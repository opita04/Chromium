# Nyaa Auto Download Extension Knowledge

## Magnet Link User Gesture Requirements

### Problem
Browsers require user gestures to launch external protocols like magnet links. Chrome extensions face strict security restrictions:
- `window.open()` calls to magnet links must happen synchronously within user event handlers
- Async operations break the user gesture context
- Background service workers cannot launch external protocols without user gestures

### Solution
**Key Principle: Keep magnet link opening synchronous within the original click event.**

#### popup.js Changes
1. **Event Handler**: Made `setupEpisodeEventListeners` synchronous (removed `async`)
2. **Synchronous Handler**: Created `handleMagnetClickSync()` that:
   - Checks user torrent client preference immediately
   - Calls `tryDirectMagnetOpenSync()` for browser opening
   - Falls back to clipboard if opening fails
3. **Multiple Fallback Methods** in `tryDirectMagnetOpenSync()`:
   - Direct `window.open()` (most reliable)
   - Simulated `MouseEvent` with proper gesture context
   - Direct `.click()` on temporary anchor element

#### background/service-worker.js Changes
- Removed automatic magnet link opening from background script
- Background script now only stores episodes for manual download
- Added clear warning messages about user gesture requirements

### Best Practices
- **Never** use async/await in the direct path from user click to magnet link opening
- **Always** handle magnet links synchronously within click event handlers  
- **Fallback** to clipboard copy if opening fails
- **Background scripts** should never attempt to open magnet links

### Error Messages Fixed
- "Not allowed to launch 'magnet:...' because a user gesture is required"

### Testing
Build the extension with `node build.js` and test magnet link downloads in the popup interface.