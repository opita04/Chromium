# Obsidian Bookmark Saver

Chromium extension that saves the active page title and URL to categorized Markdown files under:

`/Users/opita/Documents/Obsidian/Personal-Notes/30 Knowledge/Bookmarks`

The extension uses Chrome native messaging because browser extensions cannot directly append to arbitrary local files.

## Install

1. Install the native host:

   ```sh
   node /Users/opita/Projects/Chromium/obsidian-bookmark-saver-extension/scripts/install-native-host.js
   ```

2. Open your Chromium-based browser extensions page:

   ```text
   chrome://extensions
   ```

3. Enable Developer mode.

4. Choose "Load unpacked" and select:

   ```text
   /Users/opita/Projects/Chromium/obsidian-bookmark-saver-extension
   ```

5. Click the extension icon on any page, choose a category, then click "Save to Obsidian".

The default categories are:

- Shopping
- Interesting
- Manhwa
- Movies
- Recipes

You can add more categories from the popup. New categories are saved in browser storage and create their own Markdown file the first time you save into them.

## Output Format

New entries are appended to the selected category file like this:

```md
- 2026-05-12 - [Example Product](https://example.com/product)
```

If the selected category file does not exist yet, the native host creates it with a matching heading.

## Test

```sh
node /Users/opita/Projects/Chromium/obsidian-bookmark-saver-extension/tests/writer.test.js
```
