// Popup script for Nyaa Auto Download Extension
// Handles the popup interface and user interactions

// Download queue to handle multiple magnet links reliably
let downloadQueue = [];
let isProcessingQueue = false;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize popup
        await initializePopup();
        
        // Set up event listeners
        setupEventListeners();
        
        // Load initial data
        await loadPopupData();
        
        // Start automatic download if enabled and there are episodes
        await startAutomaticDownload();
        
    } catch (error) {
        console.error('Error during popup initialization:', error);
    }
});

// Initialize popup state
async function initializePopup() {
    try {
        // Get extension status
        const settings = await chrome.storage.sync.get(['checkInterval', 'notifications']);

        // Update status indicator
        const statusIndicator = document.getElementById('statusIndicator');
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('.status-text');

        statusDot.classList.remove('inactive');
        statusText.textContent = 'Ready';

        // Update last check time
        const { lastCheckTime } = await chrome.storage.local.get(['lastCheckTime']);
        if (lastCheckTime) {
            const time = new Date(lastCheckTime);
            document.getElementById('lastCheckTime').textContent =
                time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

    } catch (error) {
        console.error('Error initializing popup:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Check Now button
    document.getElementById('checkNowBtn').addEventListener('click', handleCheckNow);

    // Sort by day button
    document.getElementById('sortByDayBtn').addEventListener('click', handleSortByDay);

    // Open Nyaa.si button
    document.getElementById('openNyaaBtn').addEventListener('click', handleOpenNyaa);

    // Open All button
    document.getElementById('openAllBtn').addEventListener('click', handleOpenAll);

    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', handleOpenSettings);

    // Help link
    document.getElementById('helpLink').addEventListener('click', handleHelp);

    // About link
    document.getElementById('aboutLink').addEventListener('click', handleAbout);

    // Clear episodes button
    document.getElementById('clearEpisodesBtn').addEventListener('click', handleClearEpisodes);
    

}

// Load popup data
async function loadPopupData() {
    try {
        // Get tracked anime
        const response = await chrome.runtime.sendMessage({ action: 'getTrackedAnime' });
        const trackedAnime = response || [];
        
        // Get new episodes from storage
        const storageData = await chrome.storage.local.get(['newEpisodes']);
        const newEpisodes = storageData.newEpisodes || [];
        
        // Calculate new episodes count per anime
        const animeWithCounts = trackedAnime.map(anime => {
            const newEpisodesForAnime = newEpisodes.filter(episode => 
                episode.animeTitle === anime.title
            );
            return {
                ...anime,
                newEpisodesCount: newEpisodesForAnime.length
            };
        });
        
        // Update stats
        const trackedCountEl = document.getElementById('trackedCount');
        const newEpisodesCountEl = document.getElementById('newEpisodesCount');
        
        if (trackedCountEl) {
            trackedCountEl.textContent = animeWithCounts.length;
        }
        
        // Calculate total new episodes count
        const totalNewEpisodesCount = newEpisodes.length;
        
        if (newEpisodesCountEl) {
            newEpisodesCountEl.textContent = totalNewEpisodesCount;
        }
        
        // Render anime list with updated counts
        renderAnimeList(animeWithCounts);
        
        // Load and render episodes
        await loadEpisodes();
        
    } catch (error) {
        console.error('Error loading popup data:', error);
        showError('Failed to load data');
    }
}

// Render anime list
function renderAnimeList(trackedAnime) {
    const animeList = document.getElementById('animeList');
    const openAllBtn = document.getElementById('openAllBtn');

    if (trackedAnime.length === 0) {
        animeList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📺</span>
                <p>No anime being tracked</p>
                <small>Visit Nyaa.si and click "Track" on anime you want to monitor</small>
            </div>
        `;
        // Hide Open All button when no anime is tracked
        openAllBtn.style.display = 'none';
        return;
    }

    // Show Open All button when anime is tracked
    openAllBtn.style.display = 'inline-flex';

    animeList.innerHTML = trackedAnime.map(anime => {
        const categoryDisplay = anime.category ?
            `<span class="category-badge" title="Category: ${anime.category}">📅 ${anime.category.charAt(0).toUpperCase() + anime.category.slice(1)}</span>` : '';

        return `
        <div class="anime-item" data-anime-id="${anime.id}">
            <div class="anime-info anime-link" data-url="${anime.nyaaUrl}" style="cursor: pointer;">
                <div class="anime-title" title="${anime.title}">${anime.title}</div>
                <div class="anime-episode">
                    Last: S${anime.lastSeason}E${anime.lastEpisode}
                    ${anime.newEpisodesCount ? `(${anime.newEpisodesCount} new)` : ''}
                    ${categoryDisplay}
                </div>
            </div>
            <div class="anime-actions">
                <select class="category-select" data-anime-id="${anime.id}" title="Assign category">
                    <option value="">📅 Category</option>
                    <option value="monday" ${anime.category === 'monday' ? 'selected' : ''}>Monday</option>
                    <option value="tuesday" ${anime.category === 'tuesday' ? 'selected' : ''}>Tuesday</option>
                    <option value="wednesday" ${anime.category === 'wednesday' ? 'selected' : ''}>Wednesday</option>
                    <option value="thursday" ${anime.category === 'thursday' ? 'selected' : ''}>Thursday</option>
                    <option value="friday" ${anime.category === 'friday' ? 'selected' : ''}>Friday</option>
                    <option value="saturday" ${anime.category === 'saturday' ? 'selected' : ''}>Saturday</option>
                    <option value="sunday" ${anime.category === 'sunday' ? 'selected' : ''}>Sunday</option>
                </select>
                <button class="btn btn-danger anime-remove-btn" data-anime-id="${anime.id}" title="Remove from tracking">
                    ✕
                </button>
            </div>
        </div>
    `}).join('');

    // Automatically sort by day category after rendering
    sortAnimeByDay();

    // Add event listeners after rendering
    setupAnimeEventListeners();
}

// Sort anime by day category (Monday to Sunday)
function sortAnimeByDay() {
    // Get current anime data
    const currentAnime = Array.from(document.querySelectorAll('.anime-item')).map(item => {
        const animeId = item.getAttribute('data-anime-id');
        const title = item.querySelector('.anime-title').textContent;
        return { id: animeId, title, element: item };
    });

    // Sort by day category (Monday to Sunday), then by title
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    currentAnime.sort((a, b) => {
        // Get category from the select element
        const getCategory = (anime) => {
            const categorySelect = anime.element.querySelector('.category-select');
            if (categorySelect && categorySelect.value) {
                return categorySelect.value;
            }
            return '';
        };

        const categoryA = getCategory(a);
        const categoryB = getCategory(b);

        // If both have categories, sort by day order
        if (categoryA && categoryB) {
            const indexA = dayOrder.indexOf(categoryA);
            const indexB = dayOrder.indexOf(categoryB);
            if (indexA !== indexB) {
                return indexA - indexB;
            }
        }
        // If one has category and other doesn't, prioritize the one with category
        else if (categoryA && !categoryB) {
            return -1;
        }
        else if (!categoryA && categoryB) {
            return 1;
        }

        // Otherwise sort alphabetically by title
        return a.title.localeCompare(b.title);
    });

    // Reorder DOM elements
    const animeList = document.getElementById('animeList');
    currentAnime.forEach(anime => {
        animeList.appendChild(anime.element);
    });
}

// Handle Sort by Category button click
function handleSortByDay() {
    const sortBtn = document.getElementById('sortByDayBtn');

    // Apply sorting
    sortAnimeByDay();

    // Update button text temporarily to show it was sorted
    const originalText = sortBtn.innerHTML;
    sortBtn.innerHTML = '✓ Sorted';
    setTimeout(() => {
        sortBtn.innerHTML = originalText;
    }, 1000);
}

// Handle Check Now button click
async function handleCheckNow() {
    const checkBtn = document.getElementById('checkNowBtn');
    const originalText = checkBtn.textContent;
    
    try {
        checkBtn.textContent = 'Checking...';
        checkBtn.classList.add('loading');
        checkBtn.disabled = true;
        
        // Send check request to background script
        const response = await chrome.runtime.sendMessage({ action: 'checkNow' });
        
        if (response.success) {
            showSuccess('Check completed!');
            // Reload data to show any new episodes
            await loadPopupData();
        } else {
            showError('Check failed');
        }
        
    } catch (error) {
        console.error('Error checking for episodes:', error);
        showError('Check failed');
    } finally {
        checkBtn.textContent = originalText;
        checkBtn.classList.remove('loading');
        checkBtn.disabled = false;
    }
}

// Handle Open Nyaa.si button click
function handleOpenNyaa() {
    chrome.tabs.create({ url: 'https://nyaa.si' });
    window.close();
}

// Handle Open All button click
async function handleOpenAll() {
    try {
        // Get tracked anime
        const response = await chrome.runtime.sendMessage({ action: 'getTrackedAnime' });
        const trackedAnime = response || [];
        
        if (trackedAnime.length === 0) {
            showError('No anime being tracked');
            return;
        }
        
        // Show loading state
        const openAllBtn = document.getElementById('openAllBtn');
        const originalText = openAllBtn.innerHTML;
        openAllBtn.innerHTML = '<span class="btn-icon">⏳</span>Opening...';
        openAllBtn.disabled = true;
        
        // Open each anime in a new tab with delay to avoid rate limiting
        for (let i = 0; i < trackedAnime.length; i++) {
            const anime = trackedAnime[i];
            chrome.tabs.create({ url: anime.nyaaUrl });
            
            // Add delay between requests (except for the last one)
            if (i < trackedAnime.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }
        }
        
        showSuccess(`Opened ${trackedAnime.length} anime pages`);
        
        // Close popup after a short delay
        setTimeout(() => {
            window.close();
        }, 500);
        
    } catch (error) {
        console.error('Error opening all anime:', error);
        showError('Failed to open anime pages');
        
        // Reset button state on error
        const openAllBtn = document.getElementById('openAllBtn');
        openAllBtn.innerHTML = '<span class="btn-icon">📂</span>Open All';
        openAllBtn.disabled = false;
    }
}

// Handle Settings button click
function handleOpenSettings() {
    chrome.runtime.openOptionsPage();
    window.close();
}

// Handle Help link click
function handleHelp() {
    chrome.tabs.create({ url: 'https://github.com/opita04/Nyaa-Auto-Download' });
}

// Handle About link click
function handleAbout() {
    chrome.tabs.create({ url: 'https://github.com/opita04/Nyaa-Auto-Download' });
}

// Handle Clear Episodes button click
async function handleClearEpisodes() {
    try {
        await chrome.storage.local.remove(['newEpisodes']);
        await loadEpisodes();
        showSuccess('Episodes cleared');
    } catch (error) {
        console.error('Error clearing episodes:', error);
        showError('Failed to clear episodes');
    }
}



// Load episodes from storage
async function loadEpisodes() {
    try {
        const { newEpisodes = [] } = await chrome.storage.local.get(['newEpisodes']);
        renderEpisodes(newEpisodes);
    } catch (error) {
        console.error('Error loading episodes:', error);
    }
}

// Render episodes list
function renderEpisodes(episodes) {
    const episodesSection = document.getElementById('episodesSection');
    const episodesList = document.getElementById('episodesList');

    if (episodes.length === 0) {
        episodesSection.style.display = 'none';
        return;
    }

    episodesSection.style.display = 'block';

    episodesList.innerHTML = episodes.map(episode => {
        // Ensure season and episode are valid numbers, default to 1 and 0 if undefined
        const season = episode.season || 1;
        const episodeNum = episode.episode || 0;
        
        return `
        <div class="episode-item" data-episode-id="${episode.id}">
            <div class="episode-info">
                <div class="episode-title" title="${episode.title}">${episode.title}</div>
                <div class="episode-details">
                    <span>S${season}E${episodeNum}</span>
                    <span>${episode.size || 'Unknown'}</span>
                    <span>👥 ${episode.seeders || 0}</span>
                </div>
            </div>
            <div class="episode-actions">
                <button class="magnet-link episode-download-btn" data-magnet="${episode.magnetLink}" data-title="${episode.title}" title="Download magnet link">
                    🔗
                </button>
                <button class="btn btn-danger episode-remove-btn" data-episode-id="${episode.id}" title="Remove episode">
                    ✕
                </button>
            </div>
        </div>
        `;
    }).join('');

    // Add event listeners after rendering
    setupEpisodeEventListeners();
}

// Download magnet link with improved reliability
async function downloadMagnet(magnetLink, title) {
    try {
        // Get user settings to determine handling method
        const settings = await chrome.storage.sync.get(['torrentClient']);

        if (settings.torrentClient === 'clipboard') {
            // Copy to clipboard
            await navigator.clipboard.writeText(magnetLink);
            showSuccess(`Magnet link copied to clipboard: ${title}`);
            return;
        }

        // Try multiple strategies for opening magnet links
        const success = await tryOpenMagnetWithStrategies(magnetLink, title);
        if (success) {
            showSuccess(`Magnet link opened: ${title}`);
        } else {
            // Fallback: copy to clipboard
            await navigator.clipboard.writeText(magnetLink);
            showSuccess('Magnet link copied to clipboard (fallback)');
        }

    } catch (error) {
        console.error('Error opening magnet link:', error);
        // Ultimate fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(magnetLink);
            showSuccess('Magnet link copied to clipboard');
        } catch (clipboardError) {
            console.error('Error copying to clipboard:', clipboardError);
            showError('Failed to handle magnet link');
        }
    }
}

// Handle magnet download with preserved user gesture context
async function handleMagnetDownloadWithUserGesture(magnetLink, title, originalEvent) {
    try {
        // Get user settings to determine handling method
        const settings = await chrome.storage.sync.get(['torrentClient']);

        if (settings.torrentClient === 'clipboard') {
            // Copy to clipboard
            await navigator.clipboard.writeText(magnetLink);
            showSuccess(`Magnet link copied to clipboard: ${title}`);
            return;
        }

        // Try content script approach first (preserves user gesture context)
        const contentScriptSuccess = await tryContentScriptMagnet(magnetLink, title);
        if (contentScriptSuccess) {
            showSuccess(`Magnet link opened: ${title}`);
            return;
        }

        // Try direct opening with user gesture context
        const directSuccess = await tryDirectMagnetOpenWithGesture(magnetLink, title, originalEvent);
        if (directSuccess) {
            showSuccess(`Magnet link opened: ${title}`);
            return;
        }

        // Final fallback: copy to clipboard
        await navigator.clipboard.writeText(magnetLink);
        showSuccess('Magnet link copied to clipboard (fallback)');

    } catch (error) {
        console.error('Error in magnet download handler:', error);
        throw error; // Re-throw to trigger the catch block in the event listener
    }
}

// Try multiple strategies to open magnet link
async function tryOpenMagnetWithStrategies(magnetLink, title) {
    try {
        // Strategy 1: Content script approach (most reliable)
        const contentScriptSuccess = await tryContentScriptMagnet(magnetLink, title);
        if (contentScriptSuccess) return true;

        // Strategy 2: Direct window.open
        const directSuccess = await tryDirectMagnetOpen(magnetLink, title);
        if (directSuccess) return true;

        return false;
    } catch (error) {
        console.error('All magnet opening strategies failed:', error);
        return false;
    }
}

// Try using content script in Nyaa tabs
async function tryContentScriptMagnet(magnetLink, title) {
    try {
        // First try: send message to active Nyaa tab
        const activeTabs = await chrome.tabs.query({ url: '*://nyaa.si/*', active: true });
        if (activeTabs.length > 0) {
            try {
                await chrome.tabs.sendMessage(activeTabs[0].id, {
                    action: 'openMagnetLink',
                    magnetLink: magnetLink,
                    title: title
                });
                console.log('Magnet link opened via active content script');
                return true;
            } catch (msgError) {
                console.warn('Failed to send to active tab:', msgError);
            }
        }

        // Second try: send message to any Nyaa tab
        const anyNyaaTabs = await chrome.tabs.query({ url: '*://nyaa.si/*' });
        if (anyNyaaTabs.length > 0) {
            try {
                await chrome.tabs.sendMessage(anyNyaaTabs[0].id, {
                    action: 'openMagnetLink',
                    magnetLink: magnetLink,
                    title: title
                });
                console.log('Magnet link opened via content script');
                return true;
            } catch (msgError) {
                console.warn('Failed to send to any Nyaa tab:', msgError);
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

// Handle magnet link click synchronously to preserve user gesture
function handleMagnetClickSync(magnetLink, title, originalEvent) {
    // First, check user preference for torrent client
    chrome.storage.sync.get(['torrentClient'], (settings) => {
        if (settings.torrentClient === 'clipboard') {
            // Copy to clipboard immediately
            navigator.clipboard.writeText(magnetLink).then(() => {
                showSuccess(`Magnet link copied to clipboard: ${title}`);
            }).catch(() => {
                showError('Failed to copy to clipboard');
            });
            return;
        }

        // Try to open magnet link synchronously
        const success = tryDirectMagnetOpenSync(magnetLink, title, originalEvent);
        if (success) {
            showSuccess(`Magnet link opened: ${title}`);
        } else {
            // Fallback to clipboard
            navigator.clipboard.writeText(magnetLink).then(() => {
                showSuccess('Magnet link copied to clipboard (fallback)');
            }).catch(() => {
                showError('Failed to handle magnet link');
            });
        }
    });
}

// Try direct magnet open synchronously to preserve user gesture
function tryDirectMagnetOpenSync(magnetLink, title, originalEvent) {
    try {
        // Method 1: Direct window.open synchronously
        const newWindow = window.open(magnetLink, '_blank');
        if (newWindow) {
            console.log('Magnet link opened via direct window.open (sync)');
            return true;
        }

        // Method 2: Create temporary link and dispatch click event with user gesture context
        const link = document.createElement('a');
        link.href = magnetLink;
        link.target = '_blank';
        link.style.display = 'none';
        document.body.appendChild(link);

        // Create a proper click event that preserves user gesture context
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: (originalEvent && originalEvent.clientX) || 1,
            clientY: (originalEvent && originalEvent.clientY) || 1,
            screenX: (originalEvent && originalEvent.screenX) || 1,
            screenY: (originalEvent && originalEvent.screenY) || 1,
            button: 0,
            buttons: 1,
            composed: true,
            // Copy modifier keys to preserve user gesture context
            ctrlKey: originalEvent ? originalEvent.ctrlKey : false,
            altKey: originalEvent ? originalEvent.altKey : false,
            shiftKey: originalEvent ? originalEvent.shiftKey : false,
            metaKey: originalEvent ? originalEvent.metaKey : false
        });

        const dispatched = link.dispatchEvent(clickEvent);
        document.body.removeChild(link);

        if (dispatched) {
            console.log('Magnet link opened via simulated click (sync)');
            return true;
        }

        // Method 3: Direct click without event simulation
        const link2 = document.createElement('a');
        link2.href = magnetLink;
        link2.target = '_blank';
        link2.style.display = 'none';
        document.body.appendChild(link2);
        link2.click();
        document.body.removeChild(link2);
        console.log('Magnet link opened via direct click');
        return true;

    } catch (error) {
        console.warn('tryDirectMagnetOpenSync failed:', error);
        return false;
    }
}

// Try direct window.open with preserved user gesture context
async function tryDirectMagnetOpenWithGesture(magnetLink, title, originalEvent) {
    try {
        // Method 1: Direct window.open (should work if called synchronously from user gesture)
        const newWindow = window.open(magnetLink, '_blank');
        if (newWindow) {
            console.log('Magnet link opened via direct window.open');
            return true;
        }

        // Method 2: Create temporary link and simulate click with user gesture context
        const link = document.createElement('a');
        link.href = magnetLink;
        link.target = '_blank';
        link.style.display = 'none';
        document.body.appendChild(link);

        // Use the original event's properties to create a proper user gesture
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            // Copy properties from the original event to preserve user gesture context
            clientX: originalEvent.clientX || 1,
            clientY: originalEvent.clientY || 1,
            screenX: originalEvent.screenX || 1,
            screenY: originalEvent.screenY || 1,
            button: 0,
            buttons: 1,
            composed: true,
            // These are important for user gesture recognition
            ctrlKey: originalEvent.ctrlKey || false,
            altKey: originalEvent.altKey || false,
            shiftKey: originalEvent.shiftKey || false,
            metaKey: originalEvent.metaKey || false
        });

        // Dispatch the event - this should work with user gesture context
        const success = link.dispatchEvent(clickEvent);

        // Clean up
        document.body.removeChild(link);

        if (success) {
            console.log('Magnet link opened via simulated click with preserved user gesture');
            return true;
        }

        return false;

    } catch (error) {
        console.warn('Direct magnet opening with gesture failed:', error);
        return false;
    }
}

// Try direct window.open as final fallback (original function for backward compatibility)
async function tryDirectMagnetOpen(magnetLink, title) {
    try {
        // Method 1: Direct window.open
        const newWindow = window.open(magnetLink, '_blank');
        if (newWindow) {
            console.log('Magnet link opened via direct window.open');
            return true;
        }

        // Method 2: Create temporary link and simulate click
        const link = document.createElement('a');
        link.href = magnetLink;
        link.target = '_blank';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('Magnet link opened via temporary link click');
        return true;

    } catch (error) {
        console.warn('Direct magnet opening failed:', error);
        return false;
    }
}

// Remove episode from list
async function removeEpisode(episodeId) {
    try {
        const { newEpisodes = [] } = await chrome.storage.local.get(['newEpisodes']);
        const updatedEpisodes = newEpisodes.filter(episode => episode.id !== episodeId);
        await chrome.storage.local.set({ newEpisodes: updatedEpisodes });
        await loadEpisodes();
        showSuccess('Episode removed');
    } catch (error) {
        console.error('Error removing episode:', error);
        showError('Failed to remove episode');
    }
}

// Remove anime from tracking
async function removeAnime(animeId) {
    if (!confirm('Remove this anime from tracking?')) {
        return;
    }
    
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'removeAnime',
            animeId: animeId
        });
        
        if (response.success) {
            showSuccess('Anime removed from tracking');
            await loadPopupData();
        } else {
            showError('Failed to remove anime');
        }
        
    } catch (error) {
        console.error('Error removing anime:', error);
        showError('Failed to remove anime');
    }
}

// Show success message
function showSuccess(message) {
    showNotification(message, 'success');
}

// Show error message
function showError(message) {
    showNotification(message, 'error');
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.popup-notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `popup-notification popup-notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        padding: 8px 16px;
        border-radius: 4px;
        color: white;
        font-size: 12px;
        font-weight: 500;
        z-index: 1000;
        animation: slideDown 0.3s ease-out;
    `;
    
    // Set background color based on type
    const colors = {
        success: '#4CAF50',
        error: '#F44336',
        info: '#2196F3',
        warning: '#FF9800'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    
    // Add to popup
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideUp 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Listen for storage changes to update popup in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.trackedAnime) {
        loadPopupData();
    }
    
    if (namespace === 'sync' && (changes.notifications)) {
        initializePopup();
    }
});

// Handle popup visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadPopupData();
    }
});

// Open anime page in new tab
function openAnimePage(nyaaUrl) {
    chrome.tabs.create({ url: nyaaUrl });
    window.close();
}

// Set up event listeners for anime items
function setupAnimeEventListeners() {
    // Anime link clicks
    const animeLinks = document.querySelectorAll('.anime-link');
    animeLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const url = e.currentTarget.getAttribute('data-url');
            if (url) {
                openAnimePage(url);
            }
        });
    });

    // Category selection changes
    const categorySelects = document.querySelectorAll('.category-select');
    categorySelects.forEach(select => {
        select.addEventListener('change', async (e) => {
            e.stopPropagation();
            const animeId = e.currentTarget.getAttribute('data-anime-id');
            const category = e.currentTarget.value;

            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'updateAnimeCategory',
                    animeId: animeId,
                    category: category || null
                });

                if (response.success) {
                    // Reload the popup data to show the updated category
                    await loadPopupData();
                } else {
                    showError('Failed to update category');
                }
            } catch (error) {
                console.error('Error updating category:', error);
                showError('Failed to update category');
            }
        });
    });

    // Anime remove buttons
    const removeButtons = document.querySelectorAll('.anime-remove-btn');
    removeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const animeId = e.currentTarget.getAttribute('data-anime-id');
            if (animeId) {
                removeAnime(animeId);
            }
        });
    });
}

// Set up event listeners for episode items
function setupEpisodeEventListeners() {
    // Use event delegation for both download and remove buttons
    document.getElementById('episodesList').addEventListener('click', (e) => {
        const downloadBtn = e.target.closest('.episode-download-btn');
        if (downloadBtn) {
            e.preventDefault();
            e.stopPropagation();

            const magnetLink = downloadBtn.getAttribute('data-magnet');
            const title = downloadBtn.getAttribute('data-title');

            if (magnetLink && title) {
                // Try to open magnet link synchronously to preserve user gesture
                handleMagnetClickSync(magnetLink, title, e);
            }
            return;
        }

        const removeBtn = e.target.closest('.episode-remove-btn');
        if (removeBtn) {
            const episodeId = removeBtn.getAttribute('data-episode-id');
            if (episodeId) {
                removeEpisode(episodeId);
            }
        }
    });
}

// Start automatic download if there are new episodes and auto-download is enabled
async function startAutomaticDownload() {
    try {
        // Check if auto-download is enabled
        const settings = await chrome.storage.sync.get(['autoDownload']);
        if (!settings.autoDownload) {
            return;
        }

        // Get new episodes
        const { newEpisodes = [] } = await chrome.storage.local.get(['newEpisodes']);
        if (newEpisodes.length === 0) {
            return;
        }

        // Find the highest quality episode for each anime (to avoid duplicates)
        const episodesByAnime = {};
        newEpisodes.forEach(episode => {
            const key = `${episode.animeTitle}-S${episode.season}-E${episode.episode}`;
            if (!episodesByAnime[key] || episode.seeders > episodesByAnime[key].seeders) {
                episodesByAnime[key] = episode;
            }
        });

        // Add unique episodes to the download queue
        const uniqueEpisodes = Object.values(episodesByAnime);
        if (uniqueEpisodes.length > 0) {
            downloadQueue.push(...uniqueEpisodes);
            showNotification(`Added ${uniqueEpisodes.length} episodes to download queue`, 'info');
            
            // Start processing the queue
            processDownloadQueue();
        }
    } catch (error) {
        console.error('Error starting automatic download:', error);
    }
}

// Process the download queue with delays to avoid rate limiting
async function processDownloadQueue() {
    if (isProcessingQueue || downloadQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;
    
    try {
        while (downloadQueue.length > 0) {
            const episode = downloadQueue.shift();
            
            // Show current download status
            showNotification(`Downloading: ${episode.title}`, 'info');
            
            // Try to open the magnet link with a delay between downloads
            const success = await tryDirectMagnetOpenWithDelay(episode.magnetLink, episode.title);
            
            if (success) {
                showSuccess(`Download started: ${episode.title}`);
                // Remove the episode from storage after successful download
                await removeEpisodeFromStorage(episode.id);
            } else {
                showError(`Failed to download: ${episode.title}`);
                // Re-add to queue for retry later
                downloadQueue.push(episode);
            }
            
            // Wait before processing next download to avoid rate limiting
            if (downloadQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
            }
        }
    } catch (error) {
        console.error('Error processing download queue:', error);
    } finally {
        isProcessingQueue = false;
    }
}

// Try to open magnet link with a direct method and delay handling
async function tryDirectMagnetOpenWithDelay(magnetLink, title) {
    try {
        // Use the most reliable synchronous method
        const success = tryDirectMagnetOpenSync(magnetLink, title, new MouseEvent('click'));
        return success;
    } catch (error) {
        console.warn('Direct magnet open failed, falling back to content script:', error);
        // Fallback to content script approach
        return await tryContentScriptMagnet(magnetLink, title);
    }
}

// Remove episode from storage after successful download
async function removeEpisodeFromStorage(episodeId) {
    try {
        const { newEpisodes = [] } = await chrome.storage.local.get(['newEpisodes']);
        const updatedEpisodes = newEpisodes.filter(ep => ep.id !== episodeId);
        await chrome.storage.local.set({ newEpisodes: updatedEpisodes });
        
        // Update the UI
        await loadEpisodes();
    } catch (error) {
        console.error('Error removing episode from storage:', error);
    }
}

// Modified magnet click handler to use the queue
function handleMagnetClickSync(magnetLink, title, originalEvent) {
    // First, check user preference for torrent client
    chrome.storage.sync.get(['torrentClient', 'useDownloadQueue'], (settings) => {
        if (settings.torrentClient === 'clipboard') {
            // Copy to clipboard immediately
            navigator.clipboard.writeText(magnetLink).then(() => {
                showSuccess(`Magnet link copied to clipboard: ${title}`);
            }).catch(() => {
                showError('Failed to copy to clipboard');
            });
            return;
        }

        // If using download queue, add to queue instead of immediate download
        if (settings.useDownloadQueue) {
            // Create a temporary episode object for the queue
            const episode = {
                id: `manual-${Date.now()}`,
                magnetLink: magnetLink,
                title: title,
                animeTitle: 'Manual Download',
                season: 1,
                episode: 0,
                addedAt: new Date().toISOString()
            };
            
            downloadQueue.push(episode);
            showNotification(`Added to download queue: ${title}`, 'info');
            
            // Start processing the queue if not already processing
            if (!isProcessingQueue) {
                processDownloadQueue();
            }
            return;
        }

        // Try to open magnet link synchronously (original behavior)
        const success = tryDirectMagnetOpenSync(magnetLink, title, originalEvent);
        if (success) {
            showSuccess(`Magnet link opened: ${title}`);
        } else {
            // Fallback to clipboard
            navigator.clipboard.writeText(magnetLink).then(() => {
                showSuccess('Magnet link copied to clipboard (fallback)');
            }).catch(() => {
                showError('Failed to handle magnet link');
            });
        }
    });
}
