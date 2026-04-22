// Content script for Nyaa Auto Download Extension
// Injected into Nyaa.si pages to add tracking functionality

console.log('Nyaa Auto Download content script loaded');

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

function initializeContentScript() {
  console.log('Initializing Nyaa Auto Download content script');
  
  // Add tracking buttons to torrent listings
  addTrackingButtons();
  
  // Add episode information display
  addEpisodeInfo();
  
  // Monitor for dynamic content changes
  observePageChanges();
}

// Add tracking buttons to torrent listings
function addTrackingButtons() {
  const torrentRows = document.querySelectorAll('tbody tr');
  
  torrentRows.forEach((row, index) => {
    // Skip if already processed
    if (row.querySelector('.nyaa-tracker-btn')) {
      return;
    }
    
    const titleCell = row.querySelector('td:nth-child(2)');
    if (!titleCell) return;
    
    const titleLink = titleCell.querySelector('a');
    if (!titleLink) return;
    
    const title = titleLink.textContent.trim();
    const episodeInfo = extractEpisodeInfo(title);
    
    if (episodeInfo) {
      // Create tracking button
      const trackButton = createTrackButton(title, episodeInfo);
      
      // Add button to the row
      const actionsCell = row.querySelector('td:nth-child(3)');
      if (actionsCell) {
        actionsCell.appendChild(trackButton);
      }
    }
  });
}

// Create a tracking button for an anime
function createTrackButton(title, episodeInfo) {
  const button = document.createElement('button');
  button.className = 'nyaa-tracker-btn';
  button.innerHTML = '📌 Track';
  button.title = 'Add to tracking list';
  
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
        try {
      // Show loading state
      button.innerHTML = '⏳ Adding...';
      button.classList.add('loading');
      button.disabled = true;

      // Extract anime series name from title
      const seriesName = extractSeriesName(title);

      // Get current page URL for tracking
      const nyaaUrl = window.location.href;

      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        button.innerHTML = '🔄 Refresh Page';
        button.classList.remove('loading');
        button.disabled = false;
        button.onclick = () => window.location.reload();
        showNotification('Extension was updated. Please refresh this page to continue.', 'error');
        return;
      }

      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        action: 'addAnime',
        anime: {
          title: seriesName,
          nyaaUrl: nyaaUrl
        }
      });

      if (response.success) {
        button.innerHTML = '✅ Tracked';
        button.disabled = true;
        button.style.backgroundColor = '#4CAF50';
        button.classList.remove('loading');
        showNotification('Anime added to tracking list!', 'success');
      } else {
        button.innerHTML = '📌 Track';
        button.disabled = false;
        button.classList.remove('loading');
        showNotification(response.error || 'Failed to add anime', 'error');
      }
    } catch (error) {
      console.error('Error adding anime to tracking:', error);

      // Reset button state
      button.innerHTML = '📌 Track';
      button.classList.remove('loading');
      button.disabled = false;

      // Handle extension context invalidation
      if (error.message && error.message.includes('Extension context invalidated')) {
        showNotification('Extension was updated. Click here to refresh the page.', 'error');
        button.innerHTML = '🔄 Refresh Page';
        button.onclick = () => window.location.reload();
        return;
      }

      showNotification('Error adding anime to tracking: ' + error.message, 'error');
    }
  });
  
  return button;
}

// Extract series name from episode title
function extractSeriesName(title) {
  // Remove episode information to get series name
  let seriesName = title
    .replace(/S\d{1,2}E\d{1,4}/gi, '') // Remove S01E01 format
    .replace(/ep\s*\d{1,4}/gi, '') // Remove Ep 01 format
    .replace(/episode\s*\d{1,4}/gi, '') // Remove Episode 01 format
    .replace(/\(\d{1,4}\)/g, '') // Remove (01) format
    .replace(/-\s*\d{1,4}/g, '') // Remove - 01 format
    .replace(/\[.*?\]/g, '') // Remove [1080p] etc.
    .replace(/\(.*?\)/g, '') // Remove (Sub) etc.
    .trim();
  
  // Clean up extra spaces and dashes
  seriesName = seriesName.replace(/\s+/g, ' ').replace(/[-_]+/g, ' ').trim();
  
  return seriesName || title; // Fallback to original title if extraction fails
}

