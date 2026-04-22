// Background service worker for Nyaa Auto Download Extension
// Handles periodic checks, notifications, and data management

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Nyaa Auto Download extension installed');
  
  // Set default settings
  chrome.storage.sync.set({
    checkInterval: 60, // minutes
    notifications: true,
    qualityFilter: 'all',
    torrentClient: 'browser',
    autoDownload: false,
    useDownloadQueue: true
  });

  // Set up periodic checking alarm
  chrome.alarms.create('checkEpisodes', {
    delayInMinutes: 1,
    periodInMinutes: 5
  });
});

// Handle alarm events (periodic checking)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkEpisodes') {
    checkForNewEpisodes();
  }
});

// Check for new episodes across all tracked anime
async function checkForNewEpisodes() {
  try {
    const { trackedAnime = [] } = await chrome.storage.local.get(['trackedAnime']);

    if (trackedAnime.length === 0) {
      return;
    }

    console.log(`Checking ${trackedAnime.length} tracked anime for new episodes`);

    for (const anime of trackedAnime) {
      try {
        const newEpisodes = await checkAnimeForNewEpisodes(anime);

        if (newEpisodes.length > 0) {
          // Store new episodes for display in popup
          await storeNewEpisodes(anime.title, newEpisodes);

          // Show notification for new episodes
          if (await getSetting('notifications')) {
            showNewEpisodeNotification(anime.title, newEpisodes);
          }

          // Note: Auto-download disabled due to Chrome security restrictions
          // Magnet links can only be launched from user-initiated actions
          // New episodes are stored and user will be notified to download manually

          // Update last checked episode
          await updateLastEpisode(anime.id, newEpisodes[newEpisodes.length - 1]);
        }
      } catch (error) {
        console.error(`Error checking ${anime.title}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in checkForNewEpisodes:', error);
  }
}

// Check a specific anime for new episodes
async function checkAnimeForNewEpisodes(anime) {
  try {
    const response = await fetch(anime.nyaaUrl);
    const html = await response.text();
    
    // Parse the HTML to find episodes
    const episodes = parseEpisodesFromHTML(html, anime);
    
    // Filter for new episodes
    const newEpisodes = episodes.filter(episode => {
      return episode.season > anime.lastSeason || 
             (episode.season === anime.lastSeason && episode.episode > anime.lastEpisode);
    });
    
    // If no new episodes found but we have episodes and lastEpisode is 0, 
    // update to the latest episode to fix the tracking
    if (newEpisodes.length === 0 && episodes.length > 0 && anime.lastEpisode === 0) {
      // Sort episodes and get the latest one
      episodes.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });
      
      const latestEpisode = episodes[episodes.length - 1];
      
      // Update the anime's last episode without marking it as "new"
      await updateLastEpisode(anime.id, latestEpisode);
      
      // Return empty array since this is just a fix, not a new episode
      return [];
    }
    
    return newEpisodes;
  } catch (error) {
    console.error(`Error fetching episodes for ${anime.title}:`, error);
    return [];
  }
}

// Parse episodes from Nyaa.si HTML using DOM parsing (more reliable than regex)
function parseEpisodesFromHTML(html, anime) {
  const episodes = [];

  try {
    // Check if DOMParser is available (not available in service workers)
    if (typeof DOMParser === 'undefined') {
      return parseEpisodesFromHTMLRegex(html, anime);
    }

    // Create a DOM parser to handle the HTML more reliably
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Find all table rows (torrent entries)
    const rows = doc.querySelectorAll('tbody tr');

    // Also try alternative selectors if no tbody tr found
    let allRows = Array.from(rows);
    if (allRows.length === 0) {
      const altRows = doc.querySelectorAll('tr');
      allRows = Array.from(altRows).filter(row => row.querySelectorAll('td').length >= 7);
    }

    allRows.forEach((row, index) => {
      try {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) {
          return;
        }

        // Extract title from the second cell (usually has the torrent name)
        const titleCell = cells[1];
        const titleLink = titleCell?.querySelector('a');
        if (!titleLink) {
          return;
        }

        const title = titleLink.textContent?.trim();
        if (!title) {
          return;
        }

        // Extract magnet link from the third cell (usually has download links)
        const magnetCell = cells[2];
        let magnetLink = '';

        // Look for magnet link in various possible locations
        const magnetAnchor = magnetCell?.querySelector('a[href^="magnet:"]');
        if (magnetAnchor) {
          magnetLink = magnetAnchor.href;
        } else {
          // Try to find magnet link in the cell text
          const cellText = magnetCell?.textContent || '';
          const magnetMatch = cellText.match(/magnet:[^"'\s]+/);
          if (magnetMatch) {
            magnetLink = magnetMatch[0];
          }
        }

        if (!magnetLink) {
          return;
        }

        // Extract episode information
        const rawEpisodeInfo = extractEpisodeInfo(title);
        const episodeInfo = validateEpisodeInfo(rawEpisodeInfo);

        if (episodeInfo) {
          // Use validated episode info
          const season = episodeInfo.season;
          const episodeNum = episodeInfo.episode;

          const episode = {
            title,
            magnetLink,
            season: season,
            episode: episodeNum,
            size: cells[3]?.textContent?.trim() || 'Unknown',
            seeders: parseInt(cells[5]?.textContent?.trim()) || 0,
            leechers: parseInt(cells[6]?.textContent?.trim()) || 0
          };

          episodes.push(episode);
        }
      } catch (error) {
        console.error(`Error parsing row ${index}:`, error);
      }
    });

  } catch (error) {
    console.error('Error parsing HTML with DOM parser:', error);
    // Fallback to regex parsing if DOM parsing fails
    return parseEpisodesFromHTMLRegex(html, anime);
  }

  return episodes;
}

// Fallback regex-based parsing (original implementation)
function parseEpisodesFromHTMLRegex(html, anime) {
  const episodes = [];

  try {
    // Use regex to find torrent rows in HTML
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis;

    let rowMatch;
    let rowCount = 0;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      rowCount++;
      try {
        const rowHtml = rowMatch[1];

        // Extract cells
        const cells = [];
        let cellMatch;
        cellRegex.lastIndex = 0; // Reset regex index for each row
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(cellMatch[1]);
        }

        if (cells.length < 7) {
          continue;
        }

        // Extract title and magnet link from second and third cells
        const titleCell = cells[1];
        const magnetCell = cells[2];

        let title = '';
        let magnetLink = '';

        // Extract title
        linkRegex.lastIndex = 0; // Reset regex index
        const titleLinkMatch = linkRegex.exec(titleCell);
        if (titleLinkMatch) {
          title = titleLinkMatch[2].replace(/<[^>]*>/g, '').trim();
        }

        // Extract magnet link - look for magnet: URLs directly
        const magnetMatch = magnetCell.match(/href="(magnet:[^"]*)/i);
        if (magnetMatch) {
          // Decode HTML entities
          magnetLink = magnetMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');
        }

        if (!title || !magnetLink) {
          continue;
        }

        // Extract episode information
        const rawEpisodeInfo = extractEpisodeInfo(title);
        const episodeInfo = validateEpisodeInfo(rawEpisodeInfo);

        if (episodeInfo) {
          // Use validated episode info
          const season = episodeInfo.season;
          const episodeNum = episodeInfo.episode;

          const episode = {
            title,
            magnetLink,
            season: season,
            episode: episodeNum,
            size: cells[3] ? cells[3].replace(/<[^>]*>/g, '').trim() : 'Unknown',
            seeders: cells[5] ? parseInt(cells[5].replace(/<[^>]*>/g, '').trim()) || 0 : 0,
            leechers: cells[6] ? parseInt(cells[6].replace(/<[^>]*>/g, '').trim()) || 0 : 0
          };
          episodes.push(episode);
        }
      } catch (error) {
        console.error('Error parsing episode row (regex):', error);
      }
    }
  } catch (error) {
    console.error('Error parsing HTML (regex):', error);
  }

  return episodes;
}

// Get all available day categories
function getAvailableCategories() {
  return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
}

// Extract episode information from title
function extractEpisodeInfo(title) {
  // Validate input
  if (!title || typeof title !== 'string') {
    return null;
  }
  
  // Season/Episode format: S01E01, S1E12, etc.
  const seasonEpisodeMatch = title.match(/S(\d{1,2})E(\d{1,4})/i);
  if (seasonEpisodeMatch) {
    return {
      season: parseInt(seasonEpisodeMatch[1]),
      episode: parseInt(seasonEpisodeMatch[2]),
      format: 'season-episode'
    };
  }
  
  // Season with dash format: S4 - 08, S04 - 12, etc.
  const seasonDashMatch = title.match(/S(\d{1,2})\s*-\s*(\d{1,4})/i);
  if (seasonDashMatch) {
    return {
      season: parseInt(seasonDashMatch[1]),
      episode: parseInt(seasonDashMatch[2]),
      format: 'season-dash'
    };
  }
  
  // Episode only format: Ep 01, Episode 12, etc.
  const episodeMatch = title.match(/(?:ep|episode)\s*(\d{1,4})/i);
  if (episodeMatch) {
    return {
      season: 1,
      episode: parseInt(episodeMatch[1]),
      format: 'episode-only'
    };
  }
  
  // Episode in parentheses: (01), (12) - but avoid quality indicators
  const parenMatch = title.match(/\((\d{1,4})\)(?!\s*(?:p|x\d+|AAC|mp4|mkv|avi))/i);
  if (parenMatch) {
    return {
      season: 1,
      episode: parseInt(parenMatch[1]),
      format: 'parentheses'
    };
  }
  
  // Dash separated: - 01, - 12 (but not at the very end, and not followed by quality indicators)
  const dashMatch = title.match(/-\s*(\d{1,4})(?=\s(?!(?:\d+x\d+|AAC|mp4|mkv|avi|x264|x265|HEVC|WEB|CR)))/i);
  if (dashMatch) {
    return {
      season: 1,
      episode: parseInt(dashMatch[1]),
      format: 'dash'
    };
  }
  
  // Episode with space: "Episode 01", "Ep 12", etc.
  const episodeSpaceMatch = title.match(/(?:episode|ep)\s+(\d{1,4})/i);
  if (episodeSpaceMatch) {
    return {
      season: 1,
      episode: parseInt(episodeSpaceMatch[1]),
      format: 'episode-space'
    };
  }
  
  // Episode with colon: "Episode: 01", "Ep: 12", etc.
  const episodeColonMatch = title.match(/(?:episode|ep):\s*(\d{1,4})/i);
  if (episodeColonMatch) {
    return {
      season: 1,
      episode: parseInt(episodeColonMatch[1]),
      format: 'episode-colon'
    };
  }
  
  // Volume/Chapter format: Vol.01, Chapter 12, etc.
  const volumeMatch = title.match(/(?:vol|volume|chap|chapter)\.?\s*(\d{1,4})/i);
  if (volumeMatch) {
    return {
      season: 1,
      episode: parseInt(volumeMatch[1]),
      format: 'volume-chapter'
    };
  }

  // Special episode patterns: Special 01, OVA 02, etc.
  const specialMatch = title.match(/(?:special|ova|ona|movie)\s*(\d{1,4})/i);
  if (specialMatch) {
    return {
      season: 1,
      episode: parseInt(specialMatch[1]),
      format: 'special'
    };
  }

  // Final fallback: numbers after common anime title patterns
  // Look for standalone 2-3 digit numbers that could be episodes
  const standaloneMatch = title.match(/(?:^|[\s\-\[\]()])\b(\d{2,3})\b(?=[\s\[\]().]|$)(?!(?:p|x\d+|AAC|mp4|mkv|avi|x264|x265|HEVC|WEB|CR|v\d+|chap|vol))/i);
  if (standaloneMatch) {
    const episodeNum = parseInt(standaloneMatch[1]);
    // Only consider it an episode if it's a reasonable episode number (1-999)
    if (episodeNum >= 1 && episodeNum <= 999) {
      return {
        season: 1,
        episode: episodeNum,
        format: 'standalone'
      };
    }
  }
  
  return null;
}

// Validate episode info result
function validateEpisodeInfo(episodeInfo) {
  if (!episodeInfo) return null;
  
  // Ensure season and episode are valid numbers
  const season = parseInt(episodeInfo.season);
  const episode = parseInt(episodeInfo.episode);
  
  if (isNaN(season) || isNaN(episode) || season < 1 || episode < 1) {
    return null;
  }
  
  return {
    season: season,
    episode: episode,
    format: episodeInfo.format || 'unknown'
  };
}



// Process an episode (for manual download from popup)
async function processEpisode(episode) {
  try {
    const torrentClient = await getSetting('torrentClient');

    // Background script cannot open magnet links due to Chrome security restrictions
    // Magnet links can only be launched from user-initiated actions (popup/content script)
    // Store the episode for manual download instead
    
    if (torrentClient === 'clipboard') {
      // For clipboard option, store the magnet link for popup to handle
      await storeMagnetForClipboard(episode);
    } else {
      // For all other options, the user will need to manually click in the popup
      console.log(`Episode ready for manual download: ${episode.title}`);
    }

    console.log(`Processed episode: ${episode.title}`);
  } catch (error) {
    console.error('Error processing episode:', error);
  }
}

// Handle magnet link opening with improved reliability
// Note: This function should only be called from user-initiated actions (popup/content script)
// Background service worker cannot launch external protocols without user gestures
async function handleMagnetLink(episode) {
  console.warn('Background script cannot open magnet links without user gesture. Episode stored for manual download.');
  // Background service worker should never try to auto-open magnet links
  // They can only be opened from user-initiated actions in popup or content scripts
  return false;
}

// Try using content script approach
async function tryContentScriptApproach(episode) {
  try {
    // First try: send to active Nyaa tab
    const activeTabs = await chrome.tabs.query({ url: '*://nyaa.si/*', active: true });
    if (activeTabs.length > 0) {
      try {
        await chrome.tabs.sendMessage(activeTabs[0].id, {
          action: 'openMagnetLink',
          magnetLink: episode.magnetLink,
          title: episode.title
        });
        console.log(`Magnet link sent to active content script: ${episode.title}`);
        return true;
      } catch (msgError) {
        console.warn('Failed to send to active tab, trying any Nyaa tab:', msgError.message);

        // If connection fails, try to inject content script manually
        if (msgError.message && msgError.message.includes('Receiving end does not exist')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTabs[0].id },
              files: ['content/content-script.js']
            });
            console.log('Content script injected into active tab, retrying message...');

            // Wait a bit for the script to load, then retry
            await new Promise(resolve => setTimeout(resolve, 500));

            await chrome.tabs.sendMessage(activeTabs[0].id, {
              action: 'openMagnetLink',
              magnetLink: episode.magnetLink,
              title: episode.title
            });
            console.log(`Magnet link sent to injected content script: ${episode.title}`);
            return true;
          } catch (injectError) {
            console.warn('Failed to inject content script:', injectError);
          }
        }
      }
    }

    // Second try: send to any Nyaa tab
    const anyNyaaTabs = await chrome.tabs.query({ url: '*://nyaa.si/*' });
    if (anyNyaaTabs.length > 0) {
      try {
        await chrome.tabs.sendMessage(anyNyaaTabs[0].id, {
          action: 'openMagnetLink',
          magnetLink: episode.magnetLink,
          title: episode.title
        });
        console.log(`Magnet link sent to content script: ${episode.title}`);
        return true;
      } catch (msgError) {
        console.warn('Failed to send to any Nyaa tab:', msgError.message);

        // If connection fails, try to inject content script manually
        if (msgError.message && msgError.message.includes('Receiving end does not exist')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: anyNyaaTabs[0].id },
              files: ['content/content-script.js']
            });
            console.log('Content script injected into tab, retrying message...');

            // Wait a bit for the script to load, then retry
            await new Promise(resolve => setTimeout(resolve, 500));

            await chrome.tabs.sendMessage(anyNyaaTabs[0].id, {
              action: 'openMagnetLink',
              magnetLink: episode.magnetLink,
              title: episode.title
            });
            console.log(`Magnet link sent to injected content script: ${episode.title}`);
            return true;
          } catch (injectError) {
            console.warn('Failed to inject content script:', injectError);
          }
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Content script approach failed:', error);
    return false;
  }
}

// This function is no longer needed since we removed protocol handlers
// Keeping it for potential future use if protocol handlers become more stable

// Try direct tab creation as fallback (only works with user gestures)
async function tryDirectTabCreation(episode) {
  try {
    const tab = await chrome.tabs.create({ url: episode.magnetLink });
    console.log(`Magnet link opened in new tab (direct): ${episode.title}`);
    return true;
  } catch (error) {
    console.error('Direct tab creation failed - likely no user gesture context:', error.message);
    return false;
  }
}

// Store magnet link for clipboard handling
async function storeMagnetForClipboard(episode) {
  try {
    const { clipboardMagnets = [] } = await chrome.storage.local.get(['clipboardMagnets']);
    clipboardMagnets.push({
      id: `${episode.title}-${Date.now()}`,
      magnetLink: episode.magnetLink,
      title: episode.title,
      timestamp: new Date().toISOString()
    });

    // Keep only the last 10 magnet links
    const updatedMagnets = clipboardMagnets.slice(-10);
    await chrome.storage.local.set({ clipboardMagnets: updatedMagnets });

    console.log(`Magnet link stored for clipboard: ${episode.title}`);
  } catch (error) {
    console.error('Failed to store magnet for clipboard:', error);
  }
}

// Show notification for new episodes
function showNewEpisodeNotification(animeTitle, episodes) {
  const episodeText = episodes.length === 1 ? 'episode' : 'episodes';
  const episodeNumbers = episodes.map(ep => `S${ep.season}E${ep.episode}`).join(', ');

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title: 'New Episodes Available!',
    message: `${animeTitle}: ${episodeNumbers}`,
    buttons: [
      { title: 'Open popup' }
    ],
    priority: 1
  });
}

// Store new episodes for display in popup
async function storeNewEpisodes(animeTitle, episodes) {
  const { newEpisodes = [] } = await chrome.storage.local.get(['newEpisodes']);
  
  // Add unique ID and anime title to each episode
  const episodesWithIds = episodes.map(episode => ({
    ...episode,
    id: `${animeTitle}-${episode.season}-${episode.episode}-${Date.now()}`,
    animeTitle: animeTitle,
    addedAt: new Date().toISOString()
  }));
  
  // Add to existing episodes (limit to 50 most recent)
  const allEpisodes = [...episodesWithIds, ...newEpisodes]
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .slice(0, 50);
  
  await chrome.storage.local.set({ newEpisodes: allEpisodes });
}

// Update last episode for an anime
async function updateLastEpisode(animeId, episode) {
  const { trackedAnime = [] } = await chrome.storage.local.get(['trackedAnime']);
  
  const updatedAnime = trackedAnime.map(anime => {
    if (anime.id === animeId) {
      return {
        ...anime,
        lastSeason: episode.season,
        lastEpisode: episode.episode,
        lastChecked: new Date().toISOString()
      };
    }
    return anime;
  });
  
  await chrome.storage.local.set({ trackedAnime: updatedAnime });
}

// Get a setting value
async function getSetting(key) {
  const result = await chrome.storage.sync.get([key]);
  return result[key];
}

// Open popup page from a notification click
async function openPopupFromNotification(notificationId) {
  try {
    const url = chrome.runtime.getURL('popup/popup.html');
    await chrome.tabs.create({ url });
    if (notificationId) {
      chrome.notifications.clear(notificationId);
    }
  } catch (error) {
    console.error('Failed to open popup from notification:', error);
  }
}

// Handle notification click (anywhere on the notification body)
chrome.notifications.onClicked.addListener((notificationId) => {
  openPopupFromNotification(notificationId);
});

// Handle notification action button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  // Single button: index 0
  if (buttonIndex === 0) {
    openPopupFromNotification(notificationId);
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'addAnime':
      addAnime(request.anime).then(sendResponse);
      return true; // Keep message channel open for async response

    case 'removeAnime':
      removeAnime(request.animeId).then(sendResponse);
      return true;

    case 'getTrackedAnime':
      getTrackedAnime().then(sendResponse);
      return true;

    case 'checkNow':
      checkForNewEpisodes().then(() => sendResponse({ success: true }));
      return true;

    case 'getSettings':
      getSettings().then(sendResponse);
      return true;

    case 'updateSettings':
      updateSettings(request.settings).then(sendResponse);
      return true;

    case 'updateAnimeCategory':
      updateAnimeCategory(request.animeId, request.category).then(sendResponse);
      return true;

    case 'processEpisode':
      processEpisode(request.episode).then(() => sendResponse({ success: true }));
      return true;

  }
});



// Add anime to tracking list
async function addAnime(anime) {
  const { trackedAnime = [] } = await chrome.storage.local.get(['trackedAnime']);

  // Check if already exists
  if (trackedAnime.some(a => a.nyaaUrl === anime.nyaaUrl)) {
    return { success: false, error: 'Anime already being tracked' };
  }

  // Try to get the current episode from the page to set as the starting point
  let currentEpisode = null;
  try {
    const response = await fetch(anime.nyaaUrl);
    const html = await response.text();

    if (!response.ok) {
      console.error(`HTTP error fetching ${anime.nyaaUrl}: ${response.status}`);
    }

    const episodes = parseEpisodesFromHTML(html, anime);

    // Find the highest episode number to start tracking from
    if (episodes.length > 0) {
      // Sort episodes by season and episode number
      episodes.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });

      // Get the latest episode
      const latestEpisode = episodes[episodes.length - 1];
      currentEpisode = {
        season: latestEpisode.season,
        episode: latestEpisode.episode
      };
    } else {
      console.warn(`No episodes found for ${anime.title}. This may indicate parsing issues.`);
    }
  } catch (error) {
    console.error(`Error fetching current episode for ${anime.title}:`, error);
  }
  
  const newAnime = {
    id: Date.now().toString(),
    title: anime.title,
    nyaaUrl: anime.nyaaUrl,
    lastSeason: currentEpisode ? currentEpisode.season : 1,
    lastEpisode: currentEpisode ? currentEpisode.episode : 0,
    lastChecked: new Date().toISOString(),
    addedAt: new Date().toISOString(),
    category: null // Will be set by user later
  };
  
  trackedAnime.push(newAnime);
  await chrome.storage.local.set({ trackedAnime });
  
  return { success: true, anime: newAnime };
}

// Update anime category
async function updateAnimeCategory(animeId, category) {
  const { trackedAnime = [] } = await chrome.storage.local.get(['trackedAnime']);

  const updatedAnime = trackedAnime.map(anime => {
    if (anime.id === animeId) {
      return { ...anime, category };
    }
    return anime;
  });

  await chrome.storage.local.set({ trackedAnime: updatedAnime });

  return { success: true };
}

// Remove anime from tracking list
async function removeAnime(animeId) {
  const { trackedAnime = [] } = await chrome.storage.local.get(['trackedAnime']);

  const updatedAnime = trackedAnime.filter(anime => anime.id !== animeId);
  await chrome.storage.local.set({ trackedAnime: updatedAnime });

  return { success: true };
}

// Get all tracked anime
async function getTrackedAnime() {
  const { trackedAnime = [] } = await chrome.storage.local.get(['trackedAnime']);
  return trackedAnime;
}

// Get all settings
async function getSettings() {
  return await chrome.storage.sync.get();
}

// Update settings
async function updateSettings(settings) {
  await chrome.storage.sync.set(settings);
  
  // Update alarm if check interval changed
  if (settings.checkInterval) {
    chrome.alarms.clear('checkEpisodes');
    chrome.alarms.create('checkEpisodes', {
      delayInMinutes: 1,
      periodInMinutes: settings.checkInterval
    });
  }
  
  return { success: true };
}
