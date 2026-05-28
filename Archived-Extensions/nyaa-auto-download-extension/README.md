# Nyaa Auto Download - Browser Extension

A browser extension that automatically tracks and downloads anime episodes from Nyaa.si.

## Features

- **Automatic Tracking**: Add anime series to your tracking list with one click
- **Episode Detection**: Smart parsing of episode numbers and season information
- **Auto-Download**: Automatically download new episodes when found
- **Quality Filtering**: Filter downloads by quality preferences
- **Notifications**: Browser notifications for new episodes
- **Data Management**: Export/import your tracking data

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome/Edge and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. The extension will be installed and ready to use

### Building

The extension is ready to use as-is. No build process required.

## Usage

1. Visit [Nyaa.si](https://nyaa.si)
2. Click the "Track" button on anime you want to monitor
3. Configure settings via the extension popup or options page
4. The extension will automatically check for new episodes

## Development

### Project Structure

```
nyaa-auto-download-extension/
├── manifest.json              # Extension configuration
├── background/
│   └── service-worker.js      # Background script
├── content/
│   ├── content-script.js      # Content script for Nyaa.si
│   └── content-styles.css     # Styles for injected elements
├── popup/
│   ├── popup.html             # Extension popup
│   ├── popup.css              # Popup styles
│   └── popup.js               # Popup logic
├── options/
│   ├── options.html           # Settings page
│   ├── options.css            # Settings styles
│   └── options.js             # Settings logic
└── icons/                     # Extension icons
```

### Key Components

- **Background Script**: Handles periodic checking and data management
- **Content Script**: Injected into Nyaa.si pages to add tracking functionality
- **Popup**: Quick access interface for managing tracked anime
- **Options Page**: Full settings and data management interface

## License

MIT License - see LICENSE file for details
