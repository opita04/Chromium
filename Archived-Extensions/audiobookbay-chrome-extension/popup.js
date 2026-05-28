// Popup script for AudiobookBay Chrome Extension
class PopupController {
    constructor() {
        this.currentResults = [];
        this.lastQuery = '';
        this.init();
    }

    init() {
        // Get DOM elements
        this.searchInput = document.getElementById('searchInput');
        this.searchBtn = document.getElementById('searchBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.resultsCount = document.getElementById('resultsCount');
        this.noResults = document.getElementById('noResults');
        this.loading = document.getElementById('loading');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.statusBtn = document.getElementById('statusBtn');
        this.helpBtn = document.getElementById('helpBtn');
        this.clearResultsBtn = document.getElementById('clearResultsBtn');
        this.infoMessage = document.getElementById('infoMessage');

        // Add event listeners
        this.setupEventListeners();
        
        // Load any cached results from previous searches
        this.loadCachedResults();
        
        // Check if we're on an AudiobookBay page and offer to search for the current page
        this.checkCurrentPage();

        console.log('Popup initialized');
    }

    async loadCachedResults() {
        try {
            // Load cached search results from storage
            const cached = await chrome.storage.local.get(['lastSearchResults', 'lastSearchQuery', 'lastSearchTime']);
            
            // Check if cache is not too old (24 hours)
            const cacheAge = Date.now() - (cached.lastSearchTime || 0);
            const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (cached.lastSearchResults && cached.lastSearchResults.length > 0 && cacheAge < maxCacheAge) {
                this.currentResults = cached.lastSearchResults;
                this.lastQuery = cached.lastSearchQuery || '';
                
                // Restore search input
                if (this.lastQuery) {
                    this.searchInput.value = this.lastQuery;
                }
                
                // Display the cached results
                this.displayResults(this.currentResults);
                
                const ageHours = Math.floor(cacheAge / (60 * 60 * 1000));
                console.log(`Loaded ${this.currentResults.length} cached results for "${this.lastQuery}" (${ageHours}h old)`);
            } else if (cacheAge >= maxCacheAge) {
                // Clean up old cache
                await this.clearCachedResults();
                console.log('Cleared expired cache');
            }
        } catch (error) {
            console.error('Error loading cached results:', error);
        }
    }

    setupEventListeners() {
        // Search functionality
        this.searchBtn.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });

