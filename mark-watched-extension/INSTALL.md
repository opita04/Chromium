# Installation Guide - Mark Watched YouTube Videos

## 📦 Quick Start

### Option 1: Load Unpacked Extension (Recommended for Development)

1. **Download/Clone the Extension**
   - Download the `mark-watched-extension` folder to your computer
   - Or clone the repository if using Git

2. **Open Chrome Extensions**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to Chrome Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - In the top-right corner, toggle "Developer mode" **ON**
   - You should see additional buttons appear

4. **Load the Extension**
   - Click the "Load unpacked" button
   - Browse and select the `mark-watched-extension` folder
   - Click "Select Folder" (Windows) or "Open" (Mac/Linux)

5. **Verify Installation**
   - The extension should appear in your extensions list
   - You should see "Mark Watched YouTube Videos" with version 1.4.63
   - Ensure it's enabled (toggle should be ON/blue)

6. **Test on YouTube**
   - Navigate to [YouTube.com](https://youtube.com)
   - You should see additional buttons in the header
   - Watch a video and notice the green outline on the thumbnail when you return to the feed

### Option 2: Pack and Install (.crx file)

If you want to create a packed extension:

1. **In Chrome Extensions page** (`chrome://extensions/`)
2. **Enable Developer mode**
3. **Click "Pack extension"**
   - Extension root directory: Select your `mark-watched-extension` folder
   - Private key file: Leave blank (Chrome will generate one)
   - Click "Pack Extension"
4. **Chrome will create two files:**
   - `mark-watched-extension.crx` (the extension package)
   - `mark-watched-extension.pem` (the private key - keep this safe!)
5. **Install the .crx file:**
   - Drag the `.crx` file onto the extensions page
   - Click "Add extension" when prompted

## 🔧 Configuration

### After Installation

1. **Visit YouTube** - the extension activates automatically
2. **Look for header buttons** - 6 new buttons should appear in YouTube's header area
3. **Test Alt+Click** - hold Alt and click any video thumbnail to manually toggle watched status
4. **Check settings** - click the gear icon to adjust the progress bar threshold

### First-Time Setup Tips

- **Import existing data**: If you were using the TamperMonkey version, use the "Restore" button to import your old data
- **Adjust threshold**: The default 10% threshold works well, but you can adjust based on your viewing habits
- **Explore section settings**: Different YouTube sections (Home, Subscriptions, etc.) have independent visibility settings

## 🛠️ Troubleshooting

### Extension Not Loading
- Ensure you selected the `mark-watched-extension` folder (not a parent folder)
- Check that `manifest.json` exists in the root of the selected folder
- Look for error messages in the extensions page

### Buttons Not Showing on YouTube
- Refresh YouTube page after installing
- Check if the extension is enabled in `chrome://extensions/`
- Try disabling other YouTube-related extensions temporarily

### Alt+Click Not Working
- Ensure you're holding Alt while clicking (not before or after)
- Check if other extensions are intercepting the keystrokes
- Try right-click with Alt if left-click isn't working

### Data Not Persisting
- Grant storage permissions when prompted
- Check available Chrome storage space
- Verify the extension has "Storage" permission in the details page

## 🔄 Updating the Extension

Since this is loaded as an unpacked extension:

1. **For code changes**: Simply refresh the YouTube page
2. **For manifest.json changes**: Click the refresh/reload button on the extension card in `chrome://extensions/`
3. **Major updates**: Remove and re-add the extension

## 🗑️ Uninstalling

1. Go to `chrome://extensions/`
2. Find "Mark Watched YouTube Videos"
3. Click "Remove"
4. Confirm removal
5. Your watch history data will be deleted from Chrome storage

## 📝 Notes

- **Privacy**: All data is stored locally in Chrome's storage
- **Performance**: The extension uses efficient DOM observation to minimize impact
- **Compatibility**: Works with both light and dark YouTube themes
- **Updates**: This unpacked version won't auto-update - manually update files as needed

## 🆘 Getting Help

If you encounter issues:

1. **Check the Console**: Open Chrome DevTools (F12) and check for JavaScript errors
2. **Verify Permissions**: Ensure the extension has necessary permissions
3. **Test in Incognito**: Try the extension in incognito mode to rule out conflicts
4. **Report Issues**: Create an issue with details about your Chrome version, OS, and the specific problem

---

**Ready to go!** Once installed, just use YouTube normally and enjoy the enhanced video tracking experience! 🎉