// Extract episode information from title
function extractEpisodeInfo(title) {
  console.log('Parsing title:', title);
  
  // Season/Episode format: S01E01, S1E12, etc.
  const seasonEpisodeMatch = title.match(/S(\d{1,2})E(\d{1,4})/i);
  if (seasonEpisodeMatch) {
    const result = {
      season: parseInt(seasonEpisodeMatch[1]),
      episode: parseInt(seasonEpisodeMatch[2]),
      format: 'season-episode'
    };
    console.log('Matched S##E## format:', result);
    return result;
  }
  
  // Season with dash format: S4 - 08, S04 - 12, etc.
  const seasonDashMatch = title.match(/S(\d{1,2})\s*-\s*(\d{1,4})/i);
  if (seasonDashMatch) {
    const result = {
      season: parseInt(seasonDashMatch[1]),
      episode: parseInt(seasonDashMatch[2]),
      format: 'season-dash'
    };
    console.log('Matched S##-## format:', result);
    return result;
  }
  
  // Season with episode number: S04E08, S4E8 (already handled above, but let's be explicit)
  
  // Episode only format: Ep 01, Episode 12, etc.
  const episodeMatch = title.match(/(?:ep|episode)\s*(\d{1,4})/i);
  if (episodeMatch) {
    const result = {
      season: 1,
      episode: parseInt(episodeMatch[1]),
      format: 'episode-only'
    };
    console.log('Matched episode format:', result);
    return result;
  }
  
  // Episode in parentheses: (01), (12) - but avoid quality indicators
  const parenMatch = title.match(/\((\d{1,4})\)(?!\s*(?:p|x\d+|AAC|mp4|mkv|avi))/i);
  if (parenMatch) {
    const result = {
      season: 1,
      episode: parseInt(parenMatch[1]),
      format: 'parentheses'
    };
    console.log('Matched parentheses format:', result);
    return result;
  }
  
  // Dash separated: - 01, - 12 (but not at the very end, and not followed by quality indicators)
  const dashMatch = title.match(/-\s*(\d{1,4})(?=\s(?!(?:\d+x\d+|AAC|mp4|mkv|avi|x264|x265|HEVC|WEB|CR)))/i);
  if (dashMatch) {
    const result = {
      season: 1,
      episode: parseInt(dashMatch[1]),
      format: 'dash'
    };
    console.log('Matched dash format:', result);
    return result;
  }
  
  // Episode with space: "Episode 01", "Ep 12", etc.
  const episodeSpaceMatch = title.match(/(?:episode|ep)\s+(\d{1,4})/i);
  if (episodeSpaceMatch) {
    const result = {
      season: 1,
      episode: parseInt(episodeSpaceMatch[1]),
      format: 'episode-space'
    };
    console.log('Matched episode space format:', result);
    return result;
  }
  
  // Episode with colon: "Episode: 01", "Ep: 12", etc.
  const episodeColonMatch = title.match(/(?:episode|ep):\s*(\d{1,4})/i);
  if (episodeColonMatch) {
    const result = {
      season: 1,
      episode: parseInt(episodeColonMatch[1]),
      format: 'episode-colon'
    };
    console.log('Matched episode colon format:', result);
    return result;
  }
  
  // Volume/Chapter format: Vol.01, Chapter 12, etc.
  const volumeMatch = title.match(/(?:vol|volume|chap|chapter)\.?\s*(\d{1,4})/i);
  if (volumeMatch) {
    const result = {
      season: 1,
      episode: parseInt(volumeMatch[1]),
      format: 'volume-chapter'
    };
    console.log('Matched volume/chapter format:', result);
    return result;
  }

  // Special episode patterns: Special 01, OVA 02, etc.
  const specialMatch = title.match(/(?:special|ova|ona|movie)\s*(\d{1,4})/i);
  if (specialMatch) {
    const result = {
      season: 1,
      episode: parseInt(specialMatch[1]),
      format: 'special'
    };
    console.log('Matched special format:', result);
    return result;
  }

  // Final fallback: numbers after common anime title patterns
  // Look for standalone 2-3 digit numbers that could be episodes
  const standaloneMatch = title.match(/(?:^|[\s\-\[\]()])\b(\d{2,3})\b(?=[\s\[\]().]|$)(?!(?:p|x\d+|AAC|mp4|mkv|avi|x264|x265|HEVC|WEB|CR|v\d+|chap|vol))/i);
  if (standaloneMatch) {
    const episodeNum = parseInt(standaloneMatch[1]);
    // Only consider it an episode if it's a reasonable episode number (1-999)
    if (episodeNum >= 1 && episodeNum <= 999) {
      const result = {
        season: 1,
        episode: episodeNum,
        format: 'standalone'
      };
      console.log('Matched standalone number format:', result);
      return result;
    }
  }
  
  console.log('No episode pattern matched for:', title);
  return null;
}