        // Footer buttons
        this.settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
        });

        this.statusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showStatus();
        });

        this.helpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showHelp();
        });

        // Clear results button
        if (this.clearResultsBtn) {
            this.clearResultsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.clearCachedResults();
            });
        }

        // Focus search input on open
        this.searchInput.focus();
    }

    async checkCurrentPage() {
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && tab.url) {
                const url = new URL(tab.url);
                const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
                
                // Check if we're on an AudiobookBay page
                const result = await chrome.storage.sync.get(['audiobookbayDomains']);
                const domains = result.audiobookbayDomains || ['audiobookbay.lu', 'audiobookbay.is'];
                
                if (domains.some(domain => hostname === domain.toLowerCase())) {
                    // We're on an AudiobookBay page, offer contextual actions
                    this.showContextualActions(tab);
                }
            }
        } catch (error) {
            console.error('Error checking current page:', error);
        }
    }

    showContextualActions(tab) {
        const contextBar = document.createElement('div');
        contextBar.style.cssText = `
            padding: 10px 20px;
            background: rgba(255, 193, 7, 0.2);
            border-bottom: 1px solid rgba(255, 193, 7, 0.3);
            font-size: 12px;
            text-align: center;
        `;
        contextBar.innerHTML = `
            📍 You're on AudiobookBay! 
            <button id="enhancePageBtn" style="
                background: #ffc107;
                color: #000;
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                font-size: 11px;
                margin-left: 8px;
                cursor: pointer;
            ">Enhance This Page</button>
        `;

        // Insert after header
        const header = document.querySelector('.header');
        header.parentNode.insertBefore(contextBar, header.nextSibling);

        // Add enhance button functionality
        const enhanceBtn = contextBar.querySelector('#enhancePageBtn');
        enhanceBtn.addEventListener('click', async () => {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'enhancePage' });
                contextBar.innerHTML = '✅ Page enhanced! Close this popup to see the changes.';
            } catch (error) {
                contextBar.innerHTML = '❌ Enhancement failed. Please refresh the page and try again.';
            }
        });
    }

    async performSearch() {
        const query = this.searchInput.value.trim();
        
        if (!query) {
            this.showStatus('Please enter a search term', 'error');
            return;
        }

        try {
            // Show loading state
            this.showLoading(true);
            this.hideElements(['resultsSection', 'noResults']);

            // Disable search button
            this.searchBtn.disabled = true;
            this.searchBtn.textContent = 'Searching...';

            console.log('Performing search for:', query);

            // Send search request to background script
            const response = await chrome.runtime.sendMessage({
                action: 'searchAudiobooks',
                query: query
            });

            if (response && response.success) {
                this.currentResults = response.results;
                this.lastQuery = query;
                
                // Cache the results for persistence
                await this.cacheResults(response.results, query);
                
                this.displayResults(response.results);
            } else {
                throw new Error(response.error || 'Search failed');
            }

        } catch (error) {
            console.error('Search error:', error);
            this.showStatus(`Search failed: ${error.message}`, 'error');
            this.showElement('noResults');
        } finally {
            // Reset search button
            this.searchBtn.disabled = false;
            this.searchBtn.textContent = 'Search';
            this.showLoading(false);
        }
    }

    async cacheResults(results, query) {
        try {
            await chrome.storage.local.set({
                lastSearchResults: results,
                lastSearchQuery: query,
                lastSearchTime: Date.now()
            });
            console.log(`Cached ${results.length} results for query: "${query}"`);
        } catch (error) {
            console.error('Error caching results:', error);
        }
    }

    async clearCachedResults() {
        try {
            // Clear from storage
            await chrome.storage.local.remove(['lastSearchResults', 'lastSearchQuery', 'lastSearchTime']);
            
            // Clear UI
            this.currentResults = [];
            this.lastQuery = '';
            this.searchInput.value = '';
            this.resultsContainer.innerHTML = '';
            
            // Hide results sections
            this.hideElements(['resultsSection']);
            
            this.showStatus('Results cleared', 'success');
            console.log('Cached results cleared');
        } catch (error) {
            console.error('Error clearing cached results:', error);
            this.showStatus('Error clearing results', 'error');
        }
    }

    displayResults(results) {
        if (!results || results.length === 0) {
            this.showElement('noResults');
            return;
        }

        // Update results count
        this.resultsCount.textContent = `${results.length} found`;

        // Clear previous results
        this.resultsContainer.innerHTML = '';

        // Display each result
        results.forEach((result, index) => {
            const resultElement = this.createResultElement(result, index);
            this.resultsContainer.appendChild(resultElement);
        });

        this.showElement('resultsSection');
        this.showElement('infoMessage');
        
        // Hide the info message after a few seconds
        setTimeout(() => {
            this.hideElements(['infoMessage']);
        }, 4000);
    }

    createResultElement(result, index) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';

        // Extract quality info
        const qualityBadge = this.getQualityBadge(result.title);

        const coverImg = result.cover ? 
            `<img src="${result.cover}" alt="Cover" class="result-cover">` : 
            '<div class="result-cover"></div>';
            
        resultDiv.innerHTML = `
            ${coverImg}
            <div class="result-info">
                <div class="result-title">${this.escapeHtml(result.title)}${qualityBadge}</div>
                <div class="result-domain">📡 ${result.domain}</div>
                <div class="result-actions">
                    <button class="result-btn download" data-index="${index}">⬇️ Download</button>
                    <button class="result-btn details" data-link="${this.escapeHtml(result.link)}">👁️ Details</button>
                </div>
            </div>
        `;
        
        // Add event listeners to buttons
        const downloadBtn = resultDiv.querySelector('.result-btn.download');
        const detailsBtn = resultDiv.querySelector('.result-btn.details');
        
        downloadBtn.addEventListener('click', () => this.downloadAudiobook(index));
        detailsBtn.addEventListener('click', () => this.openDetails(result.link));
        
        // Handle image load errors
        const img = resultDiv.querySelector('img');
        if (img) {
            img.addEventListener('error', () => {
                img.style.display = 'none';
            });
        }

        return resultDiv;
    }

    getQualityBadge(title) {
        const qualityMarkers = [
            { pattern: /flac/i, label: 'Lossless', class: 'quality-lossless' },
            { pattern: /320\s*kbps/i, label: 'High', class: 'quality-high' },
            { pattern: /128\s*kbps/i, label: 'Good', class: 'quality-good' },
            { pattern: /64\s*kbps/i, label: 'Standard', class: 'quality-standard' }
        ];

        for (const marker of qualityMarkers) {
            if (marker.pattern.test(title)) {
                return `<span class="quality-badge ${marker.class}">${marker.label}</span>`;
            }
        }

        return '';
    }

    async downloadAudiobook(index) {
        if (!this.currentResults[index]) {
            this.showStatus('Invalid result selected', 'error');
            return;
        }

        const result = this.currentResults[index];
        const downloadBtn = document.querySelector(`[data-index="${index}"]`);
        
        if (!downloadBtn) {
            this.showStatus('Download button not found', 'error');
            return;
        }

        try {
            // Update button state
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = '⏳ Adding...';
            downloadBtn.disabled = true;

            console.log('Downloading audiobook:', result.title);

            // Send download request to background script
            const response = await chrome.runtime.sendMessage({
                action: 'downloadAudiobook',
                data: {
                    link: result.link,
                    title: result.title
                }
            });

            if (response && response.success) {
                downloadBtn.textContent = '✅ Added';
                downloadBtn.style.background = '#4caf50';
                this.showStatus(`"${result.title}" added to downloads!`, 'success');

                // Reset button after delay
                setTimeout(() => {
                    downloadBtn.textContent = originalText;
                    downloadBtn.disabled = false;
                    downloadBtn.style.background = '';
                }, 2000);
            } else {
                throw new Error(response.error || 'Download failed');
            }

        } catch (error) {
            console.error('Download error:', error);
            downloadBtn.textContent = '❌ Failed';
            downloadBtn.style.background = '#f44336';
            this.showStatus(`Download failed: ${error.message}`, 'error');

            // Reset button after delay
            setTimeout(() => {
                downloadBtn.textContent = '⬇️ Download';
                downloadBtn.disabled = false;
                downloadBtn.style.background = '';
            }, 3000);
        }
    }

    openDetails(link) {
        // Open in new tab and keep popup open briefly
        chrome.tabs.create({ url: link });
        
        // Add visual feedback
        this.showStatus('Opening in new tab...', 'success');
        
        // Don't close popup immediately - let user see the feedback
        setTimeout(() => {
            if (window.close) {
                window.close();
            }
        }, 1000);
    }

    showStatus(message, type = 'info') {
        this.statusIndicator.textContent = message;
        this.statusIndicator.className = `status-indicator status-${type}`;
        this.statusIndicator.style.display = 'block';

        // Hide after delay
        setTimeout(() => {
            this.statusIndicator.style.display = 'none';
        }, 3000);
    }

    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
    }

    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.style.display = 'block';
        }
    }

    hideElements(elementIds) {
        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    async showStatus() {
        try {
            // Get torrent status from background script
            const response = await chrome.runtime.sendMessage({
                action: 'getTorrentStatus'
            });

            if (response && response.success) {
                this.displayTorrentStatus(response.torrents);
            } else {
                this.showStatus('Could not fetch status', 'error');
            }
        } catch (error) {
            console.error('Status error:', error);
            this.showStatus('Status unavailable', 'error');
        }
    }

    displayTorrentStatus(torrents) {
        // Create status modal or update UI to show torrent status
        // This would show active downloads, progress, etc.
        this.showStatus(`Found ${torrents ? torrents.length : 0} active downloads`, 'success');
    }

    showHelp() {
        const helpContent = `
            📚 AudiobookBay Downloader Help:

            🔍 Search: Enter book title or author to find audiobooks
            ⬇️ Download: Click to add audiobook to your torrent client
            👁️ Details: View full information on AudiobookBay
            ⚙️ Settings: Configure domains and torrent client
            📊 Status: View active downloads
            🗑️ Clear: Remove saved search results

            💡 Tips:
            - Configure your torrent client in Settings first
            - Add multiple AudiobookBay domains for better results
            - Search results are automatically saved between sessions
            - Click external links without losing your results
            - The extension works automatically on AudiobookBay pages
        `;

        alert(helpContent);
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize popup controller
let popupController;
document.addEventListener('DOMContentLoaded', () => {
    popupController = new PopupController();
});

// Make controller globally available for onclick handlers
window.popupController = popupController;
