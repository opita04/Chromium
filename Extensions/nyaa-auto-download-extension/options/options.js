// Options page script for Nyaa Auto Download Extension
// Handles settings management and data operations

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Options page loaded');

    // Initialize options page
    await initializeOptions();

    // Set up event listeners
    setupEventListeners();

    // Load current settings
    await loadSettings();

    // Update storage usage
    await updateStorageUsage();
});

// This function is no longer needed since we removed protocol handlers
// Keeping it for potential future use if protocol handlers become more stable

// Process magnet link based on user settings
async function processMagnetLink(magnetLink, title, isAuto = false) {
    try {
        // Get user settings
        const settings = await chrome.storage.sync.get(['torrentClient']);

        if (settings.torrentClient === 'clipboard') {
            // Copy to clipboard
            await navigator.clipboard.writeText(magnetLink);
            showNotification(`Magnet link copied to clipboard: ${title}`, 'success');
        } else if (isAuto) {
            // For auto-download scenarios, copy to clipboard since user gesture is not available
            await navigator.clipboard.writeText(magnetLink);
            showNotification(`Magnet link copied to clipboard (auto-download): ${title}`, 'success');
        } else {
            // Try to open in browser (user gesture is available)
            const success = await tryOpenMagnetLink(magnetLink, title);
            if (success) {
                showNotification(`Magnet link opened: ${title}`, 'success');
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(magnetLink);
                showNotification(`Magnet link copied to clipboard (fallback): ${title}`, 'warning');
            }
        }
    } catch (error) {
        console.error('Error processing magnet link:', error);
        // Ultimate fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(magnetLink);
            showNotification('Magnet link copied to clipboard', 'warning');
        } catch (clipboardError) {
            showNotification('Failed to handle magnet link', 'error');
        }
    }
}

// Try to open magnet link using various methods
async function tryOpenMagnetLink(magnetLink, title) {
    try {
        // Method 1: Direct window.open (works in most browsers)
        const newWindow = window.open(magnetLink, '_blank');
        if (newWindow) {
            console.log('Magnet link opened via window.open');
            return true;
        }

        // Method 2: Create a temporary link and click it
        const link = document.createElement('a');
        link.href = magnetLink;
        link.target = '_blank';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('Magnet link opened via temporary link');
        return true;

    } catch (error) {
        console.warn('Failed to open magnet link directly:', error);
        return false;
    }
}

// Extract title from magnet link if available
function extractTitleFromMagnet(magnetLink) {
    try {
        const url = new URL(magnetLink);
        const displayName = url.searchParams.get('dn');
        if (displayName) {
            return decodeURIComponent(displayName);
        }
    } catch (error) {
        console.warn('Failed to extract title from magnet link:', error);
    }
    return null;
}

// Initialize options page
async function initializeOptions() {
    try {
        // Set up torrent client change handler
        const torrentClientSelect = document.getElementById('torrentClient');
        const customCommandItem = document.getElementById('customCommandItem');

        torrentClientSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customCommandItem.style.display = 'block';
            } else {
                customCommandItem.style.display = 'none';
            }
        });

    } catch (error) {
        console.error('Error initializing options:', error);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Form submission
    document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings);
    
    // Reset button
    document.getElementById('resetBtn').addEventListener('click', handleResetSettings);
    
    // Data management buttons
    document.getElementById('exportBtn').addEventListener('click', handleExportData);
    document.getElementById('importBtn').addEventListener('click', handleImportData);
    document.getElementById('clearBtn').addEventListener('click', handleClearData);
    
    // Footer links
    document.getElementById('helpLink').addEventListener('click', handleHelp);
    document.getElementById('githubLink').addEventListener('click', handleGitHub);
    document.getElementById('reportLink').addEventListener('click', handleReportIssue);
    
    // Import file input
    document.getElementById('importFile').addEventListener('change', handleImportFile);
}

// Load current settings
async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get([
            'checkInterval',
            'notifications',
            'torrentClient',
            'customCommand',
            'qualityFilter',
            'multiEpisode',
            'autoDownload',
            'useDownloadQueue'
        ]);

        // Set form values
        document.getElementById('checkInterval').value = settings.checkInterval || 60;
        document.getElementById('notifications').checked = settings.notifications !== false;
        document.getElementById('torrentClient').value = settings.torrentClient || 'browser';
        document.getElementById('customCommand').value = settings.customCommand || '';
        document.getElementById('qualityFilter').value = settings.qualityFilter || 'all';
        document.getElementById('multiEpisode').checked = settings.multiEpisode || false;
        document.getElementById('autoDownload').checked = settings.autoDownload || false;
        document.getElementById('useDownloadQueue').checked = settings.useDownloadQueue || false;

        // Show/hide custom command field
        const torrentClient = settings.torrentClient || 'browser';
        const customCommandItem = document.getElementById('customCommandItem');
        customCommandItem.style.display = torrentClient === 'custom' ? 'block' : 'none';

    } catch (error) {
        console.error('Error loading settings:', error);
        showNotification('Failed to load settings', 'error');
    }
}