// Add episode information display
function addEpisodeInfo() {
  const torrentRows = document.querySelectorAll('tbody tr');
  
  torrentRows.forEach(row => {
    const titleCell = row.querySelector('td:nth-child(2)');
    if (!titleCell) return;
    
    const titleLink = titleCell.querySelector('a');
    if (!titleLink) return;
    
    const title = titleLink.textContent.trim();
    const episodeInfo = extractEpisodeInfo(title);
    
    if (episodeInfo) {
      // Add episode info badge
      const episodeBadge = createEpisodeBadge(episodeInfo);
      titleCell.appendChild(episodeBadge);
    }
  });
}

// Create episode information badge
function createEpisodeBadge(episodeInfo) {
  const badge = document.createElement('span');
  badge.className = 'nyaa-episode-badge';

  // Show season information if it's not the default season 1, or if format contains season info
  if (episodeInfo.season !== 1 || episodeInfo.format === 'season-episode' || episodeInfo.format === 'season-dash') {
    badge.textContent = `S${episodeInfo.season}E${episodeInfo.episode}`;
  } else if (episodeInfo.format === 'volume-chapter') {
    badge.textContent = `Vol ${episodeInfo.episode}`;
  } else if (episodeInfo.format === 'special') {
    badge.textContent = `Special ${episodeInfo.episode}`;
  } else {
    badge.textContent = `Ep ${episodeInfo.episode}`;
  }

  badge.title = `Season ${episodeInfo.season}, Episode ${episodeInfo.episode}`;
  return badge;
}

// Monitor for dynamic content changes
function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if new torrent rows were added
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'TR' || node.querySelector('tr')) {
              shouldUpdate = true;
            }
          }
        });
      }
    });
    
    if (shouldUpdate) {
      // Debounce updates
      clearTimeout(window.nyaaTrackerUpdateTimeout);
      window.nyaaTrackerUpdateTimeout = setTimeout(() => {
        addTrackingButtons();
        addEpisodeInfo();
      }, 500);
    }
  });
  
  // Start observing
  const targetNode = document.querySelector('tbody') || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });
}

// Show notification to user
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.nyaa-notification');
  existingNotifications.forEach(notification => notification.remove());
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `nyaa-notification nyaa-notification-${type}`;
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check if extension context is still valid
  if (!chrome.runtime?.id) {
    console.warn('Extension context invalidated, cannot handle message:', request.action);
    sendResponse({ success: false, error: 'Extension context invalidated' });
    return;
  }

  switch (request.action) {
    case 'getPageInfo':
      const pageInfo = {
        url: window.location.href,
        title: document.title,
        isNyaaPage: window.location.hostname === 'nyaa.si'
      };
      sendResponse(pageInfo);
      break;

    case 'highlightTracked':
      highlightTrackedAnime(request.trackedAnime);
      sendResponse({ success: true });
      break;

    case 'openMagnetLink':
      // Handle magnet link opening from service worker
      openMagnetLink(request.magnetLink, request.title);
      sendResponse({ success: true });
      break;
  }
});

