# Mark Watched YouTube Videos - Chrome Extension

A Chrome extension that helps you track and manage watched YouTube videos and shorts. Ported from the popular TamperMonkey script by jcunews.

## ✨ Features

### 🎯 Core Functionality
- **Automatic Tracking**: Automatically marks videos as watched when you view them
- **Visual Indicators**: Green outlines around watched videos for easy identification
- **Manual Toggle**: Alt+Left/Right click on any video to manually toggle watched status
- **Smart Detection**: Uses both manual tracking and YouTube's native progress bars

### 🎛️ Advanced Controls
- **Hide/Dim Options**: Hide or dim watched videos and shorts per YouTube section
- **Section-Specific Settings**: Different visibility settings for Home, Subscriptions, Channels, etc.
- **Threshold Control**: Set percentage threshold for progress-bar based detection (default: 10%)
- **Header Integration**: Clean button interface in YouTube's header

### 📊 Data Management  
- **Statistics**: View detailed watch history statistics
- **Backup/Restore**: Export and import your watch history as JSON
- **Data Migration**: Import from original TamperMonkey script or YouTube's own data export
- **Auto Cleanup**: Automatically removes old entries (configurable, default: 10 years)

### 🎬 YouTube Shorts Support
- **Shorts Detection**: Automatically detects and can hide/dim YouTube Shorts
- **Separate Controls**: Independent visibility controls for regular videos vs shorts

## 🔧 Installation

### Method 1: Unpacked Extension (Developer Mode)
1. Download and extract the extension files to a folder
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" and select the extension folder
5. The extension should now appear in your extensions list

### Method 2: Packed Extension (.crx file)
1. Download the `.crx` file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Drag and drop the `.crx` file onto the extensions page
5. Click "Add extension" when prompted

## 🚀 Usage

### Basic Usage
- **Automatic**: Just browse YouTube normally - videos are automatically marked as watched
- **Manual Toggle**: Hold `Alt` and click (left or right) on any video thumbnail to toggle watched status
- **Visual Feedback**: Watched videos show green outlines in both light and dark modes

### Header Controls
The extension adds buttons to YouTube's header:
- **👁️ Eye Icon**: Toggle watched video visibility (normal → dimmed → hidden → normal)
- **📱 Shorts Icon**: Toggle shorts visibility (same cycle as videos)  
- **⚙️ Settings Icon**: Configure the progress bar detection threshold
- **📊 Stats Icon**: View detailed statistics about your watch history
- **💾 Backup Icon**: Download your watch history as JSON
- **📂 Restore Icon**: Import watch history from backup file

### Keyboard Shortcuts
- **Alt + Left Click**: Toggle watched status of target video
- **Alt + Right Click**: Toggle watched status of target video (if enabled in config)

## 🔐 Permissions Explained

- **Storage**: Store your watch history and preferences locally
- **Active Tab**: Interact with YouTube pages and inject the marking functionality  
- **Downloads**: Allow backup of your watch history to JSON files
- **YouTube Host Permission**: Only runs on YouTube.com for privacy and performance

## 🛠️ Configuration

The extension includes several configurable options:

### In-Script Configuration
Edit `src/content.js` to modify:
- `maxWatchedVideoAge`: How long to keep watch history (days, default: 3650)
- `contentLoadMarkDelay`: Delay before marking videos (ms, default: 600)
- `markerMouseButtons`: Which mouse buttons work for manual toggle (default: [0,1] = left+right)

### Runtime Configuration  
- **Threshold Setting**: Use the settings button to adjust progress bar detection threshold
- **Section States**: Each YouTube section (home, subscriptions, etc.) remembers its own visibility settings
- **Data Management**: Use backup/restore for data migration between devices

## 🔄 Changelog

### v1.4.63 (Chrome Extension Port)
- ✅ Ported from TamperMonkey to native Chrome extension
- ✅ Replaced GM_* APIs with chrome.storage.local
- ✅ Added chrome.downloads support for backup functionality  
- ✅ Maintained all original functionality including hide/dim features
- ✅ Added proper Manifest V3 support with required permissions
- ✅ Preserved trusted types compatibility for YouTube's CSP

### Original TamperMonkey Version
- Created by jcunews
- Comprehensive YouTube video tracking
- Hide and dim functionality inspired by other scripts
- Support for various YouTube page layouts and navigation methods

## 🤝 Contributing

This extension is ported from the original TamperMonkey script. To contribute:

1. **Report Issues**: Use GitHub issues for bugs or feature requests
2. **Test Thoroughly**: YouTube frequently changes their layout - test across different sections
3. **Maintain Compatibility**: Ensure changes work across YouTube's various page types
4. **Document Changes**: Update this README for any significant modifications

## 📋 Technical Notes

- **Manifest Version**: Uses Manifest V3 for future Chrome compatibility
- **Content Script Only**: No background script needed - all logic runs in content script
- **Storage**: Uses chrome.storage.local for persistence (syncs across devices if enabled)
- **YouTube Compatibility**: Handles both old and new YouTube layouts and navigation
- **Performance**: Debounced DOM observation to minimize performance impact

## ⚠️ Troubleshooting

### Common Issues
- **Not Working**: Ensure the extension is enabled and reload YouTube
- **Alt+Click Not Working**: Check if other extensions are interfering with keyboard shortcuts
- **Buttons Not Showing**: Try refreshing YouTube or disabling/re-enabling the extension
- **Data Not Persisting**: Check Chrome's storage permissions and available space

### Reset Extension
If you encounter persistent issues:
1. Go to `chrome://extensions/`
2. Find the extension and click "Details"  
3. Click "Extension options" → "Clear storage" (if available)
4. Or disable/re-enable the extension to reset

## 📄 License

This Chrome extension port maintains the same license as the original TamperMonkey script: **AGPL v3**

---

**Original Script**: [Mark Watched YouTube Videos](https://greasyfork.org/en/scripts/30261-mark-watched-youtube-videos) by jcunews  
**Extension Port**: Converted to Chrome Extension with full functionality preservation
