let currentVideo = null;
let currentMarkdown = '';
let currentSavedPath = '';
let currentCategory = 'General';

const DEFAULT_MODEL = 'openrouter/free';
const CATEGORIES = ['Political', 'Coding', 'Educational', 'General', 'Business', 'AI', 'Finance', 'Health', 'Science', 'Others'];
const $ = (id) => document.getElementById(id);

function allActionButtons() {
  return [$('loadBtn'), $('summarizeBtn'), $('saveMarkdownBtn'), $('moveCategoryBtn'), $('copyTranscriptBtn'), ...document.querySelectorAll('.model-btn')].filter(Boolean);
}

function setBusy(isBusy, message) {
  for (const button of allActionButtons()) button.disabled = isBusy;
  $('progress').hidden = !isBusy;
  if (message) $('status').textContent = message;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'No response.' });
    });
  });
}

function setModel(model) {
  $('model').value = model || DEFAULT_MODEL;
  document.querySelectorAll('.model-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.model === $('model').value.trim());
  });
}

function setCategory(category) {
  currentCategory = CATEGORIES.includes(category) ? category : 'General';
  $('category').value = currentCategory;
}

function renderVideo(video) {
  $('videoTitle').textContent = video.title || 'Untitled video';
  $('videoChannel').textContent = video.channel || 'Unknown channel';
  const chars = video.transcript?.length || 0;
  const roughTokens = Math.ceil(chars / 4);
  $('transcriptStats').textContent = `${chars.toLocaleString()} chars · ~${roughTokens.toLocaleString()} tokens`;
  $('videoCard').hidden = false;
}

async function loadTranscript() {
  setBusy(true, 'Opening YouTube transcript panel…');
  const result = await sendMessage({ type: 'GET_ACTIVE_VIDEO' });
  setBusy(false);
  if (!result.ok) {
    $('status').textContent = `Error: ${result.error}`;
    return false;
  }
  currentVideo = result.video;
  renderVideo(currentVideo);
  $('status').textContent = 'Transcript loaded. Ready to summarize.';
  return true;
}

async function summarizeAndSave(overrideModel = null) {
  if (!currentVideo) {
    const loaded = await loadTranscript();
    if (!loaded) return;
  }
  const model = overrideModel || $('model').value.trim() || DEFAULT_MODEL;
  setModel(model);
  setBusy(true, `Summarizing with ${model} and saving to Obsidian…`);
  const result = await sendMessage({ type: 'SUMMARIZE_AND_SAVE', video: currentVideo, model });
  setBusy(false);
  if (!result.ok) {
    $('status').textContent = `Error: ${result.error}`;
    return;
  }
  currentMarkdown = result.markdown;
  currentSavedPath = result.path || '';
  setCategory(result.category);
  $('summary').value = result.markdown;
  $('savedPath').textContent = `Saved: ${result.path}`;
  $('summaryCard').hidden = false;
  $('status').textContent = `Done. Category: ${currentCategory} · Model: ${result.model}`;
}

async function saveMarkdownAgain(categoryOverride = null) {
  if (!currentMarkdown || !currentVideo) return;
  const category = categoryOverride || $('category').value || currentCategory;
  setBusy(true, categoryOverride ? `Moving note to ${category}/…` : 'Saving Markdown…');
  const result = await sendMessage({
    type: 'SAVE_MARKDOWN',
    video: currentVideo,
    markdown: $('summary').value,
    category,
    previousPath: currentSavedPath,
  });
  setBusy(false);
  if (!result.ok) {
    $('status').textContent = `Error: ${result.error}`;
    return;
  }
  currentMarkdown = result.markdown || $('summary').value;
  currentSavedPath = result.path || '';
  setCategory(result.category);
  $('summary').value = currentMarkdown;
  $('savedPath').textContent = `Saved: ${result.path}`;
  $('status').textContent = categoryOverride ? `Moved to ${currentCategory}/` : `Saved. Category: ${currentCategory}`;
}

async function copyTranscript() {
  if (!currentVideo) {
    const loaded = await loadTranscript();
    if (!loaded) return;
  }
  await navigator.clipboard.writeText(currentVideo.transcript);
  $('status').textContent = 'Transcript copied.';
}

$('loadBtn').addEventListener('click', loadTranscript);
$('summarizeBtn').addEventListener('click', () => summarizeAndSave());
$('saveMarkdownBtn').addEventListener('click', () => saveMarkdownAgain());
$('moveCategoryBtn').addEventListener('click', () => saveMarkdownAgain($('category').value));
$('copyTranscriptBtn').addEventListener('click', copyTranscript);
$('model').addEventListener('change', () => setModel($('model').value.trim() || DEFAULT_MODEL));
$('category').addEventListener('change', () => setCategory($('category').value));
document.querySelectorAll('.model-btn').forEach((button) => {
  button.addEventListener('click', () => summarizeAndSave(button.dataset.model));
});
setModel(DEFAULT_MODEL);
setCategory('General');
