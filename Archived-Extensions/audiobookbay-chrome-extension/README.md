# AudiobookBay Chrome Extension

A powerful Chrome extension that enhances your AudiobookBay experience by adding one-click downloads directly to your torrent client, with support for multiple AudiobookBay domains.

## 🎯 Features

### ✨ **Dynamic Domain Support**
- **Add Any AudiobookBay Domain**: Easily add new domains like `audiobookbay.ai`, `audiobookbay.co`, etc.
- **Automatic Detection**: Works seamlessly on all configured AudiobookBay domains
- **Future-Proof**: No need to update the extension when new domains appear

### 🚀 **Enhanced Browsing Experience**
- **One-Click Downloads**: Download buttons appear directly on search results
- **Quick Preview**: Modal previews with cover art and instant download
- **Quality Indicators**: Visual badges showing audio quality (FLAC, 320kbps, etc.)
- **Floating Search**: Quick search widget available on any AudiobookBay page

### 💻 **Torrent Client Integration**
- **Multiple Clients**: Support for qBittorrent, Transmission, and Deluge
- **Automatic Organization**: Downloads organized into folders by audiobook title
- **Connection Testing**: Built-in connection testing for your torrent client

### 🔍 **Advanced Search**
- **Cross-Domain Search**: Search across all your configured AudiobookBay domains
- **Popup Search**: Quick search from the extension popup
- **Bulk Operations**: Select and download multiple audiobooks at once

## 📦 Installation

### Method 1: Load Unpacked Extension (Recommended for Development)

1. **Download the Extension**:
   - Download or clone this repository
   - Extract the `audiobookbay-chrome-extension` folder to your desired location

2. **Enable Developer Mode**:
   - Open Chrome and go to `chrome://extensions/`
   - Toggle "Developer mode" in the top right corner

3. **Load the Extension**:
   - Click "Load unpacked"
   - Select the `audiobookbay-chrome-extension` folder
   - The extension will appear in your extensions list

4. **Pin the Extension** (Optional):
   - Click the puzzle piece icon in Chrome's toolbar
   - Find "AudiobookBay Downloader" and pin it for easy access

## ⚙️ Configuration

### First-Time Setup

1. **Click the extension icon** in your toolbar
2. **Click "⚙️ Settings"** to open the options page
3. **Configure your domains** and **torrent client**:

### AudiobookBay Domains

Add the AudiobookBay domains you want to use:

- `audiobookbay.lu` (default)
- `audiobookbay.is` (default) 
- `audiobookbay.ai` (example new domain)
- Any other AudiobookBay mirror sites

**Adding Domains**:
- Enter just the domain name (without http:// or www.)
- Click "Add Domain" or use the preset buttons
- Remove domains by clicking the "Remove" button

### Torrent Client Configuration

Configure your torrent client connection:

#### For qBittorrent:
```
Client: qBittorrent
Host: localhost (or your server IP)
Port: 8080
Protocol: http
Username: admin
Password: [your password]
Category: Audiobookbay-Audiobooks
Save Path: /audiobooks
```

#### For Transmission:
```
Client: Transmission  
Host: localhost
Port: 9091
Protocol: http
Username: [your username]
Password: [your password]
Save Path: /audiobooks
```

#### For Deluge (Web UI):
```
Client: Deluge (Web UI)
Host: localhost
Port: 8112
Protocol: http
Password: [your web UI password]
Label: Audiobookbay-Audiobooks
Save Path: /audiobooks
```

### Test Connection

Click "Test Connection" to verify your torrent client configuration works correctly.

## 🎵 Usage

### On AudiobookBay Pages

When you visit any configured AudiobookBay domain, the extension automatically enhances the page:

1. **Download Buttons**: Appear on each search result
2. **Quality Indicators**: Show audio quality levels
3. **Quick Preview**: Click "👁️ Quick Preview" for instant preview
4. **Floating Search**: Use the search widget in the bottom-right corner

### Extension Popup

Click the extension icon to:

1. **Quick Search**: Search across all configured domains
2. **View Results**: See results from multiple domains
3. **One-Click Download**: Download directly from search results
4. **Access Settings**: Configure domains and torrent client

### Download Process

1. **Find an audiobook** you want on AudiobookBay
2. **Click "⬇️ Download to Server"** on any result
3. The extension will:
   - Extract the magnet link from the detail page
   - Send it to your configured torrent client
   - Organize it into a folder named after the audiobook
   - Show a success notification

## 🛡️ Privacy & Security

- **Local Processing**: All magnet link extraction happens locally
- **No Data Collection**: No personal data is collected or transmitted
- **Secure Connections**: Uses HTTPS when available
- **Local Storage**: Settings stored locally in your browser

## 🔧 Troubleshooting

### Extension Not Working on AudiobookBay

1. **Check Domain Configuration**: Ensure the domain is added in Settings
2. **Reload the Page**: Refresh the AudiobookBay page
3. **Check Extension Status**: Verify the extension is enabled

### Downloads Not Working

1. **Test Connection**: Use "Test Connection" in Settings
2. **Check Torrent Client**: Ensure your torrent client is running and accessible
3. **Verify Credentials**: Double-check username/password in Settings
4. **Check Network**: Ensure no firewall is blocking the connection

### Search Not Working

1. **Check Internet Connection**: Ensure you can access AudiobookBay normally
2. **Check Configured Domains**: Verify domains are accessible
3. **Check Browser Console**: Look for error messages in Chrome DevTools

## 🆕 Adding New Domains

When new AudiobookBay domains become available:

1. **Open Extension Settings**
2. **Add the New Domain**:
   - Enter the domain in the text field (e.g., `audiobookbay.new`)
   - Click "Add Domain"
3. **Test the Domain**: Visit the new domain to ensure it works

The extension will automatically work on the new domain without any code changes!

## 🤝 Contributing

Contributions are welcome! Here are some areas where you can help:

- **New Features**: Bulk download improvements, better UI/UX
- **Bug Fixes**: Report issues or submit fixes
- **Domain Testing**: Test with new AudiobookBay domains
- **Client Support**: Add support for additional torrent clients

## 📄 License

This project is open-source and available under the MIT License.

## ⚠️ Disclaimer

This extension is for educational and personal use only. Users are responsible for complying with their local laws and the terms of service of the websites they visit. The extension does not host, distribute, or provide any copyrighted content.

---

**Enjoy your enhanced AudiobookBay experience! 🎧📚**
