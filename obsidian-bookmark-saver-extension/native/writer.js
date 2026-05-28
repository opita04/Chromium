const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_BOOKMARKS_DIR =
  "/Users/opita/Documents/Obsidian/Personal-Notes/30 Knowledge/Bookmarks";

function escapeMarkdownText(value) {
  return String(value || "Untitled page").replace(/([\\[\]])/g, "\\$1");
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) {
    throw new Error("Cannot save a page without a URL.");
  }
  return url.replace(/\s/g, "%20");
}

function entryDate(savedAt) {
  const date = savedAt ? new Date(savedAt) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid savedAt value: ${savedAt}`);
  }
  return date.toISOString().slice(0, 10);
}

function normalizeCategory(value) {
  const category = String(value || "Shopping").trim().replace(/\s+/g, " ");
  if (!category) {
    return "Shopping";
  }
  return category.slice(0, 80);
}

function categoryToFileName(value) {
  const category = normalizeCategory(value);
  const slug = category
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "bookmarks"}.md`;
}

function appendBookmarkEntry(payload, bookmarksDir = DEFAULT_BOOKMARKS_DIR) {
  const category = normalizeCategory(payload.category);
  const targetPath = path.join(bookmarksDir, categoryToFileName(category));
  const title = escapeMarkdownText(payload.title);
  const url = normalizeUrl(payload.url);
  const date = entryDate(payload.savedAt);
  const directory = path.dirname(targetPath);
  const line = `- ${date} - [${title}](${url})\n`;

  fs.mkdirSync(directory, { recursive: true });

  if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, "utf8").trim() === "") {
    fs.writeFileSync(targetPath, `# ${category}\n\n${line}`, "utf8");
    return { ok: true, path: targetPath, category };
  }

  const current = fs.readFileSync(targetPath, "utf8");
  const prefix = current.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(targetPath, `${prefix}${line}`, "utf8");
  return { ok: true, path: targetPath, category };
}

function appendBookmarkPayload(payload, bookmarksDir = DEFAULT_BOOKMARKS_DIR) {
  const items = Array.isArray(payload.items) && payload.items.length > 0
    ? payload.items
    : [payload];
  let lastResult = null;

  for (const item of items) {
    lastResult = appendBookmarkEntry(
      {
        ...item,
        category: payload.category,
        savedAt: item.savedAt || payload.savedAt,
      },
      bookmarksDir,
    );
  }

  return {
    ...lastResult,
    count: items.length,
  };
}

module.exports = {
  DEFAULT_BOOKMARKS_DIR,
  appendBookmarkEntry,
  appendBookmarkPayload,
  categoryToFileName,
  escapeMarkdownText,
  normalizeUrl,
};
