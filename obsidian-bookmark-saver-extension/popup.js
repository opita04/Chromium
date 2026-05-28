const NATIVE_HOST = "com.opita.shopping_page_saver";
const DEFAULT_CATEGORIES = ["Shopping", "Interesting", "Manhwa", "Movies", "Recipes"];

const categorySelect = document.getElementById("categorySelect");
const scopeSelect = document.getElementById("scopeSelect");
const newCategoryForm = document.getElementById("newCategoryForm");
const newCategoryInput = document.getElementById("newCategoryInput");
const saveButton = document.getElementById("saveButton");
const statusEl = document.getElementById("status");
const pageTitleEl = document.getElementById("pageTitle");

let activeTab = null;

function normalizeCategory(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function uniqueCategories(categories) {
  const seen = new Set();
  return categories
    .map(normalizeCategory)
    .filter(Boolean)
    .filter((category) => {
      const key = category.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = type;
}

function renderCategories(categories, selectedCategory) {
  categorySelect.replaceChildren();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.append(option);
  }

  if (selectedCategory) {
    categorySelect.value = selectedCategory;
  }
}

function getStoredCategories() {
  return chrome.storage.local.get({ categories: DEFAULT_CATEGORIES }).then((result) => {
    const categories = uniqueCategories([...DEFAULT_CATEGORIES, ...result.categories]);
    return categories;
  });
}

function sendToNativeHost(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response || response.ok !== true) {
        reject(new Error(response?.error || "Native host did not save the page."));
        return;
      }

      resolve(response);
    });
  });
}

function isSaveableTab(tab) {
  return /^https?:\/\//.test(tab?.url || "");
}

async function getPayloadItems() {
  if (scopeSelect.value === "window") {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .filter(isSaveableTab)
      .map((tab) => ({
        title: tab.title || "Untitled page",
        url: tab.url,
        savedAt: new Date().toISOString(),
      }));
  }

  if (!isSaveableTab(activeTab)) {
    throw new Error("No saveable active page URL was available.");
  }

  return [
    {
      title: activeTab.title || "Untitled page",
      url: activeTab.url,
      savedAt: new Date().toISOString(),
    },
  ];
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  pageTitleEl.textContent = tab?.title || "Current page";
  renderCategories(await getStoredCategories(), "Shopping");
}

newCategoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const category = normalizeCategory(newCategoryInput.value);
  if (!category) return;

  const categories = uniqueCategories([...(await getStoredCategories()), category]);
  await chrome.storage.local.set({ categories });
  renderCategories(categories, category);
  newCategoryInput.value = "";
  setStatus(`Added ${category}.`, "ok");
});

scopeSelect.addEventListener("change", () => {
  saveButton.textContent = scopeSelect.value === "window"
    ? "Save All Window Tabs"
    : "Save Current Tab to Obsidian";
});

saveButton.addEventListener("click", async () => {
  try {
    saveButton.disabled = true;
    const items = await getPayloadItems();
    if (items.length === 0) {
      throw new Error("No http or https tabs found in this window.");
    }

    setStatus(items.length === 1 ? "Saving..." : `Saving ${items.length} tabs...`);
    const response = await sendToNativeHost({
      category: categorySelect.value,
      items,
    });

    setStatus(
      response.count === 1
        ? `Saved to ${response.category}.`
        : `Saved ${response.count} tabs to ${response.category}.`,
      "ok",
    );
  } catch (error) {
    console.error("Could not save bookmark:", error);
    setStatus(error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
});

init().catch((error) => {
  console.error("Could not initialize popup:", error);
  setStatus(error.message, "error");
});
