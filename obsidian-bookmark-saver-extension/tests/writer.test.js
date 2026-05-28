const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { appendBookmarkEntry, appendBookmarkPayload, categoryToFileName } = require("../native/writer");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bookmark-writer-"));

assert.equal(categoryToFileName("Interesting"), "interesting.md");
assert.equal(categoryToFileName("Sci Fi / AI Tools"), "sci-fi-ai-tools.md");

const firstResult = appendBookmarkEntry(
  {
    category: "Interesting",
    title: "Satin Lash Kit [Starter]",
    url: "https://example.com/products/satin?ref=test",
    savedAt: "2026-05-12T19:00:00.000Z",
  },
  tmpDir,
);

assert.equal(firstResult.category, "Interesting");
assert.equal(firstResult.path, path.join(tmpDir, "interesting.md"));

const contents = fs.readFileSync(firstResult.path, "utf8");

assert.equal(
  contents,
  [
    "# Interesting",
    "",
    "- 2026-05-12 - [Satin Lash Kit \\[Starter\\]](https://example.com/products/satin?ref=test)",
    "",
  ].join("\n"),
);

appendBookmarkEntry(
  {
    category: "Interesting",
    title: "Second item",
    url: "https://example.com/second",
    savedAt: "2026-05-13T01:02:03.000Z",
  },
  tmpDir,
);

assert.match(
  fs.readFileSync(firstResult.path, "utf8"),
  /- 2026-05-13 - \[Second item\]\(https:\/\/example\.com\/second\)/,
);

const customResult = appendBookmarkEntry(
  {
    category: "Sci Fi / AI Tools",
    title: "Custom category item",
    url: "https://example.com/custom",
    savedAt: "2026-05-14T01:02:03.000Z",
  },
  tmpDir,
);

assert.equal(customResult.path, path.join(tmpDir, "sci-fi-ai-tools.md"));
assert.match(fs.readFileSync(customResult.path, "utf8"), /^# Sci Fi \/ AI Tools/m);

const batchResult = appendBookmarkPayload(
  {
    category: "Movies",
    items: [
      {
        title: "First tab",
        url: "https://example.com/first",
        savedAt: "2026-05-15T01:02:03.000Z",
      },
      {
        title: "Second tab",
        url: "https://example.com/second",
        savedAt: "2026-05-15T01:02:04.000Z",
      },
    ],
  },
  tmpDir,
);

assert.equal(batchResult.count, 2);
assert.equal(batchResult.category, "Movies");
assert.match(fs.readFileSync(path.join(tmpDir, "movies.md"), "utf8"), /\[First tab\]/);
assert.match(fs.readFileSync(path.join(tmpDir, "movies.md"), "utf8"), /\[Second tab\]/);