// Open magnet link with improved reliability and multiple fallback strategies
function openMagnetLink(magnetLink, title) {
  try {
    console.log(`Opening magnet link for: ${title}`);

    // Try multiple strategies to ensure magnet link opens reliably
    const success = tryOpenMagnetReliably(magnetLink, title);

    if (success) {
      showNotification(`Magnet link opened: ${title}`, 'success');
    } else {
      showNotification('Failed to open magnet link', 'error');
    }
  } catch (error) {
    console.error('Error opening magnet link:', error);
    showNotification('Failed to open magnet link', 'error');
  }
}

// Try multiple methods to open magnet link reliably
function tryOpenMagnetReliably(magnetLink, title) {
  try {
    // Method 1: Direct window.open (most reliable in content scripts)
    try {
      const newWindow = window.open(magnetLink, '_blank');
      if (newWindow) {
        console.log('Magnet link opened via direct window.open');
        return true;
      }
    } catch (error) {
      console.warn('Direct window.open failed:', error);
    }

    // Method 2: Create temporary link and simulate click (with user gesture context)
    try {
      const link = document.createElement('a');
      link.href = magnetLink;
      link.target = '_blank';
      link.style.display = 'none';

      // Add to DOM temporarily
      document.body.appendChild(link);

      // Simulate click with proper event properties
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        // These properties help ensure the browser recognizes it as a user gesture
        clientX: 1,
        clientY: 1,
        button: 0
      });

      // Dispatch the event
      const success = link.dispatchEvent(clickEvent);

      // Remove from DOM
      document.body.removeChild(link);

      if (success) {
        console.log('Magnet link opened via simulated click');
        return true;
      }
    } catch (error) {
      console.warn('Simulated click failed:', error);
    }

    // Method 3: Use location.href as last resort (will navigate current tab)
    try {
      // Only use this if we're confident it's safe (user initiated)
      if (confirm(`Open magnet link in current tab?\n\n${title}`)) {
        window.location.href = magnetLink;
        console.log('Magnet link opened via location.href');
        return true;
      }
    } catch (error) {
      console.warn('Location.href approach failed:', error);
    }

    return false;
  } catch (error) {
    console.error('All magnet opening methods failed:', error);
    return false;
  }
}

// Highlight tracked anime on the page
function highlightTrackedAnime(trackedAnime) {
  // Remove existing highlights
  const existingHighlights = document.querySelectorAll('.nyaa-tracked-highlight');
  existingHighlights.forEach(highlight => {
    highlight.classList.remove('nyaa-tracked-highlight');
  });
  
  // Add highlights for tracked anime
  trackedAnime.forEach(anime => {
    const torrentRows = document.querySelectorAll('tbody tr');
    
    torrentRows.forEach(row => {
      const titleCell = row.querySelector('td:nth-child(2) a');
      if (titleCell) {
        const title = titleCell.textContent.trim();
        const seriesName = extractSeriesName(title);
        
        if (seriesName.toLowerCase().includes(anime.title.toLowerCase()) ||
            anime.title.toLowerCase().includes(seriesName.toLowerCase())) {
          row.classList.add('nyaa-tracked-highlight');
        }
      }
    });
  });
}

// Utility function to check if anime is already tracked
async function isAnimeTracked(animeTitle) {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.warn('Extension context invalidated, cannot check tracked status');
      return false;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'getTrackedAnime'
    });

    return response.some(anime =>
      anime.title.toLowerCase() === animeTitle.toLowerCase()
    );
  } catch (error) {
    console.error('Error checking if anime is tracked:', error);
    return false;
  }
}