// Handle save settings
async function handleSaveSettings(e) {
    e.preventDefault();
    
    const saveBtn = e.target.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;
    
    try {
        saveBtn.textContent = 'Saving...';
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;
        
        // Collect form data
        const formData = new FormData(e.target);
        const settings = {
            checkInterval: parseInt(formData.get('checkInterval')),
            notifications: formData.get('notifications') === 'on',
            torrentClient: formData.get('torrentClient'),
            customCommand: formData.get('customCommand'),
            qualityFilter: formData.get('qualityFilter'),
            multiEpisode: formData.get('multiEpisode') === 'on',
            autoDownload: formData.get('autoDownload') === 'on',
            useDownloadQueue: formData.get('useDownloadQueue') === 'on'
        };
        
        // Validate settings
        if (settings.torrentClient === 'custom' && !settings.customCommand.trim()) {
            throw new Error('Custom command is required when using custom torrent client');
        }
        
        // Save settings
        await chrome.storage.sync.set(settings);
        
        // Update background script
        await chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
        });
        
        showNotification('Settings saved successfully!', 'success');
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification(error.message || 'Failed to save settings', 'error');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
    }
}

// Handle reset settings
async function handleResetSettings() {
    if (!confirm('Reset all settings to default values? This cannot be undone.')) {
        return;
    }
    
    try {
        // Clear all settings
        await chrome.storage.sync.clear();
        
        // Reload settings to show defaults
        await loadSettings();
        
        showNotification('Settings reset to defaults', 'success');
        
    } catch (error) {
        console.error('Error resetting settings:', error);
        showNotification('Failed to reset settings', 'error');
    }
}

// Handle export data
async function handleExportData() {
    try {
        // Get all data
        const [settings, localData] = await Promise.all([
            chrome.storage.sync.get(),
            chrome.storage.local.get()
        ]);
        
        const exportData = {
            settings: settings,
            trackedAnime: localData.trackedAnime || [],
            lastCheckTime: localData.lastCheckTime,
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };
        
        // Create and download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nyaa-auto-download-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Data exported successfully!', 'success');
        
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('Failed to export data', 'error');
    }
}

// Handle import data
function handleImportData() {
    document.getElementById('importFile').click();
}

// Handle import file selection
async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate import data
        if (!importData.version || !importData.settings) {
            throw new Error('Invalid backup file format');
        }
        
        if (!confirm(`Import data from ${importData.exportDate || 'unknown date'}? This will overwrite your current settings and tracked anime.`)) {
            return;
        }
        
        // Import settings
        if (importData.settings) {
            await chrome.storage.sync.set(importData.settings);
        }
        
        // Import tracked anime
        if (importData.trackedAnime) {
            await chrome.storage.local.set({
                trackedAnime: importData.trackedAnime
            });
        }
        
        // Reload settings
        await loadSettings();
        
        showNotification('Data imported successfully!', 'success');
        
    } catch (error) {
        console.error('Error importing data:', error);
        showNotification(error.message || 'Failed to import data', 'error');
    } finally {
        // Reset file input
        e.target.value = '';
    }
}

// Handle clear data
async function handleClearData() {
    if (!confirm('Clear all data? This will remove all tracked anime and reset all settings. This cannot be undone.')) {
        return;
    }
    
    if (!confirm('Are you absolutely sure? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Clear all data
        await Promise.all([
            chrome.storage.sync.clear(),
            chrome.storage.local.clear()
        ]);
        
        // Reload settings
        await loadSettings();
        
        showNotification('All data cleared', 'success');
        
    } catch (error) {
        console.error('Error clearing data:', error);
        showNotification('Failed to clear data', 'error');
    }
}

// Update storage usage display
async function updateStorageUsage() {
    try {
        const usage = await chrome.storage.local.getBytesInUse();

        const usedKB = Math.round(usage / 1024);

        // Chrome extension storage has a quota of approximately 10MB (10,485,760 bytes)
        const quotaBytes = 10 * 1024 * 1024; // 10MB
        const totalKB = Math.round(quotaBytes / 1024);
        const percentage = Math.round((usage / quotaBytes) * 100);

        document.getElementById('storageUsed').textContent =
            `${usedKB} KB / ${totalKB} KB (${percentage}%)`;

    } catch (error) {
        console.error('Error getting storage usage:', error);
        document.getElementById('storageUsed').textContent = 'Unable to calculate';
    }
}

// Handle help link
function handleHelp() {
    chrome.tabs.create({ url: 'https://github.com/opita04/Nyaa-Auto-Download' });
}

// Handle GitHub link
function handleGitHub() {
    chrome.tabs.create({ url: 'https://github.com/opita04/Nyaa-Auto-Download' });
}

// Handle report issue link
function handleReportIssue() {
    chrome.tabs.create({ url: 'https://github.com/opita04/Nyaa-Auto-Download/issues' });
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
}

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
